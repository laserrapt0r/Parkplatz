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

  window.Solver = { solveNext };
})();
