# Parkplatz 🚗

A sliding-block traffic puzzle in the spirit of *Rush Hour*, built as a single
self-contained HTML5 game. Clear a path for the red car so it can drive out of
the crowded parking lot. **100 hand-verified puzzles** across four difficulty
tiers, animated top-down graphics, synthesized sound effects, a three-star
rating and full German / English localization.

**No build step, no dependencies, no internet.** Just open `index.html`.

## ▶️ Play online

**→ [https://laserrapt0r.github.io/Parkplatz/](https://laserrapt0r.github.io/Parkplatz/)**

The game is deployed automatically to GitHub Pages on every push to `main`
(see [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)).

---

## Features

- **100 unique puzzles**, split into four tiers — *Easy · Medium · Hard · Very hard*.
  None of them is trivial.
- **Provably minimal solutions.** Every puzzle's minimum move count was computed
  by an exhaustive breadth-first search over the whole reachable state graph, and
  independently re-verified by a separate solver. Every puzzle is guaranteed
  solvable.
- **Three-star rating.** Match the theoretical minimum number of moves and you
  earn all three stars — the stars show how close you got to a perfect run.
- **Four vehicle types:** motorcycles, cars, buses and trucks, each rendered in
  a distinct top-down style.
- **Mouse (and touch) controls** — grab a vehicle and slide it along its lane.
- **Smooth animations:** eased sliding, a drive-out sequence through the exit,
  pulsing exit chevrons and animated star rewards.
- **Synthesized audio** via the Web Audio API — no audio files needed, works
  fully offline.
- **Level select** with per-level star display and **progress saved** in your
  browser (`localStorage`).
- **Bilingual UI:** German and English, switchable at any time (auto-detected on
  first launch).
- **Helpers:** Undo, Restart and an optimal-move **Hint** (solved live in the
  browser).

---

## How to play

1. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).
2. Press **Play / Spielen** and choose a level.
3. Drag vehicles with the mouse. Each vehicle only moves along its own axis and
   cannot pass through or overlap another.
4. Free the **red car** and slide it out through the exit gap on the right.
5. Solve it in as few moves as possible — matching the minimum earns 3 stars.

That's it — nothing to install.

### Controls

| Action        | How                                    |
|---------------|----------------------------------------|
| Move vehicle  | Click & drag (mouse) or touch & drag   |
| Undo          | **Undo / Rückgängig** button           |
| Restart level | **Restart / Neustart** button          |
| Hint          | **Hint / Tipp** button                 |
| Language      | **DE / EN** button (top right)         |
| Sound on/off  | Speaker button (top right)             |

---

## Difficulty tiers

Puzzles are ordered so difficulty ramps up smoothly. Difficulty is measured by
the minimum number of moves (a *move* = sliding one vehicle any distance in a
single direction — the classic Rush Hour convention).

| Tier         | Levels  | Typical minimum moves |
|--------------|---------|-----------------------|
| Easy         | 1–25    | ~6–10                 |
| Medium       | 26–50   | ~10–16                |
| Hard         | 51–75   | ~17–22                |
| Very hard    | 76–100  | ~22–33                |

---

## Star rating

- ⭐⭐⭐ — solved in the minimum number of moves (a perfect run)
- ⭐⭐ — a little over the minimum
- ⭐ — solved, but well over the minimum

Your best result per level is stored and shown on the level-select screen.

---

## Project structure

```
Parkplatz/
├── index.html            # Game shell / markup
├── css/
│   └── style.css         # Styling and animations
├── js/
│   ├── puzzles-data.js   # The 100 generated puzzles (auto-generated)
│   ├── i18n.js           # German / English strings
│   ├── storage.js        # Progress & settings (localStorage)
│   ├── audio.js          # Web Audio sound effects
│   ├── solver.js         # In-browser BFS solver (used for hints)
│   └── game.js           # Rendering, input, game flow
├── tools/
│   ├── generate.js       # Puzzle generator + BFS minimum-move solver
│   └── verify.js         # Independent solvability / minimum verifier
├── .gitignore
└── README.md
```

---

## Regenerating the puzzles

The puzzles are pre-generated and committed in `js/puzzles-data.js`, so you never
need to run the generator to play. If you want to create a fresh set:

```bash
node tools/generate.js   # writes js/puzzles-data.js (deterministic, seeded)
node tools/verify.js     # re-solves all 100 puzzles to confirm correctness
```

The generator works by *harvesting whole state graphs*: it builds a set of
vehicles, enumerates every reachable arrangement, and — because sliding moves are
reversible — runs a multi-source BFS from the solved arrangements to obtain the
exact minimum move count for every arrangement at once. It then selects 100
puzzles along a smooth difficulty curve. A fixed random seed makes the output
reproducible.

Requires Node.js (no npm packages).

---

## Tech

Vanilla JavaScript, HTML5 Canvas and the Web Audio API. No frameworks, no
external assets, no network requests — the whole game runs from the local files.

## License

MIT — see below.

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
