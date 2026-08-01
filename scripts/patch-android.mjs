// Set the Android versionName / versionCode after `cap add/sync`.
// versionName  <- VERSION_NAME env or package.json version
// versionCode  <- VERSION_CODE env (e.g. CI run number) or 1
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gradle = resolve(root, 'android/app/build.gradle');
// Hard failure: a missing gradle file means `cap add android` broke — exiting 0
// here would let the build continue with template defaults (versionCode 1).
if (!existsSync(gradle)) { console.error('android/app/build.gradle not found — run `cap add android` first.'); process.exit(1); }

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const name = process.env.VERSION_NAME || pkg.version || '1.0.0';
const code = process.env.VERSION_CODE || '1';

// replace() is a silent no-op when the pattern is missing (e.g. a future
// Capacitor template switches to `versionCode = 1` assignment syntax) —
// verify every patch actually landed and fail the build otherwise.
function mustReplace(src, re, replacement, what) {
  if (!re.test(src)) { console.error(`FEHLER: Muster für ${what} nicht gefunden — Template geändert?`); process.exit(1); }
  return src.replace(re, replacement);
}

let s = readFileSync(gradle, 'utf8');
s = mustReplace(s, /versionCode\s+\d+/, `versionCode ${code}`, 'versionCode');
s = mustReplace(s, /versionName\s+"[^"]*"/, `versionName "${name}"`, 'versionName');
writeFileSync(gradle, s);
console.log(`patched android version -> name=${name} code=${code}`);

// ---- target/compile SDK -------------------------------------------------
// Google Play requires the target API to be within one year of the latest
// Android release. Raising targetSdk does NOT drop support for older devices
// (that is minSdk) — it only opts into the newer platform behaviour.
const TARGET_SDK = process.env.TARGET_SDK || '36';
const varsPath = resolve(root, 'android/variables.gradle');
if (existsSync(varsPath)) {
  let v = readFileSync(varsPath, 'utf8');
  v = v.replace(/compileSdkVersion\s*=\s*\d+/, `compileSdkVersion = ${TARGET_SDK}`);
  v = v.replace(/targetSdkVersion\s*=\s*\d+/, `targetSdkVersion = ${TARGET_SDK}`);
  writeFileSync(varsPath, v);
  console.log(`patched compileSdk/targetSdk -> ${TARGET_SDK}`);
}
// AGP warns/errors when compiling against an SDK newer than it was tested with;
// this acknowledges it explicitly.
const propsPath = resolve(root, 'android/gradle.properties');
if (existsSync(propsPath)) {
  let p = readFileSync(propsPath, 'utf8');
  if (!/suppressUnsupportedCompileSdk/.test(p)) {
    p += `\nandroid.suppressUnsupportedCompileSdk=${TARGET_SDK}\n`;
    writeFileSync(propsPath, p);
    console.log('added android.suppressUnsupportedCompileSdk');
  }
}

// ---- edge-to-edge system bars ------------------------------------------
// Targeting SDK 35+ forces edge-to-edge drawing; Capacitor's
// adjustMarginsForEdgeToEdge (capacitor.config.json) then insets the WebView,
// and the exposed margins show the window background. Make that background
// our app colour and keep the system-bar icons light, or a light-mode device
// paints white bars with dark icons around the dark game.
// NB: the activity runs with AppTheme.NoActionBar, whose explicit parent
// bypasses the base AppTheme — the items must go into that style.
// The game is a portrait layout (manifest.webmanifest already declares it for
// the PWA); lock the activity so landscape can't crop the board.
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');
if (existsSync(manifestPath)) {
  let mx = readFileSync(manifestPath, 'utf8');
  if (!/screenOrientation/.test(mx)) {
    mx = mustReplace(mx, /<activity\b/, '<activity\n            android:screenOrientation="userPortrait"', 'activity orientation');
    writeFileSync(manifestPath, mx);
    console.log('locked activity to portrait');
  }
}

const stylesPath = resolve(root, 'android/app/src/main/res/values/styles.xml');
if (existsSync(stylesPath)) {
  let x = readFileSync(stylesPath, 'utf8');
  if (!/windowLightStatusBar/.test(x)) {
    const items = [
      '        <item name="android:windowBackground">#ff141a26</item>',
      '        <item name="android:windowLightStatusBar">false</item>',
      '        <item name="android:windowLightNavigationBar">false</item>',
    ].join('\n');
    const before = x;
    x = x.replace(
      /(<style name="AppTheme\.NoActionBar"[^>]*>)/,
      `$1\n${items}`
    );
    if (x === before) { console.error('WARNING: AppTheme.NoActionBar not found in styles.xml — system bars not themed'); }
    else { writeFileSync(stylesPath, x); console.log('patched styles.xml for edge-to-edge system bars'); }
  }
}
