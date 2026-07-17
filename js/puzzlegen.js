/* Parkplatz - in-browser puzzle generator for Random mode and the Daily
   challenge. Uses the same component-harvesting method as tools/generate.js:
   build a piece set, enumerate its reachable arrangements, run a multi-source
   BFS from the solved arrangements to get exact minimum moves, then pick an
   arrangement in the requested difficulty range. Deterministic when given a
   seeded RNG (used for the reproducible Daily puzzle). */
(function () {
  'use strict';
  const N = 6, EXIT_ROW = 2, GOAL_COL = N - 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const RANGE = { leicht: [6, 9], mittel: [10, 15], schwer: [16, 21], sehr_schwer: [22, 32] };
  const FILLERS = { leicht: [4, 6], mittel: [6, 9], schwer: [8, 11], sehr_schwer: [10, 13] };
  const SOLVE_CAP = { leicht: 40000, mittel: 60000, schwer: 90000, sehr_schwer: 150000 };
  const MAX_ATTEMPTS = { leicht: 120, mittel: 160, schwer: 240, sehr_schwer: 400 };
  // Hard tiers use graph-harvesting (a deep component reliably contains states
  // at high move-counts), so fresh hard puzzles are produced without falling
  // back to the campaign.
  const HARVEST_CAP = { schwer: 55000, sehr_schwer: 110000 };
  const HARVEST_SEEDS = { schwer: 40, sehr_schwer: 55 };

  function lenForType(t) { return t === 'moto' ? 1 : t === 'car' ? 2 : 3; }
  function pickType(rnd) {
    const r = rnd();
    if (r < 0.07) return 'moto';
    if (r < 0.52) return 'car';
    if (r < 0.78) return 'truck';
    return 'bus';
  }
  function typeForLen(rnd, L) { return L === 1 ? 'moto' : L === 2 ? 'car' : (rnd() < 0.5 ? 'truck' : 'bus'); }

  function fits(vehicles, cand) {
    const g = {};
    for (const v of vehicles.concat([cand])) {
      for (let k = 0; k < v.len; k++) {
        const r = v.orient === 'H' ? v.row : v.row + k;
        const c = v.orient === 'H' ? v.col + k : v.col;
        if (r < 0 || r >= N || c < 0 || c >= N) return false;
        const key = r * N + c;
        if (g[key]) return false;
        g[key] = 1;
      }
    }
    return true;
  }

  function randomBoard(rnd, fillers) {
    const target = { orient: 'H', len: 2, row: EXIT_ROW, col: (rnd() * 4) | 0, type: 'car', target: true };
    const vehicles = [target];
    const pathCols = [];
    for (let c = target.col + 2; c < N; c++) pathCols.push(c);
    for (let i = pathCols.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = pathCols[i]; pathCols[i] = pathCols[j]; pathCols[j] = t; }
    const nBlock = Math.min(pathCols.length, 1 + ((rnd() * 3) | 0));
    for (let b = 0; b < nBlock; b++) {
      const c = pathCols[b];
      const L = 2 + ((rnd() * 2) | 0);
      const opts = [];
      for (let r0 = Math.max(0, EXIT_ROW - L + 1); r0 <= Math.min(EXIT_ROW, N - L); r0++) opts.push(r0);
      const r0 = opts[(rnd() * opts.length) | 0];
      const cand = { orient: 'V', len: L, row: r0, col: c, type: typeForLen(rnd, L) };
      if (fits(vehicles, cand)) vehicles.push(cand);
    }
    let placed = 0, tries = 0;
    while (placed < fillers && tries < 60) {
      tries++;
      const orient = rnd() < 0.58 ? 'V' : 'H';
      const type = pickType(rnd);
      const L = lenForType(type);
      let row, col;
      if (orient === 'H') { row = (rnd() * N) | 0; if (row === EXIT_ROW) continue; col = (rnd() * (N - L + 1)) | 0; }
      else { col = (rnd() * N) | 0; row = (rnd() * (N - L + 1)) | 0; }
      const cand = { orient, len: L, row, col, type };
      if (fits(vehicles, cand)) { vehicles.push(cand); placed++; }
    }
    return vehicles;
  }

  function toPuzzle(board, diff, minMoves) {
    let n = 0;
    const vehicles = board.map((v) => ({
      id: v.target ? 'target' : 'v' + (n++),
      type: v.type, orient: v.orient, len: v.len, row: v.row, col: v.col,
      ...(v.target ? { target: true } : {}),
    }));
    return { difficulty: diff, minMoves: minMoves, size: N, exitRow: EXIT_ROW, vehicles };
  }

  // Enumerate a component + multi-source BFS distances (exact minimum moves).
  function harvest(vehicles, cap) {
    const M = vehicles.length;
    const isH = new Uint8Array(M), len = new Uint8Array(M);
    for (let i = 0; i < M; i++) { isH[i] = vehicles[i].orient === 'H' ? 1 : 0; len[i] = vehicles[i].len; }
    const grid = new Int8Array(N * N);
    function fill(st) { grid.fill(-1); for (let i = 0; i < M; i++) { const p = st[i], r0 = (p / N) | 0, c0 = p % N; if (isH[i]) { for (let k = 0; k < len[i]; k++) grid[r0 * N + c0 + k] = i; } else { for (let k = 0; k < len[i]; k++) grid[(r0 + k) * N + c0] = i; } } }
    function key(st) { let s = ''; for (let i = 0; i < M; i++) s += String.fromCharCode(st[i]); return s; }
    function expand(st, out) {
      fill(st);
      for (let i = 0; i < M; i++) {
        const p = st[i], r0 = (p / N) | 0, c0 = p % N, L = len[i];
        if (isH[i]) {
          for (let c = c0 - 1; c >= 0; c--) { if (grid[r0 * N + c] !== -1) break; const ns = st.slice(); ns[i] = r0 * N + c; out.push(ns); }
          for (let c = c0 + L; c < N; c++) { if (grid[r0 * N + c] !== -1) break; const ns = st.slice(); ns[i] = r0 * N + (c - L + 1); out.push(ns); }
        } else {
          for (let r = r0 - 1; r >= 0; r--) { if (grid[r * N + c0] !== -1) break; const ns = st.slice(); ns[i] = r * N + c0; out.push(ns); }
          for (let r = r0 + L; r < N; r++) { if (grid[r * N + c0] !== -1) break; const ns = st.slice(); ns[i] = (r - L + 1) * N + c0; out.push(ns); }
        }
      }
    }
    const start = new Int8Array(M);
    for (let i = 0; i < M; i++) start[i] = vehicles[i].row * N + vehicles[i].col;
    const index = new Map(); const states = [];
    index.set(key(start), 0); states.push(start);
    let head = 0; const goals = []; const buf = [];
    while (head < states.length) {
      if (states.length > cap) return null;
      const st = states[head];
      if (st[0] % N === GOAL_COL) goals.push(head);
      head++;
      buf.length = 0; expand(st, buf);
      for (let b = 0; b < buf.length; b++) { const k = key(buf[b]); if (!index.has(k)) { index.set(k, states.length); states.push(buf[b]); } }
    }
    if (!goals.length) return null;
    const dist = new Int32Array(states.length).fill(-1);
    let frontier = [];
    for (const gi of goals) { dist[gi] = 0; frontier.push(gi); }
    while (frontier.length) {
      const next = [];
      for (const idx of frontier) { buf.length = 0; expand(states[idx], buf); for (let b = 0; b < buf.length; b++) { const j = index.get(key(buf[b])); if (dist[j] === -1) { dist[j] = dist[idx] + 1; next.push(j); } } }
      frontier = next;
    }
    return { states, dist };
  }
  function boardFromState(seed, anchors) {
    return seed.map((v, i) => ({ target: !!v.target, type: v.type, orient: v.orient, len: v.len, row: (anchors[i] / N) | 0, col: anchors[i] % N }));
  }

  // Hard-tier generation via harvesting: a deep component reliably contains
  // arrangements at the requested (high) move-count. Deterministic when `rnd`
  // is seeded and `timeMs` is 0 (Daily).
  function generateHard(diff, rnd, timeMs) {
    const range = RANGE[diff]; const fr = FILLERS[diff];
    const cap = HARVEST_CAP[diff] || 60000; const maxSeeds = HARVEST_SEEDS[diff] || 40;
    const start = Date.now(); let best = null;
    for (let s = 0; s < maxSeeds; s++) {
      if (timeMs && best && (Date.now() - start) > timeMs) break;
      const fillers = fr[0] + ((rnd() * (fr[1] - fr[0] + 1)) | 0);
      const board = randomBoard(rnd, fillers);
      const res = harvest(board, cap);
      if (!res) continue;
      const inRange = []; let localBest = null;
      for (let i = 0; i < res.states.length; i++) {
        const d = res.dist[i];
        if (d >= range[0] && d <= range[1]) inRange.push(i);
        if (d >= 6) { const d2 = d < range[0] ? range[0] - d : d - range[1]; if (!localBest || d2 < localBest.d2) localBest = { i, d, d2 }; }
      }
      if (inRange.length) { const idx = inRange[(rnd() * inRange.length) | 0]; return toPuzzle(boardFromState(board, res.states[idx]), diff, res.dist[idx]); }
      if (localBest && (!best || localBest.d2 < best.d2)) best = { board, anchors: res.states[localBest.i], dist: localBest.d, d2: localBest.d2 };
    }
    if (best) return toPuzzle(boardFromState(best.board, best.anchors), diff, best.dist);
    return null;
  }

  // Generate a puzzle in the given difficulty tier. Easy/medium build & solve a
  // constructed board (fast); hard tiers harvest a state graph (reliable).
  // Deterministic when `rnd` is a seeded RNG and `timeMs` is 0 (Daily puzzle).
  function generate(diff, rnd, timeMs) {
    rnd = rnd || Math.random;
    if (diff === 'schwer' || diff === 'sehr_schwer') return generateHard(diff, rnd, timeMs);
    const range = RANGE[diff] || RANGE.mittel;
    const fr = FILLERS[diff] || FILLERS.mittel;
    const cap = SOLVE_CAP[diff] || 60000;
    const maxAttempts = MAX_ATTEMPTS[diff] || 140;
    const start = Date.now();
    let best = null;
    for (let a = 0; a < maxAttempts; a++) {
      if (timeMs && best && (Date.now() - start) > timeMs) break;
      const fillers = fr[0] + ((rnd() * (fr[1] - fr[0] + 1)) | 0);
      const board = randomBoard(rnd, fillers);
      const m = window.Solver.solve(N, board, cap);
      if (m < 0) continue;
      if (m >= range[0] && m <= range[1]) return toPuzzle(board, diff, m);
      if (m >= 6) { const d2 = m < range[0] ? range[0] - m : m - range[1]; if (!best || d2 < best.d2) best = { board, m, d2 }; }
    }
    if (best) return toPuzzle(best.board, diff, best.m);
    return null;
  }

  // Best-effort fresh puzzle within a snug interactive budget. The caller
  // (Random mode) falls back to a campaign puzzle of the tier if the result is
  // out of range, so this stays fast rather than exhaustive.
  function randomPuzzle(diff) { return generate(diff, Math.random, diff === 'sehr_schwer' ? 4000 : diff === 'schwer' ? 2600 : 1200); }

  // Difficulty of the daily puzzle rotates by weekday so it isn't always the
  // same challenge (deterministic from the date).
  function dailyDifficulty(dateStr) {
    const dow = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun … 6=Sat
    return ['mittel', 'leicht', 'mittel', 'mittel', 'schwer', 'mittel', 'sehr_schwer'][dow];
  }

  // Deterministic Daily puzzle: same date -> same puzzle on every device.
  function dailyPuzzle(dateStr) {
    let seed = 0;
    for (let i = 0; i < dateStr.length; i++) seed = (seed * 31 + dateStr.charCodeAt(i)) | 0;
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    return generate(dailyDifficulty(dateStr), rnd, 0);
  }

  window.PuzzleGen = { randomPuzzle, dailyPuzzle, generate, dailyDifficulty, RANGE, _randomBoard: randomBoard, _mulberry32: mulberry32 };
})();
