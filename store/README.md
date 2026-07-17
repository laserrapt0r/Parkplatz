# Play Store assets

Everything you need for the Google Play listing. Generated at 1× the required
sizes — no resizing needed.

## Contents

| File | Play Console field | Spec |
|------|--------------------|------|
| `../icons/icon-512.png` | App icon | 512×512 PNG |
| `feature-graphic.png` | Feature graphic | 1024×500, no alpha ✔ |
| `screenshots/phone-de/*.png` | Phone screenshots (German listing) | 1080×1920 |
| `screenshots/phone-en/*.png` | Phone screenshots (English listing) | 1080×1920 |
| `listing-de.md` | German title / short / full description | — |
| `listing-en.md` | English title / short / full description | — |
| `listings-short.md` | Short descriptions for all 15 locales | ≤ 80 chars |

Screenshots included per language: **menu, board, level select, editor, win,
neon theme** (6 each — Play allows 2–8 per language).

> Tablet screenshots are optional. If you want to declare tablet support I can
> render a 7"/10" set too — just ask.

## Upload order (Play Console → Main store listing)
1. App name → `Parkplatz`
2. Short + full description → from `listing-de.md` / `listing-en.md`
3. App icon → `icons/icon-512.png`
4. Feature graphic → `feature-graphic.png`
5. Phone screenshots → `screenshots/phone-de` (and `-en` under the English listing)
6. Other locales → short descriptions from `listings-short.md`

## Don't forget (App content section)
- **Privacy policy URL** — host `../PRIVACY.md` (e.g. GitHub Pages) and set a real
  contact address in it first.
- **Data safety** → "No data collected / shared" (the app stores progress only
  locally and makes no network requests).
- **Content rating** (IARC questionnaire) → a simple puzzle game, no sensitive
  content.
- **Ads** → No.

## Signing with your existing keystore

Your keystore: `/home/tommy/Nextcloud/Keystore/keystore` — a valid Java KeyStore
(JKS). Use it as the **upload key** (Play App Signing then manages the app key).

Find the alias (you'll be asked for the store password):
```bash
keytool -list -v -keystore /home/tommy/Nextcloud/Keystore/keystore
```

Sign a locally/Docker-built AAB:
```bash
jarsigner -keystore /home/tommy/Nextcloud/Keystore/keystore \
  android/app/build/outputs/bundle/release/app-release.aab <ALIAS>
```

For automated CI signing, add these repository **secrets**
(Settings → Secrets and variables → Actions):
```bash
base64 -w0 /home/tommy/Nextcloud/Keystore/keystore   # -> ANDROID_KEYSTORE_BASE64
```
| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | base64 of the keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | the alias from `keytool -list` |
| `ANDROID_KEY_PASSWORD` | key password (often same as store password) |

> If this 2015 keystore uses a weak/old algorithm, Play still accepts it as an
> upload key. Keep it backed up — losing the upload key means resetting it with
> Google support.
