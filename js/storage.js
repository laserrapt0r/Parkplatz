/* Parkplatz - progress & settings persistence (localStorage) */
(function () {
  'use strict';

  const KEY = 'parkplatz.save.v1';

  const defaults = {
    lang: null,            // null -> auto-detect
    soundOn: true,
    musicOn: false,
    sfxVol: 0.9,
    musicVol: 0.5,
    colorblind: false,
    theme: 'tag',          // 'tag' | 'nacht' | 'neon'
    reduceMotion: 'auto',  // 'auto' | 'on' | 'off'
    gating: true,          // star-gating of tiers
    tipShown: false,       // one-time donation prompt shown?
    progress: {},          // { [levelId]: { stars, bestMoves } }
    daily: {},             // { [YYYY-MM-DD]: { stars, moves } }
    dailyPuzzles: {},      // { [YYYY-MM-DD]: puzzleObject }  (cache)
    custom: [],            // [ { id, name, minMoves, vehicles, stars, bestMoves } ]
    customSeq: 1,
  };

  function load() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
    const s = {};
    for (const k in defaults) {
      s[k] = (k in data) ? data[k] : (Array.isArray(defaults[k]) ? [] : (typeof defaults[k] === 'object' && defaults[k] !== null ? {} : defaults[k]));
    }
    // deep-ish defaults for objects
    s.progress = data.progress || {};
    s.daily = data.daily || {};
    s.dailyPuzzles = data.dailyPuzzles || {};
    s.custom = data.custom || [];
    return s;
  }

  let state = load();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ } }

  const Storage = {
    // ---- generic settings ----
    get lang() { return state.lang; },
    setLang(l) { state.lang = l; persist(); },
    get soundOn() { return state.soundOn; },
    setSound(on) { state.soundOn = !!on; persist(); },
    get musicOn() { return state.musicOn; },
    setMusic(on) { state.musicOn = !!on; persist(); },
    get sfxVol() { return state.sfxVol; },
    setSfxVol(v) { state.sfxVol = clamp01(v); persist(); },
    get musicVol() { return state.musicVol; },
    setMusicVol(v) { state.musicVol = clamp01(v); persist(); },
    get colorblind() { return state.colorblind; },
    setColorblind(on) { state.colorblind = !!on; persist(); },
    get theme() { return state.theme; },
    setTheme(t) { state.theme = t; persist(); },
    get reduceMotion() { return state.reduceMotion; },
    setReduceMotion(v) { state.reduceMotion = v; persist(); },
    get gating() { return state.gating; },
    setGating(on) { state.gating = !!on; persist(); },
    get tipShown() { return state.tipShown; },
    setTipShown(v) { state.tipShown = !!v; persist(); },

    // ---- campaign progress ----
    getLevel(id) { return state.progress[id] || null; },
    record(id, stars, moves) {
      const prev = state.progress[id];
      state.progress[id] = {
        stars: Math.max(stars, prev ? prev.stars : 0),
        bestMoves: prev ? Math.min(moves, prev.bestMoves) : moves,
      };
      persist();
      return state.progress[id];
    },
    totals() {
      let solved = 0, stars = 0;
      for (const k in state.progress) { solved++; stars += state.progress[k].stars || 0; }
      return { solved, stars };
    },

    // ---- daily ----
    getDaily(dateStr) { return state.daily[dateStr] || null; },
    recordDaily(dateStr, stars, moves) {
      const prev = state.daily[dateStr];
      state.daily[dateStr] = { stars: Math.max(stars, prev ? prev.stars : 0), moves: prev ? Math.min(moves, prev.moves) : moves };
      persist();
    },
    getDailyPuzzle(dateStr) { return state.dailyPuzzles[dateStr] || null; },
    setDailyPuzzle(dateStr, puzzle) {
      // keep only a few recent days
      state.dailyPuzzles[dateStr] = puzzle;
      const keys = Object.keys(state.dailyPuzzles).sort();
      while (keys.length > 7) delete state.dailyPuzzles[keys.shift()];
      persist();
    },

    // ---- custom levels ----
    getCustom() { return state.custom.slice(); },
    addCustom(name, minMoves, vehicles) {
      const id = state.customSeq++;
      const entry = { id, name: name || ('Level ' + id), minMoves, vehicles, stars: 0, bestMoves: null };
      state.custom.push(entry);
      persist();
      return entry;
    },
    deleteCustom(id) { state.custom = state.custom.filter((c) => c.id !== id); persist(); },
    recordCustom(id, stars, moves) {
      const c = state.custom.find((x) => x.id === id);
      if (!c) return;
      c.stars = Math.max(c.stars || 0, stars);
      c.bestMoves = c.bestMoves == null ? moves : Math.min(c.bestMoves, moves);
      persist();
    },

    resetAll() {
      const lang = state.lang;
      state = JSON.parse(JSON.stringify(defaults));
      state.lang = lang;
      persist();
    },
  };

  function clamp01(v) { v = +v; return v < 0 ? 0 : v > 1 ? 1 : v; }

  window.Storage = Storage;
})();
