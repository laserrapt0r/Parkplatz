'use strict';
/*
 * Independent verifier for js/puzzles-data.js.
 * Re-solves every puzzle from scratch with a plain forward BFS (a completely
 * separate code path from the generator) and asserts that it is solvable and
 * that the stored minMoves equals the true minimum. Also checks structural
 * validity (no overlaps, in-bounds, exactly one target on the exit row).
 */
const fs = require('fs');
const path = require('path');
const N = 6;

// load the data file (defines window.PARKPLATZ_PUZZLES)
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'puzzles-data.js'), 'utf8');
const window = {};
// eslint-disable-next-line no-eval
eval(src);
const puzzles = window.PARKPLATZ_PUZZLES;

function validate(p) {
  const g = Array.from({ length: N }, () => new Array(N).fill(false));
  let targets = 0;
  for (const v of p.vehicles) {
    const L = v.len;
    if (v.target) {
      targets++;
      if (v.orient !== 'H' || v.len !== 2 || v.row !== p.exitRow) return 'bad target';
    }
    for (let k = 0; k < L; k++) {
      const r = v.orient === 'H' ? v.row : v.row + k;
      const c = v.orient === 'H' ? v.col + k : v.col;
      if (r < 0 || r >= N || c < 0 || c >= N) return 'out of bounds';
      if (g[r][c]) return 'overlap';
      g[r][c] = true;
    }
  }
  if (targets !== 1) return 'target count ' + targets;
  return null;
}

// forward BFS: minimum slides for the target (index of target) to reach exit
function solve(p) {
  const V = p.vehicles;
  const M = V.length;
  const ti = V.findIndex((v) => v.target);
  const goalCol = N - V[ti].len;
  const isH = V.map((v) => v.orient === 'H');
  const len = V.map((v) => v.len);
  const grid = new Int8Array(N * N);

  const start = V.map((v) => v.row * N + v.col);
  if (start[ti] % N === goalCol) return 0;
  const key = (s) => s.map((x) => String.fromCharCode(x)).join('');
  const visited = new Set([key(start)]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next = [];
    for (const st of frontier) {
      grid.fill(-1);
      for (let i = 0; i < M; i++) {
        const r0 = (st[i] / N) | 0, c0 = st[i] % N;
        if (isH[i]) for (let k = 0; k < len[i]; k++) grid[r0 * N + c0 + k] = i;
        else for (let k = 0; k < len[i]; k++) grid[(r0 + k) * N + c0] = i;
      }
      for (let i = 0; i < M; i++) {
        const r0 = (st[i] / N) | 0, c0 = st[i] % N;
        if (isH[i]) {
          for (let c = c0 - 1; c >= 0; c--) { if (grid[r0 * N + c] !== -1) break; const ns = st.slice(); ns[i] = r0 * N + c; const k = key(ns); if (!visited.has(k)) { visited.add(k); if (i === ti && c === goalCol) return depth; next.push(ns); } }
          for (let c = c0 + len[i]; c < N; c++) { if (grid[r0 * N + c] !== -1) break; const nc = c - len[i] + 1; const ns = st.slice(); ns[i] = r0 * N + nc; const k = key(ns); if (!visited.has(k)) { visited.add(k); if (i === ti && nc === goalCol) return depth; next.push(ns); } }
        } else {
          for (let r = r0 - 1; r >= 0; r--) { if (grid[r * N + c0] !== -1) break; const ns = st.slice(); ns[i] = r * N + c0; const k = key(ns); if (!visited.has(k)) { visited.add(k); next.push(ns); } }
          for (let r = r0 + len[i]; r < N; r++) { if (grid[r * N + c0] !== -1) break; const nr = r - len[i] + 1; const ns = st.slice(); ns[i] = nr * N + c0; const k = key(ns); if (!visited.has(k)) { visited.add(k); next.push(ns); } }
        }
      }
    }
    frontier = next;
  }
  return -1;
}

let ok = 0, fail = 0;
const ids = new Set();
for (const p of puzzles) {
  if (ids.has(p.id)) { console.error(`DUP id ${p.id}`); fail++; }
  ids.add(p.id);
  const vErr = validate(p);
  if (vErr) { console.error(`Level ${p.id}: INVALID (${vErr})`); fail++; continue; }
  const m = solve(p);
  if (m < 0) { console.error(`Level ${p.id}: UNSOLVABLE`); fail++; }
  else if (m !== p.minMoves) { console.error(`Level ${p.id}: minMoves stored=${p.minMoves} actual=${m}`); fail++; }
  else ok++;
}

console.log(`\nVerified ${puzzles.length} puzzles: ${ok} OK, ${fail} FAIL`);
console.log(`ids: ${Math.min(...ids)}..${Math.max(...ids)} (${ids.size} unique)`);
process.exit(fail ? 1 : 0);
