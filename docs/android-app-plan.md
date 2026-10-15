# Classic TV Pakistan — Android App Plan (React Native → APK, Android 6+)

Status: draft for approval · Written: 15 Oct 2026 · Owner: (you) · Target: public v1.0 APK

---

## 1. Summary and recommendation

Ship a **bare React Native app pinned to 0.75.x** that reads the same Supabase data the website reads,
plays episodes in a WebView with a hard fallback to the YouTube app, and is distributed as a
**signed APK from classictvpakistan.com** (no Play Store in v1).

Three facts drive every decision below:

1. **Android 6.0 = API 23. React Native 0.75 is the last RN version that supports API 23.**
   RN 0.76+ raised `minSdk` to 24 (Android 7.0). So "Android 6 or later" permanently pins us to
   RN 0.75.x and to library versions from that same era. This cannot be negotiated away by config —
   newer RN core code and newer community libraries assume API 24+.
2. **Google Play now requires `targetSdk` 36 (Android 16) for new apps** (since 31 Aug 2026) and a
   16 KB page-size-compatible build (Play deadline reported as 1 Feb 2027). An RN 0.75 build is
   EOL software; getting it through Play is possible in theory and expensive in practice.
   Direct APK distribution sidesteps all of it, and matches how this audience installs apps anyway.
3. **Playback is the real risk, not the UI.** Android 6 ships Chromium 44 as its WebView (updatable
   through the Play Store, but only as far as the device's WebView branch goes), and YouTube's embedded
   player now also demands a proper `Referer` header or it throws `embedder.identity.missing.referrer`
   (player error 153). The app must always have "open in YouTube app" as a first-class path.

Everything else — browsing, search, series grouping, My List, recommendations — is straightforward porting
of logic that already exists in `public/js/shared.js`.

**Confirmed decisions (15 Oct 2026):** distribution is a direct APK from classictvpakistan.com (no Play Store
in v1); no user accounts in v1 (My List stays on the device); the app's UI/UX follows the **ARY Plus**
design language (`com.release.arylive`), specified in §7. A copy of Anthropic's `frontend-design` skill is
installed in `.opencode/skills/frontend-design/` so UI work follows a deliberate design process rather than
defaults.

---

## 2. Options considered

| Option | Android 6 support | Speed to ship | Quality / upside | Verdict |
|---|---|---|---|---|
| **A. React Native 0.75 (bare)** | Yes (`minSdk 23`) | 13–18 days | Native feel, offline-friendly cache, deep links, push later, APK we control | **Recommended** |
| B. WebView shell of the existing site (Capacitor / plain Activity) | Yes — the site already targets Chrome 75 / Android 6 | 3–5 days | Zero rewrite, but depends on the device WebView (likely old on Android 6), feels like a browser, no reliable deep-link/push story | Good fallback / emergency shipping path |
| C. PWA + TWA (Play) | Weak — TWA needs a modern Chrome and Play distribution | 1–2 days | Best Lighthouse numbers, worst install flow for this audience | Not viable here |

B remains the "if we must ship something this week" escape hatch; nothing in this plan blocks it.

---

## 3. Scope

### In the app (v1)
- Home: featured hero slider, category rows, Continue Watching row.
- Browse: poster grid, search, category filter, sorting by year/series.
- Series/drama detail: poster, Urdu title, writer/director/cast, episode list, recommendations.
- Player: YouTube embed, episode switching, keep-screen-on, landscape/fullscreen, fallback to YouTube app.
- My List (local storage) and watch progress/Continue Watching (local, on-device).
- Share, deep links (`classictvpakistan.com/watch?id=…` opens the app), pull-to-refresh, offline error states.
- Update check: tells the user when a newer APK exists.

### Stays on the web
- `admin.html` and all AI tooling (`/api/ai-autofill`, playlist import, thumbnails, curation).
- SEO pages, sitemap, SSR — untouched.

### Explicitly not in v1
- Offline downloads (YouTube-hosted content; also a ToS problem).
- Chromecast, comments, ratings, Play Store listing, iOS.
- Synced accounts. (Phase M6: Supabase login + My List sync.)

---

## 4. Architecture

```
React Native app (Android 6+)
  ├─ reads catalog  ──► Supabase REST (same publishable key the site already exposes)
  │                      table "Drama" (select=*), storage config/categories.json, config/featured.json
  ├─ plays video    ──► WebView → https://www.youtube.com/embed/<id>  (Referer: https://classictvpakistan.com/)
  │                      fallback → Linking "vnd.youtube:<id>" → https://youtu.be/<id>
  ├─ local state    ──► AsyncStorage (my list, progress, cache, install id)
  └─ telemetry      ──► GET https://classictvpakistan.com/api/app/ping?v=<versionCode>&i=<anon id>   (to be added)
```

- **No new data layer.** The anon key and RLS read policy already make the catalog public; the app uses the
  same endpoints the website uses. Phase 2 can add one aggregated `GET /api/app/catalog` (ETag + Cache API)
  if we want fewer requests and less mobile data. Not needed for v1.
- **The Worker stays the only place with secrets.** Nothing new is exposed by shipping an APK.
- **RN networking has no CORS**, so no Worker CORS change is required.
- Keep the native dependency surface at four libraries (navigation, screens/safe-area, webview, async-storage)
  — every extra library is another thing that may not support API 23.

---

## 5. Tech stack (pin these exact ranges)

| Concern | Choice | Notes |
|---|---|---|
| React Native | **0.75.5** (last 0.75 patch) | Last version supporting API 23; old architecture (`newArchEnabled=false`) |
| Architecture | Legacy "Paper" | New arch + RN 0.75 was unstable for libraries; not worth the risk |
| JS engine | Hermes (default) | Smaller, faster on 1–2 GB RAM devices. Keep JSC as a one-line fallback if API 23-only crashes appear |
| Navigation | `@react-navigation/native` 6.x, `native-stack` 6.x, `bottom-tabs` 6.x | Matches RN 0.75 era |
| Native deps | `react-native-screens` 3.34.x, `react-native-safe-area-context` 4.10.x, `react-native-webview` 13.12.x, `@react-native-async-storage/async-storage` 1.24.x | **Pin react-native-webview below the version that dropped API 23 and moved to new-arch-only** |
| Language | TypeScript (template default) | Easier refactors; not the same constraint as the browser — Hermes supports modern syntax, so the ES2019 rule does *not* apply inside `app/` |
| Data fetching | Plain `fetch` + a thin `api.js` (+ optional React Query 5) | No `@supabase/supabase-js`, no URL polyfill — the viewer app only needs reads |
| Images | RN built-in `Image` + `prefetch` for v1; evaluate `@d11/react-native-fast-image` later | Avoids an extra native dep on day one |
| Build | GitHub Actions (ubuntu + JDK 17 + Android SDK) | This machine has no JDK or Android SDK installed; CI produces the APK |
| Gradle/SDK config | `minSdkVersion 23`, `compileSdk 34`, `targetSdk 34`, Kotlin 1.9.25, NDK 26.1.10909125, AGP 8.5.x | RN 0.75 defaults (0.75.5 already bumps Kotlin to 1.9.25); keep targetSdk 34 for sideloading (Play would need 36 — different track) |
| ABIs | release: `armeabi-v7a` + `arm64-v8a`; debug: + `x86` for the API 23 emulator | Most Android 6 devices are 32-bit ARM |

---

## 6. Repo layout and files touched

```
app/                                  NEW  React Native project (own package.json)
  src/screens, src/components, src/lib (api.js, storage.js, youtube.js, theme.js)
  android/…                           minSdk 23, signing config via env vars
  .gitignore                          android/build, app/build, *.keystore, *.jks
.github/workflows/android.yml         NEW  build + sign + attach APK to a GitHub Release
public/app/latest.json                NEW  { "versionCode": 2, "versionName": "1.0.1", "apkUrl": "…", "notes": "…" }
public/.well-known/assetlinks.json    NEW  App Links verification (SHA-256 of the release cert)
public/get-app.html                   NEW  download page (add "/get-app.html": "/get-app" to CLEAN_HTML_PATHS in src/index.js)
src/index.js                          MOD  /api/app/ping (anonymous launch counter) + /get-app clean path
docs/android-app-plan.md              NEW  this document
AGENTS.md                             MOD  after approval: Android rules (versionCode bump, release-build test, keystore handling)
package.json                          MOD  convenience scripts: "app:lint", "app:build" (or leave app/ standalone)
```

`wrangler.jsonc` needs no change: assets are served from `public/`, and the new `app/` folder is never deployed.
`npm run check:es2019` only scans `public/**` — the React Native code is unaffected by the ES2019 rule.

---

## 7. UI/UX design language — ARY Plus as the reference

Reference studied on 15 Oct 2026 from the ARY Plus Play Store listing (`com.release.arylive`) and aryplus.tv:
app icon, five in-app screens (detail, player, My Library, Snips feed) and the marketing art. We take its
**structure and colour logic**. We do not copy its brand mark, wordmark, name, or marketing illustrations.

### 7.1 Observed system, element by element

| Element | ARY Plus | Classic TV Pakistan app |
|---|---|---|
| Canvas | pure black `#000`, faint vertical stripe texture, one lime glow behind the hero | Same — but only one static glow, hero only |
| Accent | acid lime, spent on exactly five things: active tab underline, active nav item, progress bar, "exclusive" badge, Roman-Urdu taglines | Same discipline (accent colour: see §7.7) |
| Primary CTA | solid white pill, black label, play glyph, ~48 px tall | "Play episode 1" / "Continue episode 7" |
| Secondary actions | row of three circular ghost buttons with small labels underneath | My list · Share · Watch on YouTube |
| Chips | translucent dark pill, 1px hairline border, sentence case | "26 episodes", "1984", "PTV Classic" |
| Poster card | 2:3, ~12 px radius, badge slot top-left | Badge = episode count; series cards show "Series" |
| Detail screen | full-bleed still → gradient scrim to black → title, meta line, CTA, actions, description, tabs | Same structure + the portrait-artwork rule in §7.3 |
| Tabs | accent underline on the active tab, grey inactive, sentence case | Episodes / More info / Related |
| Bottom nav | 4 items, icon + label, active item fully in accent | 3 items: Home / Browse / My Library |
| Player | chrome-free, ±10 s circular buttons, thin accent progress bar, "More episodes / Next episode" bar | Same + our YouTube fallback affordance |
| Signature device | Roman-Urdu brush-script taglines in accent over black | Same device, our own copy (e.g. "Purani yaadein, nayi nazar") |

### 7.2 Type

- **UI/display:** one heavy geometric grotesque (ExtraBold for titles, Regular/Medium for body). Bundled in the
  APK — never downloaded. Old devices have no variable-font support and must not wait on a font request.
- **Urdu:** Noto Nastaliq Urdu, bundled, used for `urdu_title` on detail screens and over posters whose artwork
  lacks Urdu. This is the strongest archive-specific move: ARY Plus renders Urdu Nastaliq on its posters, and our
  `Drama` rows already carry `urdu_title`, so the app can finally show it.
- **Accent script:** one brush/marker face, used *only* for the Roman-Urdu line under a section header. One
  accent moment per screen, never on buttons or navigation.
- Type scale (dp): 28/22/18/16/14/12 with 1.2–1.4 line heights; titles in sentence case.

### 7.3 Layout rules

- **Hero rule:** if the featured row's thumbnail is landscape (w/h ≥ 1.3) use full-bleed still + scrim; if it is
  portrait (as most archive posters are) use a split hero — poster at 40% width, title/meta/CTA column beside it.
  Never stretch a poster to 16:9.
- 8 px spacing scale (4/8/12/16/24/32), 20 px screen gutters, left-aligned text everywhere.
- Rows are horizontal scrollers: 2:3 cards, 12 px radius, 8 px gaps; the first card is never clipped by the gutter.
- Test every screen at **320×480** on the API 23 emulator — that is the cheap-phone floor.

### 7.4 Android 6 constraints the design must respect

- **No blur or glass.** `BlurView` / `RenderEffect` need API 31+. The reference's frosted pills become solid
  `rgba(255,255,255,0.06)` plus a 1 px hairline.
- **No large soft shadows.** Depth comes from scrims, hairlines and the artwork itself.
- **No gradients on scrolling content**; one static gradient in the hero only.
- **Motion:** transforms and opacity with `useNativeDriver: true` only — no layout animation, no shared-element
  transitions. One orchestrated hero entrance per screen, nothing per-card.
- Avoid `overflow: hidden` + radius combined with `elevation` on old Android (rendering artifacts) — put
  `borderRadius` directly on `<Image>`.

### 7.5 Wireframes

```
HOME                                  DETAIL
┌────────────────────────────┐        ┌────────────────────────────┐
│ Classic TV Pakistan   ⌕    │        │ ←                  ↗       │
├────────────────────────────┤        ├────────────────────────────┤
│ ┌───────┐  Aangan           │        │  full-bleed still, scrim    │
│ │poster │  Urdu · 1984 ·26  │        │  fades to black             │
│ └───────┘                  │        │  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  │
│ [ ▶  Play episode 1     ]  │        │  Aangan                     │
│  ( + )    ( ↗ )    ( ▶ )    │        │  ● 26 episodes · 1984       │
│  My list  Share  YouTube    │        │  [ ▶  Continue episode 7 ]  │
├────────────────────────────┤        │  ( + )   ( ↗ )   ( ▶ )      │
│ Continue watching ▸         │        │  My list Share   YouTube     │
│ [▢] [▢] [▢] [▢]             │        ├────────────────────────────┤
│ Featured ▸                  │        │ Episodes(26) More info ▸    │
│ [▢] [▢] [▢] [▢]             │        │ ───────                     │
│ Serials ▸                   │        │ ▸ Ep 26   22:41             │
│ [▢] [▢] [▢] [▢]             │        │ ▸ Ep 25   21:08             │
├────────────────────────────┤        └────────────────────────────┘
│  ⌂ Home   ▤ Browse   ☾ Mine│        PLAYER: chrome-free, ← back,
└────────────────────────────┘        title on tap, ±10s circles,
                                      thin accent progress, episode rail,
MY LIBRARY                            "Next episode" bar, and an always
┌────────────────────────────┐        visible "Watch on YouTube" button
│ My Library                 │        in the overflow menu.
│ My list │ Watch history    │
│ ─────── │                  │
│ [▢] [▢] [▢]                │
│ [▢] [▢] [▢]                │
└────────────────────────────┘
```

### 7.6 Implementation notes

- Every colour, radius, spacing value and font size lives in `app/src/theme.js`; screens import `theme`, never a
  raw hex or magic number.
- Fonts are copied from `app/src/assets/fonts/` into `android/app/src/main/assets/fonts/` at build time and
  referenced per weight by `fontFamily` (RN 0.75 does not infer weight for custom fonts).
- Icons: bundle a trimmed subset of Material icons as PNG/SVG-free Image assets or use simple glyphs — do not add
  an icon/chart library for four icons.
- The poster grid uses the same `image` field the website uses; `thumbnail_url` values that 404 must fall back to a
  neutral placeholder card, never a broken frame.

### 7.7 Open question

**Accent colour.** Keep ARY Plus's acid lime (closest to the reference), or use the site's existing gold
`#F5C542` so the app matches classictvpakistan.com? Recommendation: take the reference's structure *and* its lime
accent, keeping gold only inside the existing logo artwork — the black canvas, white pills, hairline chips, heavy
grotesque, Urdu Nastaliq and brush taglines are what carry the resemblance, and a token change flips the accent in
one line if it reads wrong on a device.

## 8. Milestones

Estimates assume one developer, some days part-time. Building the APK happens in CI, so a slow local
machine is not the bottleneck.

### M0 — Decisions, toolchain, CI skeleton (1 day)
- Lock: package name (`com.classictvpakistan.app` — **permanent**, pick once), app display name,
  signing-key ownership, distribution channel (APK only vs APK + later Play), TypeScript yes/no.
- Create the release keystore (JDK `keytool`, 25-year validity) and store it **in GitHub Secrets, base64-encoded,
  never in the repo**; keep an offline backup — losing it means the app can never be updated under the same name.
- Add `.github/workflows/android.yml`: `actions/setup-java@17` + `android-actions/setup-android`, `yarn install`,
  `./gradlew assembleRelease`, upload artifact.

**Done when:** the workflow produces an installable hello-world APK artifact.

### M1 — App shell on a real Android 6 device (1.5–2 days)
- `npx @react-native-community/cli@14 init ClassicTVPakistan --version 0.75.5 --package-name com.classictvpakistan.app --directory app`
- Set `minSdkVersion 23`, ABI filters, `newArchEnabled=false`, version code/name, adaptive icon from
  `public/logo.png`, splash, and the design tokens + shell from §7 (black canvas, white pill CTA, hairline chips,
  accent underline tabs, bottom nav Home / Browse / My Library) in `app/src/theme.js`.
- Verify on an **API 23 emulator** (`system-images;android-23;google_apis;x86`) at 320×480 and a real Android 6 phone.

**Done when:** a release APK installs and navigates on API 23 without crashing (test release, not just debug).

### M2 — Catalog (4–6 days)
- `src/lib/api.js`: fetch `Drama` rows, `config/categories.json`, `config/featured.json`; port `mapRow`,
  `groupDramas`, `isSeries`, `normalize`, `extractYouTubeId`, `cleanDramaTitle` from `public/js/shared.js`.
- Cache the raw catalog in AsyncStorage with the web's 3-minute TTL (stale-while-revalidate: show cache
  instantly, refresh in the background).
- Screens: Home (hero + horizontal rows), Browse (grid + search + category filter), Detail (series → episode list)
  — built to the §7.5 wireframes with tokens from `theme.js`.
- Pull-to-refresh, skeleton loaders, empty/error states, image prefetch for visible posters.

**Done when:** every drama on the site is reachable in the app, matches the web ordering, and the app works
on 3G with cached data.

### M3 — Playback (3–4 days, highest risk — do this early)
- WebView player screen: `source={{ uri: embedUrl, headers: { Referer: "https://classictvpakistan.com/" } }}`,
  `allowsFullscreenVideo`, `mediaPlaybackRequiresUserAction={false}`, `originWhitelist` limited to YouTube.
- Tap-to-play poster first (old WebViews block autoplay with sound); remember last position per episode.
- Error/fallback ladder: WebView fails or reports error 101/150/153 → show "Watch on YouTube" (opens the
  YouTube app via `vnd.youtube:<id>`, falls back to the `https://youtu.be/` URL).
- Episode rail, next/previous, autoplay next episode, keep screen awake, back-button handling, landscape.
- Test on API 23 with the device's actual WebView version, plus airplane-mode/2G conditions.

**Done when:** on a real Android 6 device, first-tap playback works in-app **or** the fallback gets the user
to a playing video in under 5 seconds — with no dead ends.

### M4 — My List, deep links, polish (2–3 days)
- My List + Continue Watching in AsyncStorage (keyed like `pak_spotlight_mylist` so semantics match the web).
- Share sheet, App Links (`https://classictvpakistan.com/watch?id=…` → app) + `public/.well-known/assetlinks.json`
  with the release cert's SHA-256; "Open in app" banner on the site's watch page (optional).
- Toast/error consistency, empty states, app-size check, accessibility labels, hard back-button behaviour.

**Done when:** beta testers on mixed devices complete browse → watch → resume without instructions.

### M5 — Release pipeline and distribution (1.5–2 days)
- Tag `app-vX.Y.Z` → CI builds signed release APKs (armv7 + arm64), attaches them to a GitHub Release,
  and updates `public/app/latest.json`.
- `public/get-app.html`: version, size, install steps ("allow installs from unknown sources"), QR code,
  changelog; linked from the site nav and footer.
- In-app update check (once per 24 h): compare `latest.json` versionCode with the installed one, show a
  dialog, open the APK URL in the browser (simplest, no `REQUEST_INSTALL_PACKAGES` needed on API 23).
- `GET /api/app/ping` on the Worker: anonymous launch counter (version + random install id) so we can see
  version adoption and Android distribution before deciding anything about Play.

**Done when:** a stranger can install v1.0 from classictvpakistan.com in under a minute, and a v1.0.1 update
prompts correctly in the app.

### Optional follow-ups
| Phase | What | Estimate |
|---|---|---|
| M6 | Supabase email/password login in-app + My List stored in Supabase (synced across devices) | 2–3 days |
| M7 | Push notifications (FCM HTTP v1 from a Worker cron) for newly added dramas | 2–3 days |
| M8 | Play Store track: modern RN (0.87+), `minSdk 24`, `targetSdk 36`, 16 KB-aligned, AAB, store listing | 3–5 days |
| M9 | Hidden admin in a WebView (login inside the app), Android TV layout | as needed |

**Total for v1.0 (M0–M5): ~13–18 working days.**

---

## 9. Distribution and Play Store stance

- **v1: direct APK.** Ship `ClassicTVPakistan-1.0.0-armv7.apk` (~12 MB) and `…-arm64.apk` (~15 MB) from the
  website, plus a universal APK for convenience. Works on every Android 6+ device without Play review.
- **Play Store is a later, separate build.** New Play submissions must target API 36 and be 16 KB
  page-size safe; RN 0.75's prebuilt native libraries fail the second requirement. If Play becomes a
  priority, plan M8 as a *second track* (`minSdk 24`, modern RN) — the same JS/UI code, two Gradle flavors
  or two branches. Decide with the `/api/app/ping` data, not by feeling.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Old device WebView can't run YouTube's embed | Playback dead on some Android 6 phones | Tap-to-play, error-code detection, YouTube-app fallback as a first-class path; test on a real Android 6 phone early (M1/M3) |
| YouTube `Referer` requirement (error 153) | Silent playback failures | Always send `Referer: https://classictvpakistan.com/` from the WebView; never `noreferrer` |
| RN 0.75 and every library are EOL (0.75.5 was the final patch; 0.75 reached end-of-life on 19 Feb 2025) | No upstream security fixes; a lib update may silently drop API 23 | Pin exact versions, commit the lockfile, keep the native dependency count at four, keep the fallback WebView-shell option in reserve |
| Node 24 locally vs RN 0.75 (built for Node 18/20) | Metro/Gradle weirdness on Windows | Build in CI with Node 20; if local builds are needed, use Volta/nvm-windows to pin Node 20 |
| No JDK/Android SDK on this machine | Can't run the API 23 emulator locally | Install Temurin JDK 17 + Android cmdline-tools (`platforms;android-34`, `system-images;android-23;google_apis;x86`); or test on a real Android 6 phone |
| Windows path-length limits during Gradle builds | Broken builds | Keep the project at `app/` (short path), enable long paths, prefer CI |
| Release-only crashes (R8/Hermes) pass in debug | Bad first impression | Every milestone's acceptance test uses `assembleRelease`, not `run-android` |
| Losing the signing keystore | Can never update the app | GitHub Secrets + offline backup at handoff; document in AGENTS.md |
| 16 KB page-size devices (newer Android) | Rare crashes on modern hardware | Low priority now; covered by the M8 modern-RN track |

---

## 11. Release checklist (to add to AGENTS.md once M5 lands)

- [ ] `versionCode` bumped and `versionName` updated
- [ ] All tests from the milestone list pass on API 23 emulator **and** a real device
- [ ] Release (not debug) APK verified: cold start, browse, play, fallback, back button, rotation
- [ ] Catalog matches the live site (same count of grouped series)
- [ ] APK installs over the previous version (same signing key)
- [ ] `public/app/latest.json` updated and pushed (so existing installs see the update)
- [ ] Download page shows the new version and size
- [ ] `npx wrangler deploy` done if `src/index.js` changed
- [ ] GitHub Release tagged `app-vX.Y.Z` with the APKs attached
- [ ] `git push origin main` done (repo rule: every change is pushed)

---

## 12. Decisions

**Settled (15 Oct 2026)**
1. ✔ **Distribution:** signed APK from classictvpakistan.com only; Play Store is a later, separate track (§9).
2. ✔ **Accounts:** none in v1 — My List and watch history stay on the device (M6 is optional later work).
3. ✔ **UI/UX reference:** ARY Plus design language, specified in §7. Sub-question still open: accent lime vs gold (§7.7).

**Needed before M0 starts**
1. **Package name** — e.g. `com.classictvpakistan.app` (final, cannot change after release).
2. **Who owns the signing key** and where the offline backup lives.
3. **App display name** on the launcher — "Classic TV" or "Classic TV Pakistan".
4. **TypeScript vs plain JS** for the app code (repo is plain JS; TS is the RN default).
5. **Who builds**: CI only (recommended, nothing to install), or also set up Android Studio locally.
