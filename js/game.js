/* Parkplatz - game engine, rendering, input and flow.
   2D top-down Rush-Hour style puzzle. Mouse/touch/keyboard controls, canvas
   rendering with animated vehicles, themes, colorblind patterns, particles,
   star ratings, star-gating, level editor, daily & random puzzles. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- data
  const PUZZLES = (window.PARKPLATZ_PUZZLES || []).slice();
  const byId = {};
  PUZZLES.forEach((p) => { byId[p.id] = p; });

  const TIERS = ['leicht', 'mittel', 'schwer', 'sehr_schwer'];
  const TIER_ACCENT = { leicht: '#37c978', mittel: '#f2b134', schwer: '#f2724b', sehr_schwer: '#b45cf0' };
  // total campaign stars required to unlock each tier
  const GATE = { leicht: 0, mittel: 18, schwer: 45, sehr_schwer: 80 };

  // ---------------------------------------------------------------- layout (cell units)
  const N = 6, EXIT_ROW = 2;
  const LEFT = 0.5, TOP = 0.5, BOTTOM = 0.5, EXITLANE = 1.0, RIGHTPAD = 0.15;
  const W_CELLS = LEFT + N + EXITLANE + RIGHTPAD;
  const H_CELLS = TOP + N + BOTTOM;
  const goalCol = N - 2;

  const VEH_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
    '#f97316', '#84cc16', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#22c55e'];

  const THEMES = {
    tag: { bgTop: '#2c333f', bgBot: '#232a34', lotTop: '#3a4150', lotBot: '#333a48', wall: '#c9ced8', line: 'rgba(255,255,255,0.16)', exit: '120,230,150', speckle: '0,0,0' },
    nacht: { bgTop: '#10141d', bgBot: '#0b0e15', lotTop: '#1b2230', lotBot: '#161c28', wall: '#737d92', line: 'rgba(255,255,255,0.10)', exit: '87,224,142', speckle: '0,0,0' },
    neon: { bgTop: '#160f2e', bgBot: '#0c0820', lotTop: '#221a40', lotBot: '#171030', wall: '#8b7cf5', line: 'rgba(180,150,255,0.20)', exit: '42,240,200', speckle: '90,60,160' },
  };

  // ---------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const boardCanvas = $('board');
  const boardCtx = boardCanvas.getContext('2d');
  const editCanvas = $('edit-canvas');
  const editCtx = editCanvas.getContext('2d');
  const fxCanvas = $('fx-canvas');
  const fxCtx = fxCanvas.getContext('2d');

  const screens = {
    menu: $('screen-menu'), levels: $('screen-levels'), random: $('screen-random'),
    settings: $('screen-settings'), editor: $('screen-editor'), game: $('screen-game'),
  };

  // ---------------------------------------------------------------- state
  let mode = 'none';           // 'play' | 'edit' | 'none'
  let canvas = boardCanvas, ctx = boardCtx;
  let cs = 60, ox = 0, oy = 0, dpr = 1;

  let THEME = THEMES.tag;
  let colorblind = false;
  let reduceMotion = false;

  let level = null;            // current puzzle
  let ctxSource = { source: 'campaign' };
  let vehicles = [];
  let moves = 0;
  let history = [];
  let targetVeh = null;

  let drag = null;
  let phase = 'idle';          // 'idle' | 'winning' | 'won'
  let winT0 = 0;
  let hint = null;
  let shakeVeh = null, shakeT0 = 0;
  let lastTs = 0;

  let selIndex = null;         // keyboard-selected vehicle
  let slideCtx = null;         // { index, dir } for merged keyboard slides

  let particles = [];

  // editor state
  let editVehicles = [];
  let curTool = 'car';
  let curOrient = 'H';

  // ---------------------------------------------------------------- colour helpers
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex); const t = amt < 0 ? 0 : 255; const p = Math.abs(amt);
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

  function colorForIndex(i, target) { return target ? '#ff4d4f' : VEH_PALETTE[i % VEH_PALETTE.length]; }
  function facingFor(v, i) {
    if (v.target) return 'E';
    if (v.orient === 'H') return (i % 2 === 0) ? 'E' : 'W';
    return (i % 2 === 0) ? 'S' : 'N';
  }

  // ---------------------------------------------------------------- load a puzzle
  function makeVehicles(src) {
    let ci = 0;
    return src.map((v, i) => ({
      id: v.id || (v.target ? 'target' : 'v' + i), type: v.type, orient: v.orient, len: v.len,
      row: v.row, col: v.col, target: !!v.target,
      facing: facingFor(v, i), color: colorForIndex(v.target ? 0 : ci++, v.target),
      pattern: v.target ? -1 : (i % 5), animX: 0, animY: 0,
    }));
  }

  function loadPuzzle(puzzle, context) {
    level = puzzle;
    ctxSource = context || { source: 'campaign' };
    moves = 0; history = []; hint = null; phase = 'idle'; drag = null;
    selIndex = null; slideCtx = null; particles = [];
    vehicles = makeVehicles(puzzle.vehicles);
    targetVeh = vehicles.find((v) => v.target);
    mode = 'play'; canvas = boardCanvas; ctx = boardCtx;
    setScreen('game');
    relayout();
    vehicles.forEach((v) => { const p = pxFor(v.row, v.col); v.animX = p.x; v.animY = p.y; });
    $('hud-par').textContent = puzzle.minMoves;
    $('hud-moves').textContent = 0;
    updateHudMode();
    updateHudStars();
    // shareable deep link for campaign levels
    if (ctxSource.source === 'campaign') {
      try { history_replace('?level=' + puzzle.id); } catch (e) { /* ignore */ }
    } else {
      try { history_replace(location.pathname); } catch (e) { /* ignore */ }
    }
  }
  function history_replace(url) { window.history.replaceState(null, '', url); }

  function updateHudMode() {
    const el = $('hud-mode-label'); const val = $('hud-level');
    const s = ctxSource.source;
    if (s === 'campaign') { el.textContent = I18n.t('levelWord'); val.textContent = level.id; }
    else if (s === 'daily') { el.textContent = I18n.t('dailyBadge'); val.textContent = ctxSource.date ? ctxSource.date.slice(5) : '★'; }
    else if (s === 'random') { el.textContent = I18n.t('randomBadge'); val.textContent = I18n.t(level.difficulty || 'mittel'); }
    else if (s === 'custom') { el.textContent = I18n.t('customBadge'); val.textContent = ctxSource.name || ''; }
    else { el.textContent = I18n.t('test'); val.textContent = ''; }
    // sharing only makes sense for stable links (campaign / daily)
    $('btn-share').style.display = (s === 'campaign' || s === 'daily') ? '' : 'none';
  }

  // ---------------------------------------------------------------- geometry
  function pxFor(row, col) { return { x: ox + col * cs, y: oy + row * cs }; }

  function relayout() {
    const wrap = canvas.parentElement;
    const availW = wrap.clientWidth, availH = wrap.clientHeight;
    cs = Math.max(30, Math.floor(Math.min(availW / W_CELLS, availH / H_CELLS)));
    const cssW = Math.round(W_CELLS * cs), cssH = Math.round(H_CELLS * cs);
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ox = LEFT * cs; oy = TOP * cs;
    if (mode === 'play' && vehicles.length) vehicles.forEach((v) => { const p = pxFor(v.row, v.col); v.animX = p.x; v.animY = p.y; });
    sizeFx();
  }
  function sizeFx() {
    const r = document.getElementById('app').getBoundingClientRect();
    fxCanvas.width = Math.round(r.width * (window.devicePixelRatio || 1));
    fxCanvas.height = Math.round(r.height * (window.devicePixelRatio || 1));
    fxCanvas.style.width = r.width + 'px'; fxCanvas.style.height = r.height + 'px';
    fxCtx.setTransform((window.devicePixelRatio || 1), 0, 0, (window.devicePixelRatio || 1), 0, 0);
  }

  function occupancy(list, exclude) {
    const g = Array.from({ length: N }, () => new Array(N).fill(false));
    for (let i = 0; i < list.length; i++) {
      if (i === exclude) continue;
      const v = list[i];
      for (let k = 0; k < v.len; k++) {
        const r = v.orient === 'H' ? v.row : v.row + k;
        const c = v.orient === 'H' ? v.col + k : v.col;
        if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = true;
      }
    }
    return g;
  }
  function freeRange(idx) {
    const v = vehicles[idx], g = occupancy(vehicles, idx);
    if (v.orient === 'H') {
      let a = v.col, b = v.col;
      while (a - 1 >= 0 && !g[v.row][a - 1]) a--;
      while (b + v.len <= N - 1 && !g[v.row][b + v.len]) b++;
      return { min: a, max: b };
    }
    let a = v.row, b = v.row;
    while (a - 1 >= 0 && !g[a - 1][v.col]) a--;
    while (b + v.len <= N - 1 && !g[b + v.len][v.col]) b++;
    return { min: a, max: b };
  }

  // ---------------------------------------------------------------- pointer input (play)
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
    Sfx.unlock(); tryStartMusic();
    if (mode !== 'play' || phase !== 'idle') return;
    const p = pointerPos(e);
    const idx = vehicleAt(p.x, p.y);
    if (idx < 0) return;
    e.preventDefault();
    const v = vehicles[idx];
    const range = freeRange(idx);
    const start = pxFor(v.row, v.col);
    drag = {
      idx, axis: v.orient, startPointer: p, startX: start.x, startY: start.y,
      minX: ox + range.min * cs, maxX: ox + range.max * cs,
      minY: oy + range.min * cs, maxY: oy + range.max * cs, moved: false,
    };
    selIndex = idx; slideCtx = null; hint = null;
    Sfx.pick();
  }
  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    const p = pointerPos(e);
    const v = vehicles[drag.idx];
    if (drag.axis === 'H') { let x = drag.startX + (p.x - drag.startPointer.x); x = Math.max(drag.minX, Math.min(drag.maxX, x)); v.animX = x; v.animY = drag.startY; }
    else { let y = drag.startY + (p.y - drag.startPointer.y); y = Math.max(drag.minY, Math.min(drag.maxY, y)); v.animY = y; v.animX = drag.startX; }
    drag.moved = true;
  }
  function onUp() {
    if (!drag) return;
    const v = vehicles[drag.idx];
    let newCol = v.col, newRow = v.row;
    if (drag.axis === 'H') newCol = Math.round((v.animX - ox) / cs);
    else newRow = Math.round((v.animY - oy) / cs);
    if (newCol !== v.col || newRow !== v.row) {
      commitMove(drag.idx, newRow, newCol);
      slideCtx = null;
    } else {
      const range = freeRange(drag.idx);
      if (range.min === range.max) { shakeVeh = drag.idx; shakeT0 = performance.now(); Sfx.blocked(); }
    }
    drag = null;
  }

  // record a move to (newRow,newCol); merge=true continues a keyboard slide
  function commitMove(idx, newRow, newCol, merge) {
    const v = vehicles[idx];
    if (!merge) { history.push(vehicles.map((k) => ({ row: k.row, col: k.col }))); moves++; }
    v.row = newRow; v.col = newCol;
    $('hud-moves').textContent = moves;
    updateHudStars();
    Sfx.move(); setTimeout(() => Sfx.snap(), 55);
    if (v.target && v.col === goalCol) startWin();
  }

  // ---------------------------------------------------------------- keyboard
  function onKey(e) {
    if (mode !== 'play' || phase !== 'idle') return;
    const k = e.key;
    if (k === 'Tab') {
      e.preventDefault();
      const step = e.shiftKey ? -1 : 1;
      selIndex = selIndex == null ? 0 : (selIndex + step + vehicles.length) % vehicles.length;
      slideCtx = null; return;
    }
    let axis = null, dir = 0;
    if (k === 'ArrowLeft') { axis = 'H'; dir = -1; }
    else if (k === 'ArrowRight') { axis = 'H'; dir = 1; }
    else if (k === 'ArrowUp') { axis = 'V'; dir = -1; }
    else if (k === 'ArrowDown') { axis = 'V'; dir = 1; }
    else if (k === 'u' || k === 'z') { doUndo(); return; }
    else return;
    e.preventDefault();
    if (selIndex == null) selIndex = vehicles.indexOf(targetVeh);
    const v = vehicles[selIndex];
    if (v.orient !== axis) { slideCtx = null; return; }
    const range = freeRange(selIndex);
    let nr = v.row, nc = v.col;
    if (axis === 'H') { nc = v.col + dir; if (nc < range.min || nc > range.max) { Sfx.blocked(); return; } }
    else { nr = v.row + dir; if (nr < range.min || nr > range.max) { Sfx.blocked(); return; } }
    const cont = slideCtx && slideCtx.index === selIndex && slideCtx.dir === dir;
    commitMove(selIndex, nr, nc, cont);
    slideCtx = { index: selIndex, dir };
  }

  // ---------------------------------------------------------------- win
  function startWin() {
    phase = 'winning'; winT0 = performance.now(); Sfx.engineOut();
    // Fallback so the win always resolves even if requestAnimationFrame is
    // throttled (background tab) and never advances the drive-out animation.
    const dur = reduceMotion ? 200 : 650;
    setTimeout(() => { if (phase === 'winning') finishWin(); }, dur + 120);
  }
  function finishWin() {
    phase = 'won';
    const stars = computeStars(moves);
    recordResult(stars, moves);
    if (!reduceMotion) spawnConfetti();
    showWin(stars);
    refreshMenuProgress();
  }
  function recordResult(stars, m) {
    const s = ctxSource.source;
    if (s === 'campaign') Storage.record(level.id, stars, m);
    else if (s === 'daily') Storage.recordDaily(ctxSource.date, stars, m);
    else if (s === 'custom') Storage.recordCustom(ctxSource.id, stars, m);
  }
  function computeStars(m) {
    const min = level.minMoves;
    if (m <= min) return 3;
    if (m <= min + Math.max(3, Math.round(min * 0.45))) return 2;
    return 1;
  }
  function updateHudStars() {
    const projected = computeStars(moves);
    for (let i = 1; i <= 3; i++) $('hud-star-' + i).classList.toggle('dim', i > projected);
  }

  // ---------------------------------------------------------------- rendering
  function drawBackground() {
    const W = W_CELLS * cs, H = H_CELLS * cs;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, THEME.bgTop); g.addColorStop(1, THEME.bgBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const lx = ox - LEFT * cs * 0.55, ly = oy - TOP * cs * 0.55;
    const lw = N * cs + LEFT * cs * 0.55 + EXITLANE * cs + RIGHTPAD * cs;
    const lh = N * cs + (TOP + BOTTOM) * cs * 0.55;
    const lg = ctx.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, THEME.lotTop); lg.addColorStop(1, THEME.lotBot);
    ctx.fillStyle = lg; roundRect(ctx, lx, ly, lw, lh, cs * 0.35); ctx.fill();
    ctx.save(); roundRect(ctx, lx, ly, lw, lh, cs * 0.35); ctx.clip();
    ctx.globalAlpha = 0.05; ctx.fillStyle = 'rgb(' + THEME.speckle + ')';
    for (let i = 0; i < 40; i++) ctx.fillRect(lx + ((i * 97) % lw), ly + ((i * 53) % lh), 2, 2);
    ctx.restore();
  }
  function drawBaysAndWalls() {
    const gx = ox, gy = oy, gw = N * cs, gh = N * cs;
    ctx.strokeStyle = THEME.line; ctx.lineWidth = Math.max(1, cs * 0.03);
    for (let c = 1; c < N; c++) { ctx.beginPath(); ctx.moveTo(gx + c * cs, gy + cs * 0.12); ctx.lineTo(gx + c * cs, gy + gh - cs * 0.12); ctx.stroke(); }
    for (let r = 1; r < N; r++) { ctx.beginPath(); ctx.moveTo(gx + cs * 0.12, gy + r * cs); ctx.lineTo(gx + gw - cs * 0.12, gy + r * cs); ctx.stroke(); }
    const wall = cs * 0.14;
    ctx.fillStyle = THEME.wall;
    const dw = (x, y, w, h) => { roundRect(ctx, x, y, w, h, wall * 0.5); ctx.fill(); };
    dw(gx - wall, gy - wall, gw + 2 * wall, wall);
    dw(gx - wall, gy + gh, gw + 2 * wall, wall);
    dw(gx - wall, gy - wall, wall, gh + 2 * wall);
    const exY = gy + EXIT_ROW * cs;
    dw(gx + gw, gy - wall, wall, (EXIT_ROW * cs) + wall);
    dw(gx + gw, exY + cs, wall, gh - (EXIT_ROW + 1) * cs + wall);
    const ay = exY + cs / 2, ax0 = gx + gw + wall * 1.2, t = performance.now() / 1000;
    for (let kk = 0; kk < 3; kk++) {
      const a = reduceMotion ? 0.6 : 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3 - kk * 0.7));
      ctx.strokeStyle = `rgba(${THEME.exit},${a})`; ctx.lineWidth = cs * 0.09; ctx.lineCap = 'round';
      const cx = ax0 + kk * cs * 0.28;
      ctx.beginPath(); ctx.moveTo(cx, ay - cs * 0.2); ctx.lineTo(cx + cs * 0.2, ay); ctx.lineTo(cx, ay + cs * 0.2); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${THEME.exit},0.18)`; ctx.lineWidth = cs * 0.03; ctx.setLineDash([cs * 0.12, cs * 0.12]);
    ctx.beginPath(); ctx.moveTo(gx + gw, exY + cs * 0.06); ctx.lineTo(gx + gw + EXITLANE * cs, exY + cs * 0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx + gw, exY + cs * 0.94); ctx.lineTo(gx + gw + EXITLANE * cs, exY + cs * 0.94); ctx.stroke();
    ctx.setLineDash([]);
  }

  function glass() { return THEME === THEMES.nacht ? 'rgba(120,180,215,0.8)' : 'rgba(150,205,230,0.9)'; }

  function drawVehicleLocal(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2, base = v.color;
    c.save(); c.globalAlpha = 0.28; c.fillStyle = '#000';
    roundRect(c, -hl + cs * 0.05, -hw + cs * 0.11, lenPx, widPx, widPx * 0.3); c.fill(); c.restore();
    if (v.type === 'moto') { drawMoto(lenPx, widPx, v); return; }
    const grad = c.createLinearGradient(0, -hw, 0, hw);
    grad.addColorStop(0, shade(base, 0.28)); grad.addColorStop(0.5, base); grad.addColorStop(1, shade(base, -0.22));
    c.fillStyle = grad;
    const r = v.type === 'bus' ? widPx * 0.22 : widPx * 0.34;
    roundRect(c, -hl, -hw, lenPx, widPx, r); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(c, -hl + widPx * 0.12, -hw + widPx * 0.1, lenPx - widPx * 0.24, widPx * 0.18, widPx * 0.1); c.fill();
    if (v.type === 'car') drawCarDetails(lenPx, widPx, v);
    else if (v.type === 'truck') drawTruckDetails(lenPx, widPx, v);
    else if (v.type === 'bus') drawBusDetails(lenPx, widPx, v);
    if (colorblind && v.pattern >= 0) drawPattern(lenPx, widPx, v);
    c.fillStyle = 'rgba(20,22,28,0.85)';
    const wheelW = lenPx * (v.type === 'bus' ? 0.12 : 0.16), wheelH = widPx * 0.12;
    const wxs = v.type === 'car' ? [-hl + lenPx * 0.22, hl - lenPx * 0.22] : [-hl + lenPx * 0.18, 0, hl - lenPx * 0.18];
    wxs.forEach((wx) => {
      roundRect(c, wx - wheelW / 2, -hw - wheelH * 0.5, wheelW, wheelH, wheelH * 0.4); c.fill();
      roundRect(c, wx - wheelW / 2, hw - wheelH * 0.5, wheelW, wheelH, wheelH * 0.4); c.fill();
    });
  }
  function drawCarDetails(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2;
    c.fillStyle = shade(v.color, -0.32);
    roundRect(c, -lenPx * 0.22, -hw + widPx * 0.16, lenPx * 0.5, widPx * 0.68, widPx * 0.18); c.fill();
    c.fillStyle = glass();
    roundRect(c, lenPx * 0.10, -hw + widPx * 0.2, lenPx * 0.16, widPx * 0.6, widPx * 0.12); c.fill();
    roundRect(c, -lenPx * 0.26, -hw + widPx * 0.22, lenPx * 0.12, widPx * 0.56, widPx * 0.1); c.fill();
    c.fillStyle = 'rgba(255,244,200,0.95)';
    roundRect(c, hl - lenPx * 0.06, -hw + widPx * 0.18, lenPx * 0.05, widPx * 0.2, 2); c.fill();
    roundRect(c, hl - lenPx * 0.06, hw - widPx * 0.38, lenPx * 0.05, widPx * 0.2, 2); c.fill();
  }
  function drawTruckDetails(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2;
    c.fillStyle = shade(v.color, -0.12);
    roundRect(c, -hl + lenPx * 0.04, -hw + widPx * 0.12, lenPx * 0.6, widPx * 0.76, widPx * 0.1); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = Math.max(1, cs * 0.02);
    for (let i = 1; i < 4; i++) { const x = -hl + lenPx * 0.04 + (lenPx * 0.6) * (i / 4); c.beginPath(); c.moveTo(x, -hw + widPx * 0.16); c.lineTo(x, hw - widPx * 0.16); c.stroke(); }
    c.fillStyle = glass();
    roundRect(c, hl - lenPx * 0.2, -hw + widPx * 0.2, lenPx * 0.1, widPx * 0.6, widPx * 0.1); c.fill();
    c.fillStyle = 'rgba(255,244,200,0.95)';
    roundRect(c, hl - lenPx * 0.05, -hw + widPx * 0.18, lenPx * 0.04, widPx * 0.2, 2); c.fill();
    roundRect(c, hl - lenPx * 0.05, hw - widPx * 0.38, lenPx * 0.04, widPx * 0.2, 2); c.fill();
  }
  function drawBusDetails(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2;
    c.fillStyle = glass();
    const winCount = 5, startX = -hl + lenPx * 0.14, spanX = lenPx * 0.72, wW = (spanX / winCount) * 0.7;
    for (let i = 0; i < winCount; i++) {
      const x = startX + (spanX / winCount) * i + (spanX / winCount - wW) / 2;
      roundRect(c, x, -hw + widPx * 0.14, wW, widPx * 0.2, widPx * 0.05); c.fill();
      roundRect(c, x, hw - widPx * 0.34, wW, widPx * 0.2, widPx * 0.05); c.fill();
    }
    roundRect(c, hl - lenPx * 0.1, -hw + widPx * 0.22, lenPx * 0.05, widPx * 0.56, widPx * 0.08); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(c, -hl + lenPx * 0.06, -widPx * 0.06, lenPx * 0.88, widPx * 0.12, widPx * 0.06); c.fill();
  }
  function drawMoto(lenPx, widPx, v) {
    const c = ctx, bodyLen = lenPx * 0.78, bodyWid = widPx * 0.42;
    const grad = c.createLinearGradient(0, -bodyWid, 0, bodyWid);
    grad.addColorStop(0, shade(v.color, 0.3)); grad.addColorStop(1, shade(v.color, -0.25));
    c.fillStyle = 'rgba(18,20,26,0.9)';
    roundRect(c, -bodyLen / 2 - lenPx * 0.02, -bodyWid * 0.5, lenPx * 0.16, bodyWid, bodyWid * 0.4); c.fill();
    roundRect(c, bodyLen / 2 - lenPx * 0.14, -bodyWid * 0.5, lenPx * 0.16, bodyWid, bodyWid * 0.4); c.fill();
    c.fillStyle = grad; roundRect(c, -bodyLen / 2, -bodyWid / 2, bodyLen, bodyWid, bodyWid * 0.5); c.fill();
    c.fillStyle = shade(v.color, -0.4); roundRect(c, -bodyLen * 0.3, -bodyWid * 0.42, bodyLen * 0.34, bodyWid * 0.84, bodyWid * 0.3); c.fill();
    c.strokeStyle = 'rgba(20,22,28,0.8)'; c.lineWidth = Math.max(1.5, cs * 0.04); c.lineCap = 'round';
    c.beginPath(); c.moveTo(bodyLen * 0.24, -bodyWid * 0.7); c.lineTo(bodyLen * 0.24, bodyWid * 0.7); c.stroke();
    c.fillStyle = 'rgba(255,244,200,0.95)'; c.beginPath(); c.arc(bodyLen * 0.42, 0, bodyWid * 0.22, 0, Math.PI * 2); c.fill();
  }
  function drawPattern(lenPx, widPx, v) {
    const c = ctx, hl = lenPx / 2, hw = widPx / 2;
    c.save(); roundRect(c, -hl, -hw, lenPx, widPx, widPx * 0.3); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.fillStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = Math.max(1.2, cs * 0.035);
    const p = v.pattern;
    if (p === 1) { for (let x = -hl; x < hl; x += cs * 0.28) { c.beginPath(); c.moveTo(x, -hw); c.lineTo(x + widPx, hw); c.stroke(); } }
    else if (p === 2) { for (let x = -hl + cs * 0.15; x < hl; x += cs * 0.3) for (let y = -hw + cs * 0.12; y < hw; y += cs * 0.3) { c.beginPath(); c.arc(x, y, cs * 0.05, 0, 6.3); c.fill(); } }
    else if (p === 3) { for (let x = -hl; x < hl; x += cs * 0.3) { c.beginPath(); c.moveTo(x, hw); c.lineTo(x + cs * 0.15, -hw * 0.2); c.lineTo(x + cs * 0.3, hw); c.stroke(); } }
    else if (p === 4) { for (let x = -hl; x < hl; x += cs * 0.3) { c.beginPath(); c.moveTo(x, -hw); c.lineTo(x, hw); c.stroke(); } }
    c.restore();
  }
  function angleFor(v) { return v.facing === 'W' ? Math.PI : v.facing === 'S' ? Math.PI / 2 : v.facing === 'N' ? -Math.PI / 2 : 0; }

  function drawVehicleAt(v, i, x, y, selected) {
    const w = v.orient === 'H' ? v.len * cs : cs;
    const h = v.orient === 'H' ? cs : v.len * cs;
    const inset = cs * 0.11;
    const cx = x + w / 2, cy = y + h / 2;
    const lenPx = v.len * cs - inset * 2, widPx = cs - inset * 2;
    ctx.save(); ctx.translate(cx, cy);
    if (shakeVeh === i && !reduceMotion) {
      const dt = performance.now() - shakeT0;
      if (dt < 300) { const s = Math.sin(dt / 22) * (1 - dt / 300) * cs * 0.06; if (v.orient === 'H') ctx.translate(s, 0); else ctx.translate(0, s); } else shakeVeh = null;
    }
    ctx.rotate(angleFor(v));
    if (v.target && phase !== 'won') {
      const pulse = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(performance.now() / 380);
      ctx.shadowColor = `rgba(255,90,95,${0.5 + pulse * 0.4})`; ctx.shadowBlur = cs * (0.25 + pulse * 0.2);
    }
    drawVehicleLocal(lenPx, widPx, v);
    ctx.restore();
    if (selected) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = cs * 0.05; ctx.setLineDash([cs * 0.14, cs * 0.1]);
      roundRect(ctx, x + cs * 0.04, y + cs * 0.04, w - cs * 0.08, h - cs * 0.08, cs * 0.2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
  }

  function drawHint() {
    if (!hint || phase !== 'idle') return;
    const v = vehicles[hint.index];
    const w = v.orient === 'H' ? v.len * cs : cs, h = v.orient === 'H' ? cs : v.len * cs;
    const cx = v.animX + w / 2, cy = v.animY + h / 2;
    const pulse = reduceMotion ? 0.7 : 0.5 + 0.5 * Math.sin(performance.now() / 260);
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + pulse * 0.5})`; ctx.lineWidth = cs * 0.06;
    roundRect(ctx, v.animX + cs * 0.05, v.animY + cs * 0.05, w - cs * 0.1, h - cs * 0.1, cs * 0.2); ctx.stroke();
    const dir = Math.sign(hint.delta), off = (cs * 0.55) * (0.8 + pulse * 0.4);
    let ax = cx, ay = cy;
    if (hint.axis === 'H') ax += dir * (w / 2 + off); else ay += dir * (h / 2 + off);
    ctx.translate(ax, ay);
    if (hint.axis === 'H') ctx.rotate(dir > 0 ? 0 : Math.PI); else ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = `rgba(${THEME.exit},${0.7 + pulse * 0.3})`;
    ctx.beginPath(); ctx.moveTo(cs * 0.24, 0); ctx.lineTo(-cs * 0.12, -cs * 0.18); ctx.lineTo(-cs * 0.12, cs * 0.18); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- particles
  function spawnConfetti() {
    const W = fxCanvas.clientWidth || window.innerWidth;
    const cols = ['#ff5a5f', '#ffd166', '#37c978', '#3b82f6', '#b45cf0', '#f97316'];
    particles = [];
    for (let i = 0; i < 90; i++) {
      particles.push({ x: W * (0.3 + Math.random() * 0.4), y: -20 - Math.random() * 60, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3.5, a: Math.random() * 6.3, va: (Math.random() - 0.5) * 0.3, s: 4 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0], life: 1 });
    }
  }
  function updateParticles(dt) {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    if (!particles.length) return;
    const H = fxCanvas.clientHeight || window.innerHeight;
    for (const p of particles) {
      p.vy += 0.05 * dt / 16; p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.a += p.va;
      if (p.y > H * 0.75) p.life -= 0.02;
      fxCtx.save(); fxCtx.globalAlpha = Math.max(0, p.life); fxCtx.translate(p.x, p.y); fxCtx.rotate(p.a);
      fxCtx.fillStyle = p.c; fxCtx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); fxCtx.restore();
    }
    particles = particles.filter((p) => p.life > 0 && p.y < H + 30);
  }

  // ---------------------------------------------------------------- render loop
  function render(ts) {
    const dt = Math.min(50, ts - lastTs || 16); lastTs = ts;
    updateParticles(dt);
    if (mode === 'play' && screens.game.classList.contains('active')) renderPlay(ts, dt);
    else if (mode === 'edit' && screens.editor.classList.contains('active')) renderEdit();
    requestAnimationFrame(render);
  }

  function renderPlay(ts, dt) {
    const ease = reduceMotion ? 1 : 1 - Math.pow(0.001, dt / 1000);
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (drag && drag.idx === i) continue;
      if (phase === 'winning' && v.target) continue;
      const p = pxFor(v.row, v.col);
      v.animX += (p.x - v.animX) * ease; v.animY += (p.y - v.animY) * ease;
    }
    if (phase === 'winning') {
      const dur = reduceMotion ? 200 : 650;
      const t = (ts - winT0) / dur;
      const startX = pxFor(targetVeh.row, targetVeh.col).x;
      const endX = ox + N * cs + (EXITLANE + 0.6) * cs;
      const e = t < 1 ? (1 - Math.pow(1 - t, 3)) : 1;
      targetVeh.animX = startX + (endX - startX) * e;
      if (t >= 1) finishWin();
    }
    ctx.clearRect(0, 0, W_CELLS * cs, H_CELLS * cs);
    drawBackground(); drawBaysAndWalls();
    for (let i = 0; i < vehicles.length; i++) { if (drag && drag.idx === i) continue; drawVehicleAt(vehicles[i], i, vehicles[i].animX, vehicles[i].animY, phase === 'idle' && selIndex === i); }
    if (drag) drawVehicleAt(vehicles[drag.idx], drag.idx, vehicles[drag.idx].animX, vehicles[drag.idx].animY, false);
    drawHint();
  }

  // ---------------------------------------------------------------- screens
  function setScreen(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('active', k === name));
    if (name === 'levels') buildLevelSelect();
    if (name === 'menu') refreshMenuProgress();
    if (name === 'settings') syncSettingsUI();
    if (name === 'editor') { mode = 'edit'; canvas = editCanvas; ctx = editCtx; renderCustomList(); setTimeout(() => { relayout(); }, 0); }
    if (name === 'game') { mode = 'play'; canvas = boardCanvas; ctx = boardCtx; setTimeout(relayout, 0); }
    if (name !== 'game' && name !== 'editor') mode = 'none';
    sizeFx();
  }
  function refreshMenuProgress() { const t = Storage.totals(); $('menu-solved').textContent = t.solved; $('menu-stars').textContent = t.stars; }

  // ---------------------------------------------------------------- level select (with gating)
  function buildLevelSelect() {
    const cont = $('levels-container'); cont.innerHTML = '';
    const totalStars = Storage.totals().stars;
    TIERS.forEach((tier) => {
      const puzzles = PUZZLES.filter((p) => p.difficulty === tier);
      const unlocked = !Storage.gating || totalStars >= GATE[tier];
      let solved = 0; puzzles.forEach((p) => { if (Storage.getLevel(p.id)) solved++; });
      const section = document.createElement('div'); section.className = 'tier-section';
      const head = document.createElement('div'); head.className = 'tier-head'; head.style.setProperty('--accent', TIER_ACCENT[tier]);
      head.innerHTML = `<span class="tier-dot"></span><span class="tier-name">${I18n.t(tier)}</span>` +
        (unlocked ? `<span class="tier-count">${solved}/${puzzles.length}</span>` : `<span class="tier-count locked-note">🔒 ${I18n.t('needStars').replace('{n}', GATE[tier])}</span>`);
      section.appendChild(head);
      const grid = document.createElement('div'); grid.className = 'level-grid';
      puzzles.forEach((p) => {
        const rec = Storage.getLevel(p.id);
        const btn = document.createElement('button');
        btn.className = 'level-btn' + (rec ? ' done' : '') + (unlocked ? '' : ' locked');
        btn.style.setProperty('--accent', TIER_ACCENT[tier]);
        const stars = rec ? rec.stars : 0;
        let sh = '<span class="lvl-stars">'; for (let s = 0; s < 3; s++) sh += `<i class="${s < stars ? 'on' : ''}">★</i>`; sh += '</span>';
        btn.innerHTML = unlocked ? `<span class="lvl-num">${p.id}</span>${sh}` : `<span class="lvl-lock">🔒</span>`;
        if (unlocked) btn.addEventListener('click', () => { Sfx.unlock(); Sfx.click(); loadPuzzle(p, { source: 'campaign' }); });
        else btn.addEventListener('click', () => { toast(I18n.t('needStars').replace('{n}', GATE[tier])); });
        grid.appendChild(btn);
      });
      section.appendChild(grid); cont.appendChild(section);
    });
  }

  // ---------------------------------------------------------------- win overlay
  function showWin(stars) {
    const overlay = $('overlay-win');
    $('win-moves').textContent = moves; $('win-par').textContent = level.minMoves;
    const s = ctxSource.source;
    const allDone = s === 'campaign' && Storage.totals().solved >= PUZZLES.length;
    $('win-msg').textContent = allDone ? I18n.t('allDone') : I18n.t('msg' + stars);
    const starEls = overlay.querySelectorAll('.win-star'); starEls.forEach((el) => el.classList.remove('on', 'pop'));
    overlay.classList.add('show'); Sfx.win();
    for (let i = 0; i < 3; i++) setTimeout(() => { if (i < stars) { starEls[i].classList.add('on', 'pop'); Sfx.star(i); } }, reduceMotion ? 0 : 350 + i * 260);
    const nextBtn = $('btn-win-next');
    if (s === 'campaign') nextBtn.style.display = byId[level.id + 1] ? '' : 'none';
    else if (s === 'random') { nextBtn.style.display = ''; nextBtn.textContent = I18n.t('newRandom'); }
    else if (s === 'test') nextBtn.style.display = 'none';
    else nextBtn.style.display = 'none';
    if (s !== 'random') nextBtn.textContent = I18n.t('next');
  }
  function hideWin() { $('overlay-win').classList.remove('show'); particles = []; }

  // ---------------------------------------------------------------- controls
  function doUndo() {
    if (mode !== 'play' || phase !== 'idle' || !history.length) return;
    const prev = history.pop();
    prev.forEach((s, i) => { vehicles[i].row = s.row; vehicles[i].col = s.col; });
    moves = Math.max(0, moves - 1); $('hud-moves').textContent = moves; updateHudStars();
    hint = null; slideCtx = null; Sfx.click();
  }
  function doRestart() { if (level) { loadPuzzle(level, ctxSource); Sfx.click(); } }
  function doHint() {
    if (mode !== 'play' || phase !== 'idle' || !level) return;
    Sfx.click();
    let res = null; try { res = Solver.solveNext(N, vehicles); } catch (e) { res = null; }
    if (!res) { if (targetVeh && freeRange(vehicles.indexOf(targetVeh)).max >= goalCol) hint = { index: vehicles.indexOf(targetVeh), axis: 'H', delta: 1 }; return; }
    hint = res;
  }

  // ---------------------------------------------------------------- share
  function shareLink() {
    const s = ctxSource.source;
    let url = location.origin + location.pathname.replace(/index\.html$/, '');
    if (s === 'campaign') url += '?level=' + level.id;
    else if (s === 'daily') url += '?daily';
    else return;
    const data = { title: 'Parkplatz', text: I18n.t('tagline'), url };
    if (navigator.share) { navigator.share(data).catch(() => {}); return; }
    copyText(url);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(I18n.t('linkCopied'))).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      toast(I18n.t('linkCopied'));
    } catch (e) { toast(text); }
  }

  // ---------------------------------------------------------------- daily / random
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function startDaily() {
    const date = todayStr();
    let puzzle = Storage.getDailyPuzzle(date);
    if (puzzle) { loadPuzzle(puzzle, { source: 'daily', date }); return; }
    showSpinner(true);
    setTimeout(() => {
      puzzle = (window.PuzzleGen && PuzzleGen.dailyPuzzle(date)) || pickCampaignByHash(date);
      Storage.setDailyPuzzle(date, puzzle);
      showSpinner(false);
      loadPuzzle(puzzle, { source: 'daily', date });
    }, 30);
  }
  function pickCampaignByHash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return PUZZLES[Math.abs(h) % PUZZLES.length]; }
  function randomCampaignOfTier(diff) { const pool = PUZZLES.filter((p) => p.difficulty === diff); return pool[(Math.random() * pool.length) | 0]; }
  function startRandom(diff) {
    showSpinner(true);
    setTimeout(() => {
      let p = window.PuzzleGen ? PuzzleGen.randomPuzzle(diff) : null;
      const R = PuzzleGen ? PuzzleGen.RANGE[diff] : null;
      if (!p || (R && (p.minMoves < R[0] || p.minMoves > R[1]))) p = randomCampaignOfTier(diff);
      showSpinner(false);
      loadPuzzle(p, { source: 'random' });
    }, 30);
  }
  function showSpinner(on) { $('overlay-spinner').classList.toggle('show', !!on); }

  // ---------------------------------------------------------------- editor
  function edPxToCell(e) {
    const r = editCanvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    const x = src.clientX - r.left, y = src.clientY - r.top;
    const col = Math.floor((x - ox) / cs), row = Math.floor((y - oy) / cs);
    return { row, col, inside: col >= 0 && col < N && row >= 0 && row < N };
  }
  function editVehicleAt(row, col) {
    for (let i = 0; i < editVehicles.length; i++) {
      const v = editVehicles[i];
      for (let k = 0; k < v.len; k++) { const r = v.orient === 'H' ? v.row : v.row + k; const c = v.orient === 'H' ? v.col + k : v.col; if (r === row && c === col) return i; }
    }
    return -1;
  }
  function edFits(list, cand) {
    const occ = {};
    for (const v of list) for (let k = 0; k < v.len; k++) { const r = v.orient === 'H' ? v.row : v.row + k; const c = v.orient === 'H' ? v.col + k : v.col; occ[r * N + c] = 1; }
    for (let k = 0; k < cand.len; k++) {
      const r = cand.orient === 'H' ? cand.row : cand.row + k;
      const c = cand.orient === 'H' ? cand.col + k : cand.col;
      if (r < 0 || r >= N || c < 0 || c >= N) return false;
      if (occ[r * N + c]) return false;
    }
    return true;
  }
  function edLen(type) { return type === 'moto' ? 1 : type === 'car' ? 2 : 3; }
  function onEditClick(e) {
    Sfx.unlock();
    const cell = edPxToCell(e); if (!cell.inside) return;
    const hit = editVehicleAt(cell.row, cell.col);
    if (curTool === 'erase') { if (hit >= 0) { editVehicles.splice(hit, 1); Sfx.click(); } refreshEditor(); return; }
    if (hit >= 0) { editVehicles.splice(hit, 1); Sfx.click(); refreshEditor(); return; } // tap existing removes
    if (curTool === 'target') {
      editVehicles = editVehicles.filter((v) => !v.target);
      const col = Math.max(0, Math.min(N - 2, cell.col));
      const cand = { type: 'car', orient: 'H', len: 2, row: EXIT_ROW, col, target: true };
      if (edFits(editVehicles, cand)) { editVehicles.push(cand); Sfx.click(); }
    } else {
      const len = edLen(curTool);
      const cand = { type: curTool, orient: curOrient, len, row: cell.row, col: cell.col };
      if (curOrient === 'H' && cell.col + len > N) cand.col = N - len;
      if (curOrient === 'V' && cell.row + len > N) cand.row = N - len;
      if (edFits(editVehicles, cand)) { editVehicles.push(cand); Sfx.click(); } else Sfx.blocked();
    }
    refreshEditor();
  }
  function editorToPuzzle() {
    let n = 0;
    const vs = editVehicles.map((v) => ({ id: v.target ? 'target' : 'v' + (n++), type: v.type, orient: v.orient, len: v.len, row: v.row, col: v.col, ...(v.target ? { target: true } : {}) }));
    return vs;
  }
  let editorMin = -2;
  function refreshEditor() {
    const status = $('editor-status');
    const hasTarget = editVehicles.some((v) => v.target);
    if (!hasTarget) { editorMin = -2; status.textContent = I18n.t('editorNoTarget'); status.className = 'editor-status warn'; $('btn-ed-save').disabled = true; $('btn-ed-test').disabled = true; return; }
    let m = -1; try { m = Solver.solve(N, editorToPuzzle(), 200000); } catch (e) { m = -1; }
    editorMin = m;
    if (m < 0) { status.textContent = I18n.t('editorUnsolvable'); status.className = 'editor-status warn'; $('btn-ed-save').disabled = true; $('btn-ed-test').disabled = true; }
    else if (m === 0) { status.textContent = I18n.t('editorTrivial'); status.className = 'editor-status warn'; $('btn-ed-save').disabled = true; $('btn-ed-test').disabled = false; }
    else { status.textContent = I18n.t('editorSolvable').replace('{n}', m); status.className = 'editor-status ok'; $('btn-ed-save').disabled = false; $('btn-ed-test').disabled = false; }
  }
  function renderEdit() {
    ctx.clearRect(0, 0, W_CELLS * cs, H_CELLS * cs);
    drawBackground(); drawBaysAndWalls();
    let ci = 0;
    for (let i = 0; i < editVehicles.length; i++) {
      const v = editVehicles[i];
      const rv = { type: v.type, orient: v.orient, len: v.len, target: v.target, facing: facingFor(v, i), color: colorForIndex(v.target ? 0 : ci++, v.target), pattern: v.target ? -1 : (i % 5) };
      const p = pxFor(v.row, v.col);
      drawVehicleAt(rv, -1, p.x, p.y, false);
    }
  }
  function editorClear() { editVehicles = []; refreshEditor(); Sfx.click(); }
  function editorRandomFill() {
    Sfx.click(); showSpinner(true);
    setTimeout(() => {
      const p = window.PuzzleGen ? PuzzleGen.randomPuzzle('mittel') : null;
      showSpinner(false);
      if (p) { editVehicles = p.vehicles.map((v) => ({ type: v.type, orient: v.orient, len: v.len, row: v.row, col: v.col, target: !!v.target })); refreshEditor(); }
    }, 30);
  }
  function editorTest() { if (editorMin === 0 || editorMin > 0) { loadPuzzle({ difficulty: 'custom', minMoves: Math.max(editorMin, 1), size: N, exitRow: EXIT_ROW, vehicles: editorToPuzzle() }, { source: 'test' }); } }
  function editorSave() {
    if (editorMin <= 0) return;
    const name = window.prompt(I18n.t('namePrompt'), '');
    if (name === null) return;
    Storage.addCustom(name.trim(), editorMin, editorToPuzzle());
    toast(I18n.t('saved')); renderCustomList();
  }
  function renderCustomList() {
    const list = $('custom-list'); list.innerHTML = '';
    const customs = Storage.getCustom();
    if (!customs.length) { list.innerHTML = `<p class="muted-line">${I18n.t('noCustom')}</p>`; return; }
    customs.forEach((c) => {
      const row = document.createElement('div'); row.className = 'custom-row';
      let sh = ''; for (let s = 0; s < 3; s++) sh += `<i class="${s < (c.stars || 0) ? 'on' : ''}">★</i>`;
      row.innerHTML = `<span class="cr-name">${escapeHtml(c.name)}</span><span class="cr-stars">${sh}</span><span class="cr-min">${c.minMoves}</span>`;
      const play = document.createElement('button'); play.className = 'btn btn-ghost btn-xs'; play.textContent = '▶';
      play.addEventListener('click', () => { Sfx.click(); loadPuzzle({ difficulty: 'custom', minMoves: c.minMoves, size: N, exitRow: EXIT_ROW, vehicles: c.vehicles }, { source: 'custom', id: c.id, name: c.name }); });
      const del = document.createElement('button'); del.className = 'btn btn-ghost btn-xs danger'; del.textContent = '🗑';
      del.addEventListener('click', () => { if (confirm(I18n.t('deleteCustomConfirm'))) { Storage.deleteCustom(c.id); renderCustomList(); } });
      row.appendChild(play); row.appendChild(del); list.appendChild(row);
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------------------------------------------------------------- settings
  function applyTheme(name) { THEME = THEMES[name] || THEMES.tag; document.body.className = document.body.className.replace(/theme-\w+/g, '').trim(); document.body.classList.add('theme-' + name); }
  function applyReduceMotion() {
    const setting = Storage.reduceMotion;
    reduceMotion = setting === 'on' || (setting === 'auto' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.body.classList.toggle('reduce-motion', reduceMotion);
  }
  function applyAudioSettings() {
    Sfx.setEnabled(Storage.soundOn); Sfx.setSfxVol(Storage.sfxVol); Sfx.setMusicVol(Storage.musicVol);
    updateSoundBtn();
  }
  function tryStartMusic() { if (Storage.musicOn) Sfx.setMusicEnabled(true); }

  function segSelect(groupId, val) {
    const g = $(groupId); if (!g) return;
    g.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.getAttribute('data-val') === String(val)));
  }
  function buildLangSelect() {
    const sel = $('set-lang'); if (!sel) return;
    sel.innerHTML = '';
    I18n.available.forEach((code) => {
      const o = document.createElement('option');
      o.value = code; o.textContent = I18n.name(code);
      sel.appendChild(o);
    });
    sel.value = I18n.lang;
  }
  function syncSettingsUI() {
    if ($('set-lang')) $('set-lang').value = I18n.lang;
    segSelect('set-sound', Storage.soundOn ? 1 : 0);
    segSelect('set-music', Storage.musicOn ? 1 : 0);
    segSelect('set-theme', Storage.theme);
    segSelect('set-colorblind', Storage.colorblind ? 1 : 0);
    segSelect('set-motion', Storage.reduceMotion);
    segSelect('set-gating', Storage.gating ? 1 : 0);
    $('set-sfxvol').value = Storage.sfxVol;
    $('set-musicvol').value = Storage.musicVol;
  }

  // ---------------------------------------------------------------- toast
  let toastTimer = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }

  // ---------------------------------------------------------------- sound button
  function updateSoundBtn() { $('btn-sound').classList.toggle('muted', !Sfx.enabled); }

  // ---------------------------------------------------------------- init
  let deferredInstall = null;
  function init() {
    // language
    let lang = Storage.lang;
    if (!lang) { lang = I18n.detect(navigator.language); Storage.setLang(lang); }
    if (!I18n.available.includes(lang)) lang = 'en';
    I18n.set(lang);
    buildLangSelect();

    colorblind = Storage.colorblind;
    applyTheme(Storage.theme);
    applyReduceMotion();
    applyAudioSettings();
    refreshMenuProgress();

    // nav
    $('btn-home').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); setScreen('menu'); });
    $('btn-play').addEventListener('click', () => { Sfx.unlock(); tryStartMusic(); Sfx.click(); setScreen('levels'); });
    $('btn-daily').addEventListener('click', () => { Sfx.unlock(); tryStartMusic(); Sfx.click(); startDaily(); });
    $('btn-random').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); setScreen('random'); });
    $('btn-editor').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); if (!editVehicles.length) editorClear(); setScreen('editor'); });
    $('btn-howto').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); $('overlay-howto').classList.add('show'); });
    $('btn-howto-close').addEventListener('click', () => { Sfx.click(); $('overlay-howto').classList.remove('show'); });
    $('btn-settings-top').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); setScreen('settings'); });
    $('btn-back').addEventListener('click', () => { Sfx.click(); backFromGame(); });
    $('btn-share').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); shareLink(); });

    // random difficulty buttons
    document.querySelectorAll('.diff-btn').forEach((b) => b.addEventListener('click', () => { Sfx.unlock(); Sfx.click(); startRandom(b.getAttribute('data-diff')); }));

    // sound quick toggle
    $('btn-sound').addEventListener('click', () => {
      Sfx.unlock(); const on = !Sfx.enabled; Sfx.setEnabled(on); Storage.setSound(on); updateSoundBtn(); if (on) Sfx.click();
    });

    // game controls
    $('btn-undo').addEventListener('click', doUndo);
    $('btn-restart').addEventListener('click', doRestart);
    $('btn-hint').addEventListener('click', doHint);

    // win overlay
    $('btn-win-retry').addEventListener('click', () => { Sfx.click(); hideWin(); loadPuzzle(level, ctxSource); });
    $('btn-win-levels').addEventListener('click', () => { Sfx.click(); hideWin(); setScreen('menu'); });
    $('btn-win-next').addEventListener('click', () => {
      Sfx.click(); hideWin();
      const s = ctxSource.source;
      if (s === 'campaign' && byId[level.id + 1]) loadPuzzle(byId[level.id + 1], { source: 'campaign' });
      else if (s === 'random') startRandom(level.difficulty || 'mittel');
      else if (s === 'test') setScreen('editor');
      else setScreen('menu');
    });

    // editor
    document.querySelectorAll('#editor-tools .tool[data-tool]').forEach((b) => b.addEventListener('click', () => {
      curTool = b.getAttribute('data-tool'); Sfx.click();
      document.querySelectorAll('#editor-tools .tool').forEach((x) => x.classList.remove('active')); b.classList.add('active');
    }));
    $('tool-orient').addEventListener('click', () => {
      curOrient = curOrient === 'H' ? 'V' : 'H'; $('tool-orient').textContent = I18n.t(curOrient === 'H' ? 'horizontal' : 'vertical'); Sfx.click();
    });
    editCanvas.addEventListener('click', onEditClick);
    $('btn-ed-clear').addEventListener('click', editorClear);
    $('btn-ed-random').addEventListener('click', editorRandomFill);
    $('btn-ed-test').addEventListener('click', () => { Sfx.click(); editorTest(); });
    $('btn-ed-save').addEventListener('click', () => { Sfx.click(); editorSave(); });

    // settings wiring
    $('set-lang').addEventListener('change', (e) => { Sfx.unlock(); Sfx.click(); const v = e.target.value; I18n.set(v); Storage.setLang(v); });
    wireSeg('set-sound', (v) => { const on = v === '1'; Sfx.setEnabled(on); Storage.setSound(on); updateSoundBtn(); });
    wireSeg('set-music', (v) => { const on = v === '1'; Storage.setMusic(on); Sfx.unlock(); Sfx.setMusicEnabled(on); });
    wireSeg('set-theme', (v) => { Storage.setTheme(v); applyTheme(v); });
    wireSeg('set-colorblind', (v) => { colorblind = v === '1'; Storage.setColorblind(colorblind); });
    wireSeg('set-motion', (v) => { Storage.setReduceMotion(v); applyReduceMotion(); });
    wireSeg('set-gating', (v) => { Storage.setGating(v === '1'); });
    $('set-sfxvol').addEventListener('input', (e) => { Storage.setSfxVol(e.target.value); Sfx.setSfxVol(e.target.value); });
    $('set-sfxvol').addEventListener('change', () => Sfx.click());
    $('set-musicvol').addEventListener('input', (e) => { Storage.setMusicVol(e.target.value); Sfx.setMusicVol(e.target.value); });
    $('btn-reset').addEventListener('click', () => { if (confirm(I18n.t('resetConfirm'))) { Storage.resetAll(); applyTheme(Storage.theme); applyReduceMotion(); applyAudioSettings(); colorblind = Storage.colorblind; syncSettingsUI(); refreshMenuProgress(); toast(I18n.t('saved')); } });

    // pointer + keyboard
    boardCanvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    boardCanvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('keydown', onKey);

    window.addEventListener('resize', () => { if (mode !== 'none') relayout(); else sizeFx(); });
    document.addEventListener('langchange', () => {
      if (screens.levels.classList.contains('active')) buildLevelSelect();
      if (screens.editor.classList.contains('active')) { renderCustomList(); refreshEditor(); $('tool-orient').textContent = I18n.t(curOrient === 'H' ? 'horizontal' : 'vertical'); }
      if (mode === 'play' && level) updateHudMode();
    });

    // PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('btn-install').classList.remove('hidden'); });
    $('btn-install').addEventListener('click', async () => { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; $('btn-install').classList.add('hidden'); } });

    // initial tool highlight + orient label
    const carTool = document.querySelector('#editor-tools .tool[data-tool="car"]'); if (carTool) carTool.classList.add('active');
    $('tool-orient').textContent = I18n.t('horizontal');

    if (!PUZZLES.length) { document.querySelector('.menu-sub').textContent = 'Fehler: Rätseldaten nicht geladen.'; }

    // deep links
    handleDeepLink();

    sizeFx();
    requestAnimationFrame(render);
  }

  function backFromGame() {
    const s = ctxSource.source;
    if (s === 'campaign') setScreen('levels');
    else if (s === 'test' || s === 'custom') setScreen('editor');
    else setScreen('menu');
  }

  function wireSeg(id, cb) {
    const g = $(id); if (!g) return;
    g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { Sfx.unlock(); segSelect(id, b.getAttribute('data-val')); cb(b.getAttribute('data-val')); Sfx.click(); }));
  }

  function handleDeepLink() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.has('level')) { const id = parseInt(params.get('level'), 10); if (byId[id]) { loadPuzzle(byId[id], { source: 'campaign' }); return; } }
      if (params.has('daily')) { startDaily(); return; }
      if (params.has('random')) { const d = params.get('random'); if (PuzzleGen.RANGE[d]) { startRandom(d); return; } }
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
