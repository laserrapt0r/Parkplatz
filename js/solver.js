/* Parkplatz - in-browser BFS solver, used for the "hint" feature.
   Given the current board it finds an optimal solution and returns the next
   move on that path. Same move semantics as the generator (one slide of any
   distance = one move). */
(function () {
  'use strict';

  function solveNext(size, vehicles) {
    const N = size;
    const targetIdx = vehicles.findIndex((v) => v.target);
    if (targetIdx < 0) return null;
    const goalCol = N - vehicles[targetIdx].len;

    const meta = vehicles.map((v) => ({ h: v.orient === 'H', len: v.len }));

    function gridOf(state) {
      const g = new Int8Array(N * N).fill(-1);
      for (let i = 0; i < meta.length; i++) {
        const r0 = state[i * 2], c0 = state[i * 2 + 1];
        for (let k = 0; k < meta[i].len; k++) {
          const r = meta[i].h ? r0 : r0 + k;
          const c = meta[i].h ? c0 + k : c0;
          g[r * N + c] = i;
        }
      }
      return g;
    }

    const start = [];
    for (const v of vehicles) start.push(v.row, v.col);
    if (start[targetIdx * 2 + 1] === goalCol) return null; // already solvable to exit

    const startKey = start.join(',');
    const visited = new Set([startKey]);
    // parent: key -> { pkey, moveIdx, from:[r,c] }
    const parent = new Map();
    parent.set(startKey, null);

    let frontier = [start];
    const CAP = 200000;
    let found = null;

    outer:
    while (frontier.length) {
      const next = [];
      for (const st of frontier) {
        const g = gridOf(st);
        for (let i = 0; i < meta.length; i++) {
          const r0 = st[i * 2], c0 = st[i * 2 + 1];
          if (meta[i].h) {
            for (let c = c0 - 1; c >= 0; c--) {
              if (g[r0 * N + c] !== -1) break;
              const ns = st.slice(); ns[i * 2 + 1] = c;
              if (pushState(ns, st, i)) break outer;
            }
            for (let c = c0 + meta[i].len; c < N; c++) {
              if (g[r0 * N + c] !== -1) break;
              const ns = st.slice(); ns[i * 2 + 1] = c - meta[i].len + 1;
              if (pushState(ns, st, i)) break outer;
            }
          } else {
            for (let r = r0 - 1; r >= 0; r--) {
              if (g[r * N + c0] !== -1) break;
              const ns = st.slice(); ns[i * 2] = r;
              if (pushState(ns, st, i)) break outer;
            }
            for (let r = r0 + meta[i].len; r < N; r++) {
              if (g[r * N + c0] !== -1) break;
              const ns = st.slice(); ns[i * 2] = r - meta[i].len + 1;
              if (pushState(ns, st, i)) break outer;
            }
          }
        }
        if (visited.size > CAP) return null;
      }
      frontier = next;

      // eslint-disable-next-line no-inner-declarations
      function pushState(ns, from, i) {
        const key = ns.join(',');
        if (visited.has(key)) return false;
        visited.add(key);
        parent.set(key, { pkey: from.join(','), moveIdx: i });
        if (ns[targetIdx * 2 + 1] === goalCol) { found = key; return true; }
        next.push(ns);
        return false;
      }
    }

    if (!found) return null;

    // walk back to the first move from the start
    let key = found;
    let firstMoveIdx = -1;
    let stateAfterFirst = null;
    while (parent.get(key)) {
      const p = parent.get(key);
      if (p.pkey === startKey) {
        firstMoveIdx = p.moveIdx;
        stateAfterFirst = key.split(',').map(Number);
        break;
      }
      key = p.pkey;
    }
    if (firstMoveIdx < 0 || !stateAfterFirst) return null;

    const v = vehicles[firstMoveIdx];
    const axis = v.orient;
    const delta = axis === 'H'
      ? stateAfterFirst[firstMoveIdx * 2 + 1] - v.col
      : stateAfterFirst[firstMoveIdx * 2] - v.row;

    return { id: v.id, index: firstMoveIdx, axis, delta };
  }

  // Full solve: minimum number of moves (slides) to free the target, or -1 if
  // unsolvable / above the state cap. Used by the level editor and generator.
  function solve(size, vehicles, cap) {
    const N = size;
    cap = cap || 200000;
    const M = vehicles.length;
    const ti = vehicles.findIndex((v) => v.target);
    if (ti < 0) return -1;
    const goalCol = N - vehicles[ti].len;
    const isH = vehicles.map((v) => v.orient === 'H');
    const len = vehicles.map((v) => v.len);
    const grid = new Int8Array(N * N);

    const start = new Int8Array(M);
    for (let i = 0; i < M; i++) start[i] = vehicles[i].row * N + vehicles[i].col;
    if (start[ti] % N === goalCol) return 0;

    const key = (s) => { let x = ''; for (let i = 0; i < M; i++) x += String.fromCharCode(s[i]); return x; };
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
        if (visited.size > cap) return -2; // too complex to verify (distinct from unsolvable)
      }
      frontier = next;
    }
    return -1;
  }

  window.Solver = { solveNext, solve };
})();
