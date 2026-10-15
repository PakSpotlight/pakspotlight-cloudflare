# Classic TV Pakistan — Android app

The archive as an Android app: **Expo SDK 51 + React Native 0.74.5**, `minSdk 23` (Android 6.0),
signed APK distributed from classictvpakistan.com. The design language is specified in
[`docs/android-app-plan.md`](../docs/android-app-plan.md) §7.

## Why Expo SDK 51

Android 6 is a hard requirement, and Expo SDK 52 raised the floor to Android 7. SDK 51 is therefore
the newest Expo that still builds for API 23. It brings React Native 0.74.5, Expo Router 3.5 and
Metro's web target — which is why the same code runs as a browser preview and as an APK.

The app is deliberately **not** on the Play Store: Play now requires `targetSdk` 36 and 16 KB
page-size alignment, neither of which this RN version produces. The APK is downloaded directly.

## Preview in the browser

```bash
cd mobile
npm install
npm run web          # http://localhost:8081
```

Expo Router gives every screen a URL, so the browser preview is the fastest way to iterate on the
design: `/` (Home), `/browse`, `/library`, `/drama/26`, `/watch/26`.

Platform differences are handled with file extensions, not branches:

| File | Used by |
|---|---|
| `src/components/Player.tsx` | Android — `react-native-webview` with the YouTube embed |
| `src/components/Player.web.tsx` | Web — a plain `iframe` (keeps the WebView out of the web bundle) |

## Build the APK

No JDK or Android SDK is needed on this machine — the build runs in CI
([`.github/workflows/android.yml`](../.github/workflows/android.yml)):

1. Add the signing secrets to the repository (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
2. Actions → **Android APK** → Run workflow.

The workflow runs `expo prebuild` → `gradlew assembleRelease`, uploads the APK as an artifact,
publishes it as a GitHub release, and rewrites [`public/app/latest.json`](../public/app/latest.json)
so `/get-app` and the in-app update check point at the new build.

Without signing secrets the workflow still builds and uploads an **unsigned** APK for device
smoke-testing. Never distribute that one — Android will refuse the install and updates will fail.

Local build (only if you install Temurin JDK 17 + Android cmdline-tools):

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

## Design tokens

`src/theme.ts` is the single source of truth. The rules that keep the app looking like one thing:

- **Black canvas.** The lime accent `#C6F32A` appears on exactly five things: active tab underline,
  active bottom-nav item, progress line, count badge, and the Roman-Urdu brush line. Nowhere else.
- **White pill is the only primary action.** Never an accent-filled button.
- **Depth comes from scrims and hairlines**, not shadows — Android 6 hardware can't afford them.
- **2:3 posters** (`POSTER_RATIO`) everywhere, 20 dp gutters (`gutter`), 8 dp spacing scale.
- Fonts are bundled, never fetched: Archivo (400/500/700/800/900), Noto Nastaliq Urdu for
  `urdu_title`, Permanent Marker for the brush line.

## Data

Read-only against the same public Supabase endpoints the website uses — no `@supabase/supabase-js`,
no auth, no writes. `src/lib/api.ts` caches the catalog in AsyncStorage for 3 minutes and falls back
to the cache (flagged `stale`, which the Home screen surfaces) when the network fails.

`src/lib/dramas.ts` is a port of the website's grouping rules
(`mapRow`, `groupDramas`, `isSeries`, `cleanDramaTitle`, `parseEpisodeNumber`, `extractYouTubeId`).
If the site's rules change, change them here too — the two surfaces are expected to agree.

## Playback

Episodes are YouTube videos, so the app embeds the official player (never extracts streams). Two
hard-won rules live in `src/lib/youtube.ts`:

1. The embed must send a real `Referer`, or YouTube refuses to play (error 153,
   `embedder.identity.missing.referrer`). On Android the player document is loaded with
   `baseUrl=https://classictvpakistan.com` and a `referrerpolicy` meta tag; on web the iframe carries
   `referrerPolicy`.
2. Every player screen keeps a visible **Watch on YouTube** escape hatch, because old Android
   WebViews do fail — and that is the honest fix, not a nicer error message.

## Layout

```
mobile/
  app/                    Expo Router routes (thin — they render src/screens/*)
    (tabs)/               Home · Browse · My Library
    drama/[id].tsx        Series detail
    watch/[id].tsx        Player
    watch/index.tsx       Deep-link shim for the website's /watch?id=N share URLs
  src/
    theme.ts              Design tokens
    components/           PosterCard, Hero, SectionRow, Chip, PillButton, GhostAction, Player…
    screens/              HomeScreen, BrowseScreen, LibraryScreen, DramaScreen, WatchScreen
    lib/                  api, dramas, storage, catalog (context), youtube, update, confirm
```
