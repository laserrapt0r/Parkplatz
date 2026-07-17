'use strict';
/*
 * Parkplatz - puzzle generator
 * ----------------------------
 * Generates 100 Rush-Hour style puzzles on a 6x6 grid and computes the
 * minimum number of moves (slides) for each via breadth-first search.
 *
 * A "move" = sliding one vehicle any distance in a single direction. This is
 * the classic Rush Hour convention and matches how the game counts a drag.
 *
 * The exit is on the right edge of row 2 (0-indexed). The target vehicle is a
 * horizontal car of length 2 sitting on row 2; the puzzle is solved when the
 * car reaches the right wall and can drive out through the exit gap.
 *
 * Output: ../js/puzzles-data.js  (window.PARKPLATZ_PUZZLES = [...])
 *
 * Deterministic: uses a seeded PRNG so regenerating yields the same puzzles.
 */

const fs = require('fs');
const path = require('path');

// ---------- seeded RNG (mulberry32) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(20260717);
const rint = (n) => Math.floor(rng() * n);

const N = 6;         // grid dimension
const EXIT_ROW = 2;  // row the target sits on / exit is located
const TARGET_LEN = 2;
const GOAL_COL = N - TARGET_LEN; // target anchor col when at the exit

function lenForType(type) {
  if (type === 'moto') return 1;
  if (type === 'car') return 2;
  return 3; // truck | bus
}
function pickType() {
  const r = rng();
  if (r < 0.07) return 'moto';
  if (r < 0.52) return 'car';
  if (r < 0.78) return 'truck';
  return 'bus';
}

// ---------- state-graph engine ----------
// vehicles: [{orient:'H'|'V', len, row, col, target?}], target must be index 0.
// state: Int8Array of anchor values packed as r*6+c per vehicle.
// key: string of char codes of those packed values.
//
// Rush Hour moves are reversible, so the reachable arrangements of one piece
// set form an undirected graph. We enumerate a whole component, then run a
// multi-source BFS from every solved arrangement; the resulting distance IS
// the provable minimum number of moves for each arrangement. One exploration
// therefore yields exact minimums for thousands of candidate puzzles at once.
function makeEngine(vehicles) {
  const M = vehicles.length;
  const isH = new Uint8Array(M);
  const len = new Uint8Array(M);
  for (let i = 0; i < M; i++) { isH[i] = vehicles[i].orient === 'H' ? 1 : 0; len[i] = vehicles[i].len; }
  const grid = new Int8Array(N * N);

  function fillGrid(st) {
    grid.fill(-1);
    for (let i = 0; i < M; i++) {
      const p = st[i], r0 = (p / N) | 0, c0 = p % N, L = len[i];
      if (isH[i]) { for (let k = 0; k < L; k++) grid[r0 * N + c0 + k] = i; }
      else { for (let k = 0; k < L; k++) grid[(r0 + k) * N + c0] = i; }
    }
  }
  function keyOf(st) {
    let s = '';
    for (let i = 0; i < M; i++) s += String.fromCharCode(st[i]);
    return s;
  }
  // push all neighbour states of st into out (as fresh Int8Arrays)
  function expand(st, out) {
    fillGrid(st);
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

  // Enumerate the component containing the seed and return every arrangement
  // with its exact minimum-move distance, or null if capped / no solution.
  return function harvest(cap) {
    const start = new Int8Array(M);
    for (let i = 0; i < M; i++) start[i] = vehicles[i].row * N + vehicles[i].col;

    const index = new Map();
    const states = [];
    index.set(keyOf(start), 0);
    states.push(start);
    let head = 0;
    const goals = [];
    const buf = [];
    while (head < states.length) {
      if (states.length > cap) return null;
      const st = states[head];
      if (st[0] % N === GOAL_COL) goals.push(head);
      head++;
      buf.length = 0;
      expand(st, buf);
      for (let b = 0; b < buf.length; b++) {
        const ns = buf[b];
        const k = keyOf(ns);
        if (!index.has(k)) { index.set(k, states.length); states.push(ns); }
      }
    }
    if (!goals.length) return null;

    const dist = new Int32Array(states.length).fill(-1);
    let frontier = [];
    for (const gi of goals) { dist[gi] = 0; frontier.push(gi); }
    while (frontier.length) {
      const next = [];
      for (const idx of frontier) {
        buf.length = 0;
        expand(states[idx], buf);
        for (let b = 0; b < buf.length; b++) {
          const j = index.get(keyOf(buf[b]));
          if (dist[j] === -1) { dist[j] = dist[idx] + 1; next.push(j); }
        }
      }
      frontier = next;
    }
    return { states, dist };
  };
}

// ---------- random board ----------
function buildGridCheck(vehicles) {
  const g = new Int8Array(N * N).fill(-1);
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    for (let k = 0; k < v.len; k++) {
      const r = v.orient === 'H' ? v.row : v.row + k;
      const c = v.orient === 'H' ? v.col + k : v.col;
      if (r < 0 || r >= N || c < 0 || c >= N) return false;
      if (g[r * N + c] !== -1) return false;
      g[r * N + c] = i;
    }
  }
  return true;
}

// Construct a board that is very likely solvable and non-trivial:
//  - target on the exit row
//  - one or more VERTICAL blockers crossing the exit row in the target's path
//  - extra fillers (vertical anywhere, horizontal only off the exit row)
// Forbidding horizontal vehicles on the exit row removes the main cause of
// unsolvable random boards, so BFS rarely has to explore a dead configuration.
function typeForLen(L) {
  if (L === 1) return 'moto';
  if (L === 2) return 'car';
  return rng() < 0.5 ? 'truck' : 'bus';
}

function randomBoard(fillers) {
  const target = { orient: 'H', len: TARGET_LEN, row: EXIT_ROW, col: rint(4), type: 'car', target: true };
  const vehicles = [target];

  // blockers in the exit path (columns strictly right of the target)
  const pathCols = [];
  for (let c = target.col + TARGET_LEN; c < N; c++) pathCols.push(c);
  // shuffle path columns
  for (let i = pathCols.length - 1; i > 0; i--) { const j = rint(i + 1); [pathCols[i], pathCols[j]] = [pathCols[j], pathCols[i]]; }
  const nBlock = Math.min(pathCols.length, 1 + rint(3)); // 1..3 blockers
  for (let b = 0; b < nBlock; b++) {
    const c = pathCols[b];
    const L = 2 + rint(2); // 2 or 3
    // vertical anchor rows that cover EXIT_ROW
    const opts = [];
    for (let r0 = Math.max(0, EXIT_ROW - L + 1); r0 <= Math.min(EXIT_ROW, N - L); r0++) opts.push(r0);
    const r0 = opts[rint(opts.length)];
    const cand = { orient: 'V', len: L, row: r0, col: c, type: typeForLen(L) };
    if (buildGridCheck([...vehicles, cand])) vehicles.push(cand);
  }

  // extra fillers
  let placed = 0, tries = 0;
  while (placed < fillers && tries < 60) {
    tries++;
    const orient = rng() < 0.58 ? 'V' : 'H';
    const type = pickType();
    const L = lenForType(type);
    let row, col;
    if (orient === 'H') {
      row = rint(N);
      if (row === EXIT_ROW) continue;      // never horizontal on the exit row
      col = rint(N - L + 1);
    } else {
      col = rint(N); row = rint(N - L + 1);
    }
    const cand = { orient, len: L, row, col, type };
    if (buildGridCheck([...vehicles, cand])) { vehicles.push(cand); placed++; }
  }
  return vehicles;
}

function canon(vehicles) {
  const parts = vehicles.map((v) => `${v.target ? 'T' : v.type}${v.orient}${v.len}@${v.row},${v.col}`);
  parts.sort();
  return parts.join('|');
}

// Rebuild a vehicles list from a harvested arrangement (anchors) + the seed's
// piece metadata (type/orient/len are constant across the component).
function vehiclesFromState(seed, anchors) {
  return seed.map((v, i) => ({
    target: !!v.target, type: v.type, orient: v.orient, len: v.len,
    row: (anchors[i] / N) | 0, col: anchors[i] % N,
  }));
}

// ---------- generate pool ----------
const MIN_MOVES = 6;
const COMP_CAP = 160000;     // skip piece sets whose graph is larger than this
const PER_COMPONENT = 30;    // varied puzzles harvested from each component
const TARGET_POOL = 6000;
const TIME_BUDGET_MS = 90000;

const pool = [];
const seen = new Set();
let seeds = 0, comps = 0;
const t0 = Date.now();
let lastLog = 0;

while (pool.length < TARGET_POOL && (Date.now() - t0) < TIME_BUDGET_MS) {
  seeds++;
  const fillers = 6 + rint(7); // 6..12 extra fillers (plus target + blockers)
  const seed = randomBoard(fillers);
  const harvest = makeEngine(seed);
  const res = harvest(COMP_CAP);
  if (!res) continue;
  comps++;

  // gather solvable-and-non-trivial arrangements, sorted by difficulty
  const cand = [];
  for (let i = 0; i < res.states.length; i++) {
    if (res.dist[i] >= MIN_MOVES) cand.push(i);
  }
  if (!cand.length) continue;
  cand.sort((a, b) => res.dist[a] - res.dist[b]);

  // sample biased toward the harder end (hard arrangements are much rarer)
  const take = Math.min(PER_COMPONENT, cand.length);
  const picks = new Set();
  for (let s = 0; s < take; s++) {
    const f = take === 1 ? 1 : s / (take - 1);
    picks.add(cand[Math.round(Math.pow(f, 0.5) * (cand.length - 1))]);
  }
  for (const idx of picks) {
    const vehicles = vehiclesFromState(seed, res.states[idx]);
    const key = canon(vehicles);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ vehicles, minMoves: res.dist[idx] });
  }

  if (Date.now() - lastLog >= 5000) {
    lastLog = Date.now();
    process.stderr.write(`  seeds=${seeds} comps=${comps} pool=${pool.length} t=${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
}
const genMs = Date.now() - t0;

pool.sort((a, b) => a.minMoves - b.minMoves);
const hist = {};
for (const p of pool) hist[p.minMoves] = (hist[p.minMoves] || 0) + 1;
console.error(`\npool=${pool.length} seeds=${seeds} comps=${comps} time=${genMs}ms`);
console.error('minMoves histogram:', JSON.stringify(hist));
console.error('range:', pool.length ? `${pool[0].minMoves}..${pool[pool.length - 1].minMoves}` : 'empty');

if (pool.length < 100) { console.error('ERROR: pool too small'); process.exit(1); }

// ---------- select 100 following a smooth difficulty curve ----------
// Group the pool by exact minMoves, then for each of 100 target difficulties
// (interpolated from the easiest to the hardest available) pull the nearest
// still-unused puzzle. This yields a smooth, monotonic gradient that uses the
// whole range the pool offers, with the rarest hard puzzles reserved for the
// top levels.
const WANT = 100;
const buckets = new Map(); // minMoves -> [puzzles]
for (const p of pool) {
  if (!buckets.has(p.minMoves)) buckets.set(p.minMoves, []);
  buckets.get(p.minMoves).push(p);
}
const lo = pool[0].minMoves;
const hi = pool[pool.length - 1].minMoves;

function takeNearest(target) {
  for (let d = 0; d <= hi - lo; d++) {
    for (const t of [target - d, target + d]) {
      const arr = buckets.get(t);
      if (arr && arr.length) return arr.pop();
    }
  }
  return null;
}

const chosen = [];
for (let i = 0; i < WANT; i++) {
  // ease-in curve: gentle ramp early, steeper toward the hardest levels
  const f = Math.pow(i / (WANT - 1), 1.35);
  const target = Math.round(lo + f * (hi - lo));
  const pick = takeNearest(target);
  if (pick) chosen.push(pick);
}
chosen.sort((a, b) => a.minMoves - b.minMoves);
while (chosen.length < WANT && pool.length) chosen.push(pool[pool.length - 1]); // safety pad

const tiers = ['leicht', 'mittel', 'schwer', 'sehr_schwer'];
const puzzles = [];
for (let i = 0; i < WANT; i++) {
  const tier = tiers[Math.floor(i / 25)];
  const src = chosen[i];
  let n = 0;
  const vehicles = src.vehicles.map((v) => ({
    id: v.target ? 'target' : 'v' + (n++),
    type: v.type, orient: v.orient, len: v.len, row: v.row, col: v.col,
    ...(v.target ? { target: true } : {}),
  }));
  puzzles.push({ id: i + 1, difficulty: tier, minMoves: src.minMoves, size: N, exitRow: EXIT_ROW, vehicles });
}

for (let t = 0; t < 4; t++) {
  const slice = puzzles.slice(t * 25, t * 25 + 25);
  const mm = slice.map((p) => p.minMoves);
  console.error(`${tiers[t]}: n=${slice.length} min=${Math.min(...mm)} max=${Math.max(...mm)} avg=${(mm.reduce((a, b) => a + b, 0) / mm.length).toFixed(1)}`);
}

const header = `/*
 * Parkplatz - puzzle data (auto-generated by tools/generate.js)
 * ${puzzles.length} puzzles. Each minMoves value was verified by BFS as the
 * provable minimum number of slides to solve. Do not edit by hand.
 */
`;
const body = 'window.PARKPLATZ_PUZZLES = ' + JSON.stringify(puzzles) + ';\n';
const outPath = path.join(__dirname, '..', 'js', 'puzzles-data.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body);
console.error('wrote', outPath, `(${(header + body).length} bytes)`);
