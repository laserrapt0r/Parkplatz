/* Parkplatz - progress & settings persistence (localStorage) */
(function () {
  'use strict';

  const KEY = 'parkplatz.save.v1';

  const defaults = {
    lang: null,           // null -> auto-detect
    soundOn: true,
    progress: {},         // { [levelId]: { stars, bestMoves } }
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...defaults, progress: {} };
      const data = JSON.parse(raw);
      return {
        lang: data.lang || null,
        soundOn: data.soundOn !== false,
        progress: data.progress || {},
      };
    } catch (e) {
      return { ...defaults, progress: {} };
    }
  }

  let state = load();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* ignore quota / private mode */ }
  }

  const Storage = {
    get lang() { return state.lang; },
    setLang(l) { state.lang = l; persist(); },

    get soundOn() { return state.soundOn; },
    setSound(on) { state.soundOn = !!on; persist(); },

    getLevel(id) {
      return state.progress[id] || null;
    },

    // Record a result; keeps the best star / lowest move count seen.
    record(id, stars, moves) {
      const prev = state.progress[id];
      if (!prev || stars > prev.stars || (stars === prev.stars && moves < prev.bestMoves)) {
        state.progress[id] = {
          stars: Math.max(stars, prev ? prev.stars : 0),
          bestMoves: prev ? Math.min(moves, prev.bestMoves) : moves,
        };
      } else {
        // still track a lower move count even if star didn't improve
        state.progress[id] = {
          stars: prev.stars,
          bestMoves: Math.min(moves, prev.bestMoves),
        };
      }
      persist();
      return state.progress[id];
    },

    totals() {
      let solved = 0, stars = 0;
      for (const k in state.progress) {
        solved++;
        stars += state.progress[k].stars || 0;
      }
      return { solved, stars };
    },

    reset() {
      state = { ...defaults, progress: {} };
      persist();
    },
  };

  window.Storage = Storage;
})();
