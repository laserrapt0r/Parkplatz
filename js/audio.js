/* Parkplatz - synthesized sound effects via Web Audio API.
   No external audio files: everything is generated at runtime, so the game
   works fully offline from a plain file:// open. */
(function () {
  'use strict';

  let ctx = null;
  let master = null;      // sfx bus
  let musicBus = null;    // music bus
  let enabled = true;
  let sfxVol = 0.9;
  let musicVol = 0.5;
  let musicOn = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = sfxVol;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicVol * 0.5;
    musicBus.connect(ctx.destination);
  }

  // A short tone with an ADSR-ish envelope.
  function tone(opts) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const {
      freq = 440, type = 'sine', dur = 0.15, gain = 0.2,
      attack = 0.005, release = 0.08, glideTo = null, detune = 0,
    } = opts;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    osc.connect(g); g.connect(master);
    osc.start(t);
    osc.stop(t + dur + release + 0.02);
  }

  // Soft filtered noise burst (for the "engine / roll" flavour).
  function noise(opts) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const { dur = 0.18, gain = 0.15, freq = 700, q = 1.2 } = opts;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // ---- background music: a slow, gentle synthesized pad + arpeggio loop ----
  // A-minor pentatonic-ish progression, very quiet, purely generative.
  const MUSIC_ROOT = [220.0, 261.63, 293.66, 329.63, 392.0]; // A3 C4 D4 E4 G4
  const BASS = [110.0, 130.81, 146.83, 98.0]; // A2 C3 D3 G2 per bar
  function musicTick() {
    if (!ctx || !musicOn) return;
    const bar = Math.floor(musicStep / 8) % BASS.length;
    const t = ctx.currentTime;
    // bass note at start of each bar
    if (musicStep % 8 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = BASS[bar];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 1.7);
    }
    // soft arpeggio note
    const note = MUSIC_ROOT[(musicStep * 2 + bar) % MUSIC_ROOT.length] * (musicStep % 16 < 8 ? 1 : 1.5);
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = 'triangle'; o2.frequency.value = note;
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.06, t + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o2.connect(g2); g2.connect(musicBus); o2.start(t); o2.stop(t + 0.55);
    musicStep++;
  }
  function startMusic() {
    ensure();
    if (!ctx || musicTimer) return;
    musicOn = true;
    musicTick();
    musicTimer = setInterval(musicTick, 380);
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  const Audio = {
    get enabled() { return enabled; },
    setEnabled(on) { enabled = !!on; if (enabled) ensure(); },
    get musicEnabled() { return musicOn; },
    setMusicEnabled(on) {
      if (on) startMusic(); else stopMusic();
    },
    setSfxVol(v) { sfxVol = +v; if (master) master.gain.value = sfxVol; },
    setMusicVol(v) { musicVol = +v; if (musicBus) musicBus.gain.value = musicVol * 0.5; },
    // Must be called from a user gesture to unlock audio on most browsers.
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    click() { ensure(); tone({ freq: 520, type: 'triangle', dur: 0.05, gain: 0.12, release: 0.04 }); },

    pick() { ensure(); tone({ freq: 300, type: 'sine', dur: 0.06, gain: 0.12, glideTo: 360 }); },

    move() { ensure(); noise({ dur: 0.14, gain: 0.10, freq: 480, q: 0.9 }); tone({ freq: 200, type: 'sine', dur: 0.10, gain: 0.06, glideTo: 150 }); },

    snap() { ensure(); tone({ freq: 360, type: 'triangle', dur: 0.05, gain: 0.10, glideTo: 300 }); },

    blocked() { ensure(); tone({ freq: 150, type: 'sawtooth', dur: 0.12, gain: 0.10, glideTo: 110 }); },

    star(i) {
      ensure();
      const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
      tone({ freq: notes[i] || 523, type: 'triangle', dur: 0.22, gain: 0.22, release: 0.18 });
    },

    win() {
      ensure();
      const seq = [523.25, 659.25, 783.99, 1046.5];
      seq.forEach((f, i) => setTimeout(() => tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.2, release: 0.16 }), i * 90));
      setTimeout(() => tone({ freq: 392, type: 'sine', dur: 0.4, gain: 0.12, release: 0.3 }), 60);
    },

    engineOut() {
      ensure();
      // rising "drive away" swell
      tone({ freq: 90, type: 'sawtooth', dur: 0.55, gain: 0.14, glideTo: 260 });
      noise({ dur: 0.5, gain: 0.08, freq: 380, q: 0.6 });
    },
  };

  window.Sfx = Audio;
})();
