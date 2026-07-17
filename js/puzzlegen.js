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

  // Generate a puzzle in the given difficulty tier by building constructed
  // boards and solving each one exactly (forward BFS), keeping the first whose
  // minimum falls in range. Deterministic when `rnd` is a seeded RNG and
  // `timeMs` is 0 (used by the Daily puzzle).
  function generate(diff, rnd, timeMs) {
    rnd = rnd || Math.random;
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
  function randomPuzzle(diff) { return generate(diff, Math.random, diff === 'sehr_schwer' ? 2200 : diff === 'schwer' ? 1600 : 1200); }

  // Deterministic Daily puzzle: same date -> same puzzle on every device.
  function dailyPuzzle(dateStr) {
    // dateStr like "2026-07-17"
    let seed = 0;
    for (let i = 0; i < dateStr.length; i++) seed = (seed * 31 + dateStr.charCodeAt(i)) | 0;
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    const p = generate('mittel', rnd, 0);
    return p;
  }

  window.PuzzleGen = { randomPuzzle, dailyPuzzle, generate, RANGE, _randomBoard: randomBoard, _mulberry32: mulberry32 };
})();
