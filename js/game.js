/* Parkplatz - game engine, rendering, input and flow.
   2D top-down Rush-Hour style puzzle. Mouse (and touch) drag controls,
   canvas rendering with animated vehicles, star ratings and progress. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- data
  const PUZZLES = (window.PARKPLATZ_PUZZLES || []).slice();
  const byId = {};
  PUZZLES.forEach((p) => { byId[p.id] = p; });

  const TIERS = ['leicht', 'mittel', 'schwer', 'sehr_schwer'];
  const TIER_ACCENT = {
    leicht: '#37c978', mittel: '#f2b134', schwer: '#f2724b', sehr_schwer: '#b45cf0',
  };

  // ---------------------------------------------------------------- layout constants (in cell units)
  const N = 6;
  const LEFT = 0.5, TOP = 0.5, BOTTOM = 0.5, EXITLANE = 1.0, RIGHTPAD = 0.15;
  const W_CELLS = LEFT + N + EXITLANE + RIGHTPAD;
  const H_CELLS = TOP + N + BOTTOM;

  const VEH_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
    '#f97316', '#84cc16', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#22c55e'];

  // ---------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  const screens = {
    menu: $('screen-menu'),
    levels: $('screen-levels'),
    game: $('screen-game'),
  };

  // ---------------------------------------------------------------- state
  let cs = 60;                 // cell size in css px
  let ox = 0, oy = 0;          // grid origin (top-left of cell 0,0)
  let dpr = 1;

  let level = null;            // current puzzle object
  let vehicles = [];           // working vehicle list (logical + animated)
  let moves = 0;
  let history = [];            // stack of snapshots for undo
  let targetVeh = null;
  const goalCol = N - 2;

  let drag = null;             // { veh, axis, startPointer, startAnim, min, max, moved }
  let phase = 'idle';          // 'idle' | 'winning' | 'won'
  let winT0 = 0;
  let hint = null;             // { index, axis, delta }
  let shakeVeh = null, shakeT0 = 0;
  let lastTs = 0;

  // ---------------------------------------------------------------- colour helpers
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const mix = (c) => Math.round((t - c) * p + c);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------------------------------------------------------------- setup a level
  function facingFor(v, i) {
    if (v.target) return 'E';
    if (v.orient === 'H') return (i % 2 === 0) ? 'E' : 'W';
    return (i % 2 === 0) ? 'S' : 'N';
  }

  function loadLevel(id) {
    level = byId[id];
    if (!level) return;
    moves = 0;
    history = [];
    hint = null;
    phase = 'idle';
    drag = null;
    let ci = 0;
    vehicles = level.vehicles.map((v, i) => {
      const color = v.target ? '#ff4d4f' : VEH_PALETTE[(ci++) % VEH_PALETTE.length];
      return {
        id: v.id, type: v.type, orient: v.orient, len: v.len,
        row: v.row, col: v.col, target: !!v.target,
        facing: facingFor(v, i), color,
        animX: 0, animY: 0,
      };
    });
    targetVeh = vehicles.find((v) => v.target);
    relayout();
    vehicles.forEach((v) => { const p = pxFor(v.row, v.col); v.animX = p.x; v.animY = p.y; });

    $('hud-level').textContent = id;
    $('hud-par').textContent = level.minMoves;
    $('hud-moves').textContent = 0;
    updateHudStars();
    showScreen('game');
  }

  // ---------------------------------------------------------------- geometry
  function pxFor(row, col) { return { x: ox + col * cs, y: oy + row * cs }; }

  function relayout() {
    const wrap = document.querySelector('.board-wrap');
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    cs = Math.floor(Math.min(availW / W_CELLS, availH / H_CELLS));
    cs = Math.max(34, cs);
    const cssW = Math.round(W_CELLS * cs);
    const cssH = Math.round(H_CELLS * cs);
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ox = LEFT * cs;
    oy = TOP * cs;
    if (vehicles.length) {
      vehicles.forEach((v) => { const p = pxFor(v.row, v.col); v.animX = p.x; v.animY = p.y; });
    }
  }

  // occupancy grid excluding one vehicle index
  function occupancy(exclude) {
    const g = Array.from({ length: N }, () => new Array(N).fill(false));
    for (let i = 0; i < vehicles.length; i++) {
      if (i === exclude) continue;
      const v = vehicles[i];
      for (let k = 0; k < v.len; k++) {
        const r = v.orient === 'H' ? v.row : v.row + k;
        const c = v.orient === 'H' ? v.col + k : v.col;
        g[r][c] = true;
      }
    }
    return g;
  }

  // free anchor range [minCell, maxCell] for a vehicle along its axis
  function freeRange(idx) {
    const v = vehicles[idx];
    const g = occupancy(idx);
    if (v.orient === 'H') {
      let minC = v.col, maxC = v.col;
      while (minC - 1 >= 0 && !g[v.row][minC - 1]) minC--;
      while (maxC + v.len <= N - 1 && !g[v.row][maxC + v.len]) maxC++;
      return { min: minC, max: maxC };
    }
    let minR = v.row, maxR = v.row;
    while (minR - 1 >= 0 && !g[minR - 1][v.col]) minR--;
    while (maxR + v.len <= N - 1 && !g[maxR + v.len][v.col]) maxR++;
    return { min: minR, max: maxR };
  }

  // ---------------------------------------------------------------- input
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  function vehicleAt(px, py) {
    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      const w = v.orient === 'H' ? v.len * cs : cs;
      const h = v.orient === 'H' ? cs : v.len * cs;
      if (px >= v.animX && px <= v.animX + w && py >= v.animY && py <= v.animY + h) return i;
    }
    return -1;
  }

  function onDown(e) {
    Sfx.unlock();
    if (phase !== 'idle') return;
    const p = pointerPos(e);
    const idx = vehicleAt(p.x, p.y);
    if (idx < 0) return;
    e.preventDefault();
    const v = vehicles[idx];
    const range = freeRange(idx);
    const start = pxFor(v.row, v.col);
    drag = {
      idx, axis: v.orient,
      startPointer: p,
      startX: start.x, startY: start.y,
      minX: ox + range.min * cs, maxX: ox + range.max * cs,
      minY: oy + range.min * cs, maxY: oy + range.max * cs,
      moved: false,
    };
    hint = null;
    Sfx.pick();
  }

  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    const p = pointerPos(e);
    const v = vehicles[drag.idx];
    if (drag.axis === 'H') {
      let x = drag.startX + (p.x - drag.startPointer.x);
      x = Math.max(drag.minX, Math.min(drag.maxX, x));
      v.animX = x;
      v.animY = drag.startY;
    } else {
      let y = drag.startY + (p.y - drag.startPointer.y);
      y = Math.max(drag.minY, Math.min(drag.maxY, y));
      v.animY = y;
      v.animX = drag.startX;
    }
    drag.moved = true;
  }

  function onUp() {
    if (!drag) return;
    const v = vehicles[drag.idx];
    let newCol = v.col, newRow = v.row;
    if (drag.axis === 'H') newCol = Math.round((v.animX - ox) / cs);
    else newRow = Math.round((v.animY - oy) / cs);
    const changed = (newCol !== v.col || newRow !== v.row);

    if (changed) {
      history.push(vehicles.map((k) => ({ row: k.row, col: k.col })));
      v.col = newCol; v.row = newRow;
      moves++;
      $('hud-moves').textContent = moves;
      updateHudStars();
      Sfx.move();
      setTimeout(() => Sfx.snap(), 60);
      if (v.target && v.col === goalCol) startWin();
    } else {
      // snap animation back handled by ease; if it truly can't move, a nudge
      const range = freeRange(drag.idx);
      if (range.min === range.max) { shakeVeh = drag.idx; shakeT0 = performance.now(); Sfx.blocked(); }
    }
    drag = null;
  }

  // ---------------------------------------------------------------- win
  function startWin() {
    phase = 'winning';
    winT0 = performance.now();
    Sfx.engineOut();
  }

  function finishWin() {
    phase = 'won';
    const stars = computeStars(moves);
    Storage.record(level.id, stars, moves);
    showWin(stars);
    refreshMenuProgress();
  }

  function computeStars(m) {
    const min = level.minMoves;
    if (m <= min) return 3;
    if (m <= min + Math.max(3, Math.round(min * 0.45))) return 2;
    return 1;
  }

  function updateHudStars() {
    const projected = computeStars(moves);
    for (let i = 1; i <= 3; i++) {
      $('hud-star-' + i).classList.toggle('dim', i > projected);
    }
  }

  // ---------------------------------------------------------------- rendering
  function drawBackground() {
    const W = W_CELLS * cs, H = H_CELLS * cs;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2c333f');
    g.addColorStop(1, '#232a34');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // parking lot slab
    const lx = ox - LEFT * cs * 0.55, ly = oy - TOP * cs * 0.55;
    const lw = N * cs + LEFT * cs * 0.55 + EXITLANE * cs + RIGHTPAD * cs;
    const lh = N * cs + (TOP + BOTTOM) * cs * 0.55;
    const lg = ctx.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, '#3a4150');
    lg.addColorStop(1, '#333a48');
    ctx.fillStyle = lg;
    roundRect(ctx, lx, ly, lw, lh, cs * 0.35);
    ctx.fill();

    // faint asphalt speckle
    ctx.save();
    roundRect(ctx, lx, ly, lw, lh, cs * 0.35);
    ctx.clip();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 40; i++) {
      const rx = lx + ((i * 97) % lw);
      const ry = ly + ((i * 53) % lh);
      ctx.fillRect(rx, ry, 2, 2);
    }
    ctx.restore();
  }

  function drawBaysAndWalls() {
    const gx = ox, gy = oy, gw = N * cs, gh = N * cs;

    // parking bay slots (light dashed lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, cs * 0.03);
    for (let c = 1; c < N; c++) {
      ctx.beginPath();
      ctx.moveTo(gx + c * cs, gy + cs * 0.12);
      ctx.lineTo(gx + c * cs, gy + gh - cs * 0.12);
      ctx.stroke();
    }
    for (let r = 1; r < N; r++) {
      ctx.beginPath();
      ctx.moveTo(gx + cs * 0.12, gy + r * cs);
      ctx.lineTo(gx + gw - cs * 0.12, gy + r * cs);
      ctx.stroke();
    }

    // curb walls (raised border) with a gap at the exit row on the right
    const wall = cs * 0.14;
    ctx.fillStyle = '#c9ced8';
    const drawWall = (x, y, w, h) => { roundRect(ctx, x, y, w, h, wall * 0.5); ctx.fill(); };
    drawWall(gx - wall, gy - wall, gw + 2 * wall, wall);            // top
    drawWall(gx - wall, gy + gh, gw + 2 * wall, wall);             // bottom
    drawWall(gx - wall, gy - wall, wall, gh + 2 * wall);          // left
    // right wall split around exit row
    const exY = gy + level.exitRow * cs;
    drawWall(gx + gw, gy - wall, wall, (level.exitRow * cs) + wall);
    drawWall(gx + gw, exY + cs, wall, gh - (level.exitRow + 1) * cs + wall);

    // exit markings: chevrons pointing out
    const ay = exY + cs / 2;
    const ax0 = gx + gw + wall * 1.2;
    const t = performance.now() / 1000;
    for (let k = 0; k < 3; k++) {
      const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3 - k * 0.7));
      ctx.strokeStyle = `rgba(120,230,150,${a})`;
      ctx.lineWidth = cs * 0.09;
      ctx.lineCap = 'round';
      const cx = ax0 + k * cs * 0.28;
      ctx.beginPath();
      ctx.moveTo(cx, ay - cs * 0.2);
      ctx.lineTo(cx + cs * 0.2, ay);
      ctx.lineTo(cx, ay + cs * 0.2);
      ctx.stroke();
    }
    // exit lane markings on the ground
    ctx.strokeStyle = 'rgba(120,230,150,0.18)';
    ctx.lineWidth = cs * 0.03;
    ctx.setLineDash([cs * 0.12, cs * 0.12]);
    ctx.beginPath(); ctx.moveTo(gx + gw, exY + cs * 0.06); ctx.lineTo(gx + gw + EXITLANE * cs, exY + cs * 0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx + gw, exY + cs * 0.94); ctx.lineTo(gx + gw + EXITLANE * cs, exY + cs * 0.94); ctx.stroke();
    ctx.setLineDash([]);
  }

  // draw a vehicle centered at origin, length along +X (front at +X)
  function drawVehicleLocal(lenPx, widPx, v) {
    const c = ctx;
    const hl = lenPx / 2, hw = widPx / 2;
    const base = v.color;

    // shadow
    c.save();
    c.globalAlpha = 0.28;
    c.fillStyle = '#000';
    roundRect(c, -hl + cs * 0.05, -hw + cs * 0.11, lenPx, widPx, widPx * 0.3);
    c.fill();
    c.restore();

    if (v.type === 'moto') return drawMoto(lenPx, widPx, v);

    // body gradient
    const grad = c.createLinearGradient(0, -hw, 0, hw);
    grad.addColorStop(0, shade(base, 0.28));
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, shade(base, -0.22));
    c.fillStyle = grad;
    const r = v.type === 'bus' ? widPx * 0.22 : widPx * 0.34;
    roundRect(c, -hl, -hw, lenPx, widPx, r);
    c.fill();

    // top highlight strip
    c.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(c, -hl + widPx * 0.12, -hw + widPx * 0.1, lenPx - widPx * 0.24, widPx * 0.18, widPx * 0.1);
    c.fill();

    if (v.type === 'car') drawCarDetails(lenPx, widPx, v);
    else if (v.type === 'truck') drawTruckDetails(lenPx, widPx, v);
    else if (v.type === 'bus') drawBusDetails(lenPx, widPx, v);

    // wheels (dark stubs on the long sides)
    c.fillStyle = 'rgba(20,22,28,0.85)';
    const wheelW = lenPx * (v.type === 'bus' ? 0.12 : 0.16);
    const wheelH = widPx * 0.12;
    const wxs = v.type === 'car'
      ? [-hl + lenPx * 0.22, hl - lenPx * 0.22]
      : [-hl + lenPx * 0.18, 0, hl - lenPx * 0.18];
    wxs.forEach((wx) => {
      roundRect(c, wx - wheelW / 2, -hw - wheelH * 0.5, wheelW, wheelH, wheelH * 0.4);
      c.fill();
      roundRect(c, wx - wheelW / 2, hw - wheelH * 0.5, wheelW, wheelH, wheelH * 0.4);
      c.fill();
    });
  }

  function glass() { return 'rgba(150,205,230,0.9)'; }

  function drawCarDetails(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2;
    // cabin / roof
    c.fillStyle = shade(v.color, -0.32);
    roundRect(c, -lenPx * 0.22, -hw + widPx * 0.16, lenPx * 0.5, widPx * 0.68, widPx * 0.18);
    c.fill();
    // windshield (front, +X)
    c.fillStyle = glass();
    roundRect(c, lenPx * 0.10, -hw + widPx * 0.2, lenPx * 0.16, widPx * 0.6, widPx * 0.12);
    c.fill();
    // rear window
    roundRect(c, -lenPx * 0.26, -hw + widPx * 0.22, lenPx * 0.12, widPx * 0.56, widPx * 0.1);
    c.fill();
    // headlights
    c.fillStyle = 'rgba(255,244,200,0.95)';
    roundRect(c, hl - lenPx * 0.06, -hw + widPx * 0.18, lenPx * 0.05, widPx * 0.2, 2);
    c.fill();
    roundRect(c, hl - lenPx * 0.06, hw - widPx * 0.38, lenPx * 0.05, widPx * 0.2, 2);
    c.fill();
  }

  function drawTruckDetails(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2;
    // cargo box (rear 2/3)
    c.fillStyle = shade(v.color, -0.12);
    roundRect(c, -hl + lenPx * 0.04, -hw + widPx * 0.12, lenPx * 0.6, widPx * 0.76, widPx * 0.1);
    c.fill();
    // ridges on the box
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = Math.max(1, cs * 0.02);
    for (let i = 1; i < 4; i++) {
      const x = -hl + lenPx * 0.04 + (lenPx * 0.6) * (i / 4);
      c.beginPath(); c.moveTo(x, -hw + widPx * 0.16); c.lineTo(x, hw - widPx * 0.16); c.stroke();
    }
    // cab windshield near front
    c.fillStyle = glass();
    roundRect(c, hl - lenPx * 0.2, -hw + widPx * 0.2, lenPx * 0.1, widPx * 0.6, widPx * 0.1);
    c.fill();
    // headlights
    c.fillStyle = 'rgba(255,244,200,0.95)';
    roundRect(c, hl - lenPx * 0.05, -hw + widPx * 0.18, lenPx * 0.04, widPx * 0.2, 2); c.fill();
    roundRect(c, hl - lenPx * 0.05, hw - widPx * 0.38, lenPx * 0.04, widPx * 0.2, 2); c.fill();
  }

  function drawBusDetails(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2;
    // window strips along both sides
    c.fillStyle = glass();
    const winCount = 5;
    const startX = -hl + lenPx * 0.14;
    const spanX = lenPx * 0.72;
    const wW = (spanX / winCount) * 0.7;
    for (let i = 0; i < winCount; i++) {
      const x = startX + (spanX / winCount) * i + (spanX / winCount - wW) / 2;
      roundRect(c, x, -hw + widPx * 0.14, wW, widPx * 0.2, widPx * 0.05); c.fill();
      roundRect(c, x, hw - widPx * 0.34, wW, widPx * 0.2, widPx * 0.05); c.fill();
    }
    // front windshield
    roundRect(c, hl - lenPx * 0.1, -hw + widPx * 0.22, lenPx * 0.05, widPx * 0.56, widPx * 0.08); c.fill();
    // roof line
    c.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(c, -hl + lenPx * 0.06, -widPx * 0.06, lenPx * 0.88, widPx * 0.12, widPx * 0.06); c.fill();
  }

  function drawMoto(lenPx, widPx, v) {
    const c = ctx;
    const bodyLen = lenPx * 0.78, bodyWid = widPx * 0.42;
    const grad = c.createLinearGradient(0, -bodyWid, 0, bodyWid);
    grad.addColorStop(0, shade(v.color, 0.3));
    grad.addColorStop(1, shade(v.color, -0.25));
    // wheels
    c.fillStyle = 'rgba(18,20,26,0.9)';
    roundRect(c, -bodyLen / 2 - lenPx * 0.02, -bodyWid * 0.5, lenPx * 0.16, bodyWid, bodyWid * 0.4); c.fill();
    roundRect(c, bodyLen / 2 - lenPx * 0.14, -bodyWid * 0.5, lenPx * 0.16, bodyWid, bodyWid * 0.4); c.fill();
    // frame/body
    c.fillStyle = grad;
    roundRect(c, -bodyLen / 2, -bodyWid / 2, bodyLen, bodyWid, bodyWid * 0.5); c.fill();
    // seat
    c.fillStyle = shade(v.color, -0.4);
    roundRect(c, -bodyLen * 0.3, -bodyWid * 0.42, bodyLen * 0.34, bodyWid * 0.84, bodyWid * 0.3); c.fill();
    // handlebars
    c.strokeStyle = 'rgba(20,22,28,0.8)';
    c.lineWidth = Math.max(1.5, cs * 0.04); c.lineCap = 'round';
    c.beginPath();
    c.moveTo(bodyLen * 0.24, -bodyWid * 0.7); c.lineTo(bodyLen * 0.24, bodyWid * 0.7); c.stroke();
    // headlight
    c.fillStyle = 'rgba(255,244,200,0.95)';
    c.beginPath(); c.arc(bodyLen * 0.42, 0, bodyWid * 0.22, 0, Math.PI * 2); c.fill();
  }

  function angleFor(v) {
    switch (v.facing) {
      case 'E': return 0;
      case 'W': return Math.PI;
      case 'S': return Math.PI / 2;
      case 'N': return -Math.PI / 2;
      default: return 0;
    }
  }

  function drawVehicle(v, i) {
    const w = v.orient === 'H' ? v.len * cs : cs;
    const h = v.orient === 'H' ? cs : v.len * cs;
    const inset = cs * 0.11;
    const cx = v.animX + w / 2;
    const cy = v.animY + h / 2;
    const lenPx = v.len * cs - inset * 2;
    const widPx = cs - inset * 2;

    ctx.save();
    ctx.translate(cx, cy);
    // shake nudge
    if (shakeVeh === i) {
      const dt = performance.now() - shakeT0;
      if (dt < 300) {
        const s = Math.sin(dt / 22) * (1 - dt / 300) * cs * 0.06;
        if (v.orient === 'H') ctx.translate(s, 0); else ctx.translate(0, s);
      } else shakeVeh = null;
    }
    ctx.rotate(angleFor(v));
    // target glow
    if (v.target && phase !== 'won') {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
      ctx.shadowColor = `rgba(255,90,95,${0.5 + pulse * 0.4})`;
      ctx.shadowBlur = cs * (0.25 + pulse * 0.2);
    }
    drawVehicleLocal(lenPx, widPx, v);
    ctx.restore();
  }

  function drawHint() {
    if (!hint || phase !== 'idle') return;
    const v = vehicles[hint.index];
    const w = v.orient === 'H' ? v.len * cs : cs;
    const h = v.orient === 'H' ? cs : v.len * cs;
    const cx = v.animX + w / 2, cy = v.animY + h / 2;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + pulse * 0.5})`;
    ctx.lineWidth = cs * 0.06;
    roundRect(ctx, v.animX + cs * 0.05, v.animY + cs * 0.05, w - cs * 0.1, h - cs * 0.1, cs * 0.2);
    ctx.stroke();
    // arrow
    const dir = Math.sign(hint.delta);
    const off = (cs * 0.55) * (0.8 + pulse * 0.4);
    let ax = cx, ay = cy;
    if (hint.axis === 'H') ax += dir * (w / 2 + off); else ay += dir * (h / 2 + off);
    ctx.translate(ax, ay);
    if (hint.axis === 'H') ctx.rotate(dir > 0 ? 0 : Math.PI);
    else ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = `rgba(120,230,150,${0.7 + pulse * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(cs * 0.24, 0); ctx.lineTo(-cs * 0.12, -cs * 0.18); ctx.lineTo(-cs * 0.12, cs * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function render(ts) {
    const dt = Math.min(40, ts - lastTs || 16);
    lastTs = ts;

    // animate positions toward logical cells (except the actively dragged one)
    const ease = 1 - Math.pow(0.001, dt / 1000);
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (drag && drag.idx === i) continue;
      if (phase === 'winning' && v.target) continue;
      const p = pxFor(v.row, v.col);
      v.animX += (p.x - v.animX) * ease;
      v.animY += (p.y - v.animY) * ease;
    }

    // winning slide-out
    if (phase === 'winning') {
      const t = (ts - winT0) / 650;
      const startX = pxFor(targetVeh.row, targetVeh.col).x;
      const endX = ox + N * cs + (EXITLANE + 0.6) * cs;
      const e = t < 1 ? (1 - Math.pow(1 - t, 3)) : 1;
      targetVeh.animX = startX + (endX - startX) * e;
      if (t >= 1) finishWin();
    }

    ctx.clearRect(0, 0, W_CELLS * cs, H_CELLS * cs);
    drawBackground();
    if (level) drawBaysAndWalls();

    // draw non-dragged first, dragged last (on top)
    for (let i = 0; i < vehicles.length; i++) {
      if (drag && drag.idx === i) continue;
      drawVehicle(vehicles[i], i);
    }
    if (drag) drawVehicle(vehicles[drag.idx], drag.idx);
    drawHint();

    requestAnimationFrame(render);
  }

  // ---------------------------------------------------------------- screens
  function showScreen(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('active', k === name));
    if (name === 'levels') buildLevelSelect();
    if (name === 'menu') refreshMenuProgress();
    if (name === 'game') setTimeout(relayout, 0);
  }

  function refreshMenuProgress() {
    const t = Storage.totals();
    $('menu-solved').textContent = t.solved;
    $('menu-stars').textContent = t.stars;
  }

  // ---------------------------------------------------------------- level select
  function buildLevelSelect() {
    const cont = $('levels-container');
    cont.innerHTML = '';
    TIERS.forEach((tier) => {
      const puzzles = PUZZLES.filter((p) => p.difficulty === tier);
      let solved = 0;
      puzzles.forEach((p) => { if (Storage.getLevel(p.id)) solved++; });

      const section = document.createElement('div');
      section.className = 'tier-section';
      const head = document.createElement('div');
      head.className = 'tier-head';
      head.style.setProperty('--accent', TIER_ACCENT[tier]);
      head.innerHTML = `<span class="tier-dot"></span><span class="tier-name">${I18n.t(tier)}</span>
        <span class="tier-count">${solved}/${puzzles.length}</span>`;
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'level-grid';
      puzzles.forEach((p) => {
        const rec = Storage.getLevel(p.id);
        const btn = document.createElement('button');
        btn.className = 'level-btn' + (rec ? ' done' : '');
        btn.style.setProperty('--accent', TIER_ACCENT[tier]);
        const stars = rec ? rec.stars : 0;
        let starHtml = '<span class="lvl-stars">';
        for (let s = 0; s < 3; s++) starHtml += `<i class="${s < stars ? 'on' : ''}">★</i>`;
        starHtml += '</span>';
        btn.innerHTML = `<span class="lvl-num">${p.id}</span>${starHtml}`;
        btn.addEventListener('click', () => { Sfx.unlock(); Sfx.click(); loadLevel(p.id); });
        grid.appendChild(btn);
      });
      section.appendChild(grid);
      cont.appendChild(section);
    });
  }

  // ---------------------------------------------------------------- win overlay
  function showWin(stars) {
    const overlay = $('overlay-win');
    $('win-moves').textContent = moves;
    $('win-par').textContent = level.minMoves;
    const allDone = Storage.totals().solved >= PUZZLES.length;
    $('win-msg').textContent = allDone ? I18n.t('allDone') : I18n.t('msg' + stars);
    const starEls = overlay.querySelectorAll('.win-star');
    starEls.forEach((el) => el.classList.remove('on', 'pop'));
    overlay.classList.add('show');
    Sfx.win();
    // animate stars in
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (i < stars) {
          starEls[i].classList.add('on', 'pop');
          Sfx.star(i);
        }
      }, 350 + i * 260);
    }
    // next button label / availability
    const nextBtn = $('btn-win-next');
    nextBtn.style.display = byId[level.id + 1] ? '' : 'none';
  }
  function hideWin() { $('overlay-win').classList.remove('show'); }

  // ---------------------------------------------------------------- controls
  function doUndo() {
    if (phase !== 'idle' || !history.length) return;
    const prev = history.pop();
    prev.forEach((s, i) => { vehicles[i].row = s.row; vehicles[i].col = s.col; });
    moves = Math.max(0, moves - 1);
    $('hud-moves').textContent = moves;
    updateHudStars();
    hint = null;
    Sfx.click();
  }

  function doRestart() {
    if (!level) return;
    loadLevel(level.id);
    Sfx.click();
  }

  function doHint() {
    if (phase !== 'idle' || !level) return;
    Sfx.click();
    let res = null;
    try { res = Solver.solveNext(N, vehicles); } catch (e) { res = null; }
    if (!res) {
      // maybe already solvable straight out
      if (targetVeh && freeRange(vehicles.indexOf(targetVeh)).max >= goalCol) {
        hint = { index: vehicles.indexOf(targetVeh), axis: 'H', delta: 1 };
      }
      return;
    }
    hint = res;
  }

  // ---------------------------------------------------------------- sound button
  function updateSoundBtn() {
    $('btn-sound').classList.toggle('muted', !Sfx.enabled);
  }

  // ---------------------------------------------------------------- wire up
  function init() {
    // language
    let lang = Storage.lang;
    if (!lang) lang = (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
    I18n.set(lang);
    Storage.setLang(lang);

    Sfx.setEnabled(Storage.soundOn);
    updateSoundBtn();
    refreshMenuProgress();

    // nav
    $('btn-home').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); showScreen('menu'); });
    $('btn-play').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); showScreen('levels'); });
    $('btn-back').addEventListener('click', () => { Sfx.click(); showScreen('levels'); });
    $('btn-howto').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); $('overlay-howto').classList.add('show'); });
    $('btn-howto-close').addEventListener('click', () => { Sfx.click(); $('overlay-howto').classList.remove('show'); });

    $('btn-lang').addEventListener('click', () => {
      const l = I18n.toggle();
      Storage.setLang(l);
      if (screens.levels.classList.contains('active')) buildLevelSelect();
      Sfx.click();
    });

    $('btn-sound').addEventListener('click', () => {
      Sfx.unlock();
      const on = !Sfx.enabled;
      Sfx.setEnabled(on);
      Storage.setSound(on);
      updateSoundBtn();
      if (on) Sfx.click();
    });

    $('btn-undo').addEventListener('click', doUndo);
    $('btn-restart').addEventListener('click', doRestart);
    $('btn-hint').addEventListener('click', doHint);

    $('btn-win-retry').addEventListener('click', () => { Sfx.click(); hideWin(); loadLevel(level.id); });
    $('btn-win-levels').addEventListener('click', () => { Sfx.click(); hideWin(); showScreen('levels'); });
    $('btn-win-next').addEventListener('click', () => {
      Sfx.click(); hideWin();
      if (byId[level.id + 1]) loadLevel(level.id + 1); else showScreen('levels');
    });

    // pointer input
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    window.addEventListener('resize', () => { if (screens.game.classList.contains('active')) relayout(); });
    document.addEventListener('langchange', () => {
      if (screens.levels.classList.contains('active')) buildLevelSelect();
    });

    if (!PUZZLES.length) {
      document.querySelector('.menu-sub').textContent = 'Fehler: Rätseldaten nicht geladen.';
    }

    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
