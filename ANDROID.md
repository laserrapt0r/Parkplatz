# Parkplatz → Android (Google Play)

This branch (`android`) wraps the Parkplatz web game into a native Android app
using **[Capacitor](https://capacitorjs.com/)**. The whole game is bundled into
the app — it runs fully offline, needs no server, no domain and no Digital Asset
Links.

- **Application ID:** `de.tommywurzbacher.parkplatz` *(permanent once published)*
- **App name:** Parkplatz
- **Output:** a signed **AAB** (Android App Bundle) for the Play Store.
- **Toolchain:** Node 20 · JDK 21 · Android SDK 35 · Capacitor 7.

The web app itself lives at the repo root (`index.html`, `css/`, `js/`, …). A
build step copies it into `www/`, which Capacitor packages into the app.

---

## What is automated vs. manual

### ✅ Automated (scripts / Docker / CI)
- Bundle web assets → `www/` (`scripts/build-www.mjs`)
- Add & sync the native Android project (`cap add` / `cap sync`)
- Generate app icons & splash screens from `resources/` (`@capacitor/assets`)
- Set `versionName` / `versionCode` (`scripts/patch-android.mjs`)
- Build a **signed** release **AAB** (`gradlew bundleRelease`, keystore from CI secrets)
- Upload the AAB to a Play track via the Play Developer API *(after one-time setup)*

### ❌ Manual (you / Google — cannot be automated)
- **Google Play Developer account** — one-time **25 USD** + identity verification
- Creating the app in Play Console, accepting policies/agreements
- Deciding on **Play App Signing** and safeguarding the **upload keystore**
- **Store listing:** description, screenshots (phone + tablet), feature graphic 1024×500
- **Privacy policy** URL (draft in [`PRIVACY.md`](PRIVACY.md) — host it, e.g. on GitHub Pages)
- **Content rating** (IARC questionnaire) and **Data safety** form
- Creating a Google Cloud **service account** to enable automated publishing
- Google's app **review** (hours to days)

---

## Build options

### Option A — Docker (reproducible, no local SDK needed)

A ready-made toolchain image is described in [`Dockerfile`](Dockerfile).

```bash
# 1) build the toolchain image once (~1.5 GB download)
docker build -t parkplatz-android-build .

# 2) build the AAB from the repo (produces an UNSIGNED release AAB)
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/workspace/.dockerhome \
  -e GRADLE_USER_HOME=/workspace/.gradle \
  -v "$PWD":/workspace \
  parkplatz-android-build bash scripts/build-in-docker.sh
```

Result: `android/app/build/outputs/bundle/release/app-release.aab`
(unsigned — fine for local inspection; sign it for the Play Store, see below).

> On systems where Docker needs root, prefix the commands with `sudo`.

### Option B — Local with Android Studio

```bash
npm install
npm run prepare:android      # build www, cap add/sync, set version
npm run assets               # generate icons & splash (optional)
npx cap open android         # opens Android Studio → Build > Generate Signed Bundle
```

Requires Node 20+, JDK 21 and the Android SDK (Android Studio installs it).

### Option C — GitHub Actions

[`.github/workflows/android.yml`](.github/workflows/android.yml) builds the AAB
on every `android-v*` tag or via **Run workflow**. Without signing secrets it
produces an *unsigned* AAB; with the secrets below it produces a *signed* one and
uploads it as a build artifact.

---

## Signing & Play App Signing

Use **Play App Signing** (recommended): Google holds the *app signing key*; you
keep an **upload key** used to sign what you upload.

Create an upload keystore (once, keep it safe & backed up):

```bash
keytool -genkeypair -v -keystore upload.jks -alias parkplatz \
  -keyalg RSA -keysize 2048 -validity 9125
```

For CI signing, add these **repository secrets** (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.jks` output |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `parkplatz` |
| `ANDROID_KEY_PASSWORD` | key password |

> **Never commit** the keystore or passwords. `*.jks` / `*.keystore` are
> git-ignored on this branch.

To sign a locally/Docker-built AAB by hand instead:

```bash
jarsigner -keystore upload.jks \
  android/app/build/outputs/bundle/release/app-release.aab parkplatz
```

---

## First release to Google Play (manual checklist)

1. Register at <https://play.google.com/console> (25 USD, verify identity).
2. **Create app** → name “Parkplatz”, default language, category *Games → Puzzle*, free.
3. Complete **App content**: privacy policy URL, data safety, content rating,
   target audience, ads (none).
4. Build a **signed AAB** (Option A/B/C above) and enrol in **Play App Signing**
   on first upload.
5. Upload to **Internal testing** first → install on a device → verify.
6. Fill the **store listing** (description, screenshots, feature graphic, icon).
7. Promote to **Production** and submit for review.

### Store-listing assets you need
- App icon 512×512 (have `icons/icon-512.png`)
- Feature graphic 1024×500 (needs to be created)
- ≥ 2 phone screenshots (generate from the game — I can help)
- Short (≤ 80 chars) + full (≤ 4000 chars) description
- Privacy policy URL (see `PRIVACY.md`)

---

## Versioning

`versionName` (human) comes from the `android-vX.Y.Z` tag or the
`versionName` workflow input; `versionCode` (must strictly increase for every
upload) is the CI run number. Locally it defaults to `package.json`'s version and
code `1` — bump `VERSION_CODE` for each new upload:

```bash
VERSION_NAME=1.0.1 VERSION_CODE=2 node scripts/patch-android.mjs
```

---

## Notes
- `android/`, `www/`, `node_modules/`, `.gradle/` are generated and git-ignored.
  If you want to customize native code, remove `android/` from `.gitignore` and
  commit it.
- Target/compile SDK is 35 (Capacitor 7) — meets current Google Play targeting
  requirements.
