// Assemble the web app into www/ for Capacitor (webDir).
// Pure Node, no dependencies. Copies only the files the game needs to run.
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'www');

const ASSETS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const rel of ASSETS) {
  const src = resolve(root, rel);
  if (!existsSync(src)) { console.warn('skip (missing):', rel); continue; }
  cpSync(src, resolve(out, rel), { recursive: true });
}

console.log('built www/ from', ASSETS.filter((a) => existsSync(resolve(root, a))).join(', '));
