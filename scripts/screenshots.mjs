#!/usr/bin/env node
/*
 * Renders the whole Play Store screenshot set from the live game.
 *
 *   node scripts/screenshots.mjs            # everything
 *   node scripts/screenshots.mjs phone      # one device folder
 *   CHROME=/usr/bin/google-chrome node scripts/screenshots.mjs
 *
 * Each shot is a fresh headless Chromium run against a temporary copy of
 * index.html with two injected scripts: one seeds localStorage (language,
 * theme, fake progress) before the game boots, the other drives the UI to the
 * screen we want. Sizes come straight from --window-size x --force-device-
 * scale-factor, so the PNGs land at the exact resolutions Play expects.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/snap/bin/chromium';
const OUT = join(ROOT, 'store', 'screenshots');

// css size x device scale factor = the resolution Play asks for
const DEVICES = [
  { dir: 'phone', css: [360, 640], dsf: 3 },      // 1080x1920
  { dir: 'tablet-7', css: [600, 960], dsf: 2 },   // 1200x1920
  { dir: 'tablet-10', css: [800, 1280], dsf: 2 }, // 1600x2560
];
const LANGS = ['de', 'en'];

// Levels chosen to show off the vehicle mix (motorcycles, buses, trucks).
const BOARD_LEVEL = 51;
const NEON_LEVEL = 34;
const WIN_LEVEL = 1; // minMoves 6 -> a perfect 3-star finish

// Plausible mid-campaign progress: 12 solved, 31 stars.
const PROGRESS = {};
const seedStars = { 1: 3, 2: 3, 3: 3, 4: 3, 16: 3, 17: 3, 18: 3, 19: 2, 41: 3, 42: 2, 43: 2, 66: 1 };
for (const [id, stars] of Object.entries(seedStars)) PROGRESS[id] = { stars, bestMoves: 12 };

const baseSeed = {
  soundOn: true, musicOn: false, sfxVol: 0.9, musicVol: 0.5,
  colorblind: false, theme: 'tag', reduceMotion: 'on',
  gating: true, tipShown: true, progress: {}, daily: {}, dailyPuzzles: {},
  custom: [], customSeq: 1,
};

// --- the little driver snippets that run inside the page -------------------
const openLevel = (id) => `
  $('btn-play').click();
  setTimeout(function () { document.querySelectorAll('.level-btn')[${id - 1}].click(); }, 150);`;

const SHOTS = [
  { name: 'menu', seed: { progress: PROGRESS }, drive: '' },
  { name: 'levels', seed: { progress: PROGRESS }, drive: `$('btn-play').click();` },
  { name: 'board', seed: { gating: false }, drive: openLevel(BOARD_LEVEL) },
  {
    name: 'win', seed: { gating: false }, drive: `${openLevel(WIN_LEVEL)}
    setTimeout(function () { solveCurrent(${WIN_LEVEL}); }, 400);`,
  },
  { name: 'neon', seed: { gating: false, theme: 'neon' }, drive: openLevel(NEON_LEVEL) },
  {
    name: 'editor', seed: {}, drive: `
    $('btn-editor').click();
    setTimeout(function () {
      var tries = 0;
      (function attempt() {
        $('btn-ed-random').click();
        if ($('editor-status').className.indexOf('ok') >= 0 || ++tries > 40) return;
        setTimeout(attempt, 20);
      })();
    }, 150);`,
  },
];

// Solves a campaign level optimally through the keyboard controls, so the win
// overlay shows a genuine "perfect" run (moves === minimum).
const SOLVER_DRIVER = `
  function press(key) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
  }
  function solveCurrent(levelId) {
    var P = (window.PARKPLATZ_PUZZLES || []).filter(function (p) { return p.id === levelId; })[0];
    if (!P || !window.Solver) return;
    var veh = P.vehicles.map(function (v) { return Object.assign({}, v); });
    var N = P.size, ti = -1;
    veh.forEach(function (v, i) { if (v.target) ti = i; });
    var goal = N - veh[ti].len, moves = [];
    for (var guard = 0; guard < 80; guard++) {
      var m = window.Solver.solveNext(N, veh);
      if (!m) break;
      if (m.axis === 'H') veh[m.index].col += m.delta; else veh[m.index].row += m.delta;
      moves.push(m);
    }
    moves.push({ index: ti, axis: 'H', delta: goal - veh[ti].col });

    var sel = null, len = veh.length;
    moves.forEach(function (m) {
      if (sel === null) { press('Tab'); sel = 0; }
      while (sel !== m.index) { press('Tab'); sel = (sel + 1) % len; }
      var key = m.axis === 'H' ? (m.delta > 0 ? 'ArrowRight' : 'ArrowLeft')
                               : (m.delta > 0 ? 'ArrowDown' : 'ArrowUp');
      for (var k = 0; k < Math.abs(m.delta); k++) press(key);
    });
  }`;

function buildPage(seed, drive) {
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const boot = `<script>try{localStorage.setItem('parkplatz.save.v1',${JSON.stringify(JSON.stringify(seed))});}catch(e){}</script>\n`;
  html = html.replace('<script src="js/puzzles-data.js"></script>', boot + '<script src="js/puzzles-data.js"></script>');
  // Freeze CSS transitions so nothing is caught mid-fade.
  html = html.replace('</head>', '<style>*{animation:none!important;transition:none!important}</style></head>');
  html = html.replace("navigator.serviceWorker.register('sw.js')", 'Promise.resolve()');
  const driver = `<script>
${SOLVER_DRIVER}
  window.addEventListener('load', function () {
    var $ = function (id) { return document.getElementById(id); };
    setTimeout(function () {${drive}
    }, 300);
  });
  </script>\n`;
  return html.replace('</body>', driver + '</body>');
}

function shoot(device, lang, shot) {
  const seed = Object.assign({}, baseSeed, { lang }, shot.seed);
  const tmp = join(ROOT, `._shot-${device.dir}-${lang}-${shot.name}.html`);
  writeFileSync(tmp, buildPage(seed, shot.drive));
  const dir = join(OUT, `${device.dir}-${lang}`);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${shot.name}.png`);
  try {
    execFileSync(CHROME, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      `--force-device-scale-factor=${device.dsf}`,
      `--window-size=${device.css[0]},${device.css[1]}`,
      '--virtual-time-budget=4000',
      `--screenshot=${out}`,
      `file://${tmp}`,
    ], { stdio: 'ignore', timeout: 60000 });
  } finally {
    rmSync(tmp, { force: true });
  }
  return out;
}

const only = process.argv[2];
for (const device of DEVICES) {
  if (only && device.dir !== only) continue;
  for (const lang of LANGS) {
    for (const shot of SHOTS) {
      const out = shoot(device, lang, shot);
      console.log(`${device.dir}-${lang}/${shot.name}.png`, `(${device.css[0] * device.dsf}x${device.css[1] * device.dsf})`);
      void out;
    }
  }
}
console.log('done');
