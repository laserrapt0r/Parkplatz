#!/usr/bin/env bash
# Runs INSIDE the parkplatz-android-build container (see ANDROID.md / Dockerfile).
# Produces an (unsigned) release AAB from the mounted repo at /workspace.
set -euo pipefail
cd /workspace

echo "== toolchain =="
echo "node $(node -v) | npm $(npm -v)"
java -version
echo "ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-unset}"

echo "== install deps =="
npm install --no-audit --no-fund

echo "== build web bundle =="
node scripts/build-www.mjs

echo "== add/sync android platform =="
if [ ! -d android ]; then npx --yes cap add android; fi
npx cap sync android

echo "== version =="
node scripts/patch-android.mjs || true

echo "== generate icons/splash (optional) =="
if [ -f resources/icon.png ]; then
  npx --yes @capacitor/assets generate --iconBackgroundColor '#141a26' --splashBackgroundColor '#141a26' --splashBackgroundColorDark '#0b0e15' || echo "asset generation skipped"
fi

echo "== gradle bundleRelease =="
cd android
./gradlew --no-daemon bundleRelease

echo "== output =="
ls -la app/build/outputs/bundle/release/ || true
