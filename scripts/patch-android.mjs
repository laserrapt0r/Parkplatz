// Set the Android versionName / versionCode after `cap add/sync`.
// versionName  <- VERSION_NAME env or package.json version
// versionCode  <- VERSION_CODE env (e.g. CI run number) or 1
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gradle = resolve(root, 'android/app/build.gradle');
if (!existsSync(gradle)) { console.error('android/app/build.gradle not found — run `cap add android` first.'); process.exit(0); }

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const name = process.env.VERSION_NAME || pkg.version || '1.0.0';
const code = process.env.VERSION_CODE || '1';

let s = readFileSync(gradle, 'utf8');
s = s.replace(/versionCode\s+\d+/, `versionCode ${code}`);
s = s.replace(/versionName\s+"[^"]*"/, `versionName "${name}"`);
writeFileSync(gradle, s);
console.log(`patched android version -> name=${name} code=${code}`);
