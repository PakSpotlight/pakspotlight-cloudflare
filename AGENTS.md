# Classic TV Pakistan — Agent Instructions

## Project Overview
Classic TV Pakistan is a Classic PTV Drama Archive built as a Cloudflare Workers full-stack app with Supabase for data/storage and OpenRouter for AI.

- **Frontend**: `public/index.html` (SPA) + `public/admin.html` (standalone admin)
- **Backend**: `src/index.js` (Cloudflare Worker API)
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenRouter API (`deepseek/deepseek-v4-flash-0731`) with web search

## Deployment

### Deploy to Cloudflare
```bash
npx wrangler deploy
```

### Set Secrets
```bash
echo "YOUR_KEY" | npx wrangler secret put OPENROUTER_API_KEY
```

Get the Cloudflare API token from the team — never commit it.

### Push to GitHub
```bash
git add -A
git commit -m "description"
git push origin main
```

## Android App (`mobile/`)

The archive also ships as a sideloaded Android app: **Expo SDK 51 + React Native 0.74.5**, `minSdk 23`
(Android 6.0). Expo SDK 52+ dropped Android 6, so the app is deliberately pinned to SDK 51.
Notes: `mobile/README.md`. Design language: `docs/android-app-plan.md` §7.

### Preview it in a browser
```bash
cd mobile
npm install
npm run web        # http://localhost:8081
```
Expo Router gives every screen a URL (`/`, `/browse`, `/library`, `/drama/26`, `/watch/26`), so the
browser preview is the fastest way to review design changes. For phone-accurate layout use the
browser's device toolbar (Chrome: Ctrl+Shift+M → Android, 390×844).

### Ship a build
Actions → **Android APK** → Run workflow. It runs `expo prebuild` + `gradlew assembleRelease`, uploads
the APK as a GitHub release, and rewrites `public/app/latest.json` — the file `/get-app` and the
in-app update check read. Repository secrets required:

| Secret | What it is |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of the release `.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | key password |

Without them the workflow still builds an unsigned APK for device testing — never distribute that one.

### App rules
- **The ES2019 browser rule does not apply to `mobile/`** (Hermes is the engine). `npm run check:es2019`
  covers `public/` only.
- Bump **both** `mobile/app.json` (`expo.version` + `android.versionCode`) and `mobile/src/lib/update.ts`
  (`APP_VERSION`, `APP_VERSION_CODE`) on every release.
- Accent, type scale and layout tokens live in `mobile/src/theme.ts`. Change them there, never inline.
- After the first signed build, replace the placeholder SHA-256 in `public/.well-known/assetlinks.json`
  with the release certificate's fingerprint, or shared `/watch?id=` links will keep opening in the browser.
- Playback needs a real `Referer` for the YouTube embed. `mobile/src/lib/youtube.ts` is the only place
  that builds player URLs and the only place that opens the YouTube app.

## Critical Rules

1. **Every change MUST be pushed to GitHub after thorough testing.** No exceptions.
2. **Test the AI endpoint** before pushing any changes to `src/index.js`. The AI must return valid JSON.
3. **Test on the live site** at `https://classictvpakistan.com/` after deploying.
4. **Never commit secrets.** `.env` is gitignored. Use `wrangler secret put` for Cloudflare.
5. **Run `npx wrangler deploy`** after every code change — the site won't update without it.

## Testing Checklist

Before pushing any change:
- [ ] `npx wrangler deploy` succeeds
- [ ] Site loads at `https://classictvpakistan.com/`
- [ ] Admin login works
- [ ] AI auto-fill returns valid JSON (test with a YouTube URL)
- [ ] No console errors in browser or Cloudflare logs
- [ ] `npm run check:es2019` passes (see Browser Support Floor)
- [ ] App changes only: `cd mobile; npx tsc --noEmit` passes and the browser preview renders the touched screens
- [ ] `git status` clean before commit
- [ ] `git push origin main` succeeds

## Browser Support Floor (Chrome 75 / Android 6)

Real users browse the archive from old Android phones, so **all browser JS must stay within ES2019**.
Chrome 80 introduced `?.` and `??`, Chrome 85 introduced `||=`, `&&=`, `??=` — a single one of these
is a parse error, and a parse error kills the **entire script file**, which looks like "JS isn't loading".

- `npm run check:es2019` — parses every `public/**/*.js` file and every inline `<script>` in
  `public/*.html` with acorn at `ecmaVersion: 2019` and fails if anything newer slipped in.
  Run it before every push.
- Instead of `a?.b` use `a && a.b`; instead of `a ?? b` use `a == null ? a : b`
  (never `a || b` — `0`, `""` and `false` must survive).
- **Supabase is vendored** at `public/js/supabase.min.js` (the npm UMD build downlevelled to ES2019).
  Do not point the pages back at the jsDelivr CDN — that bundle is ES2020+ and breaks old Chrome.
  To bump it:
  ```bash
  curl -sL -o supabase-src.js https://cdn.jsdelivr.net/npm/@supabase/supabase-js@<version>/dist/umd/supabase.js
  node scripts/build-supabase.js supabase-src.js public/js/supabase.min.js
  npm run check:es2019
  ```
- Both scripts (`scripts/check-es2019.js`, `scripts/build-supabase.js`) are dev-only; they are never
  deployed (only `src/index.js` is the Worker entry).

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Cloudflare Secret | OpenRouter API auth |
| `OPENROUTER_DEFAULT_MODEL` | wrangler.jsonc vars | Default AI model |
| `YOUTUBE_API_KEY` | Cloudflare Secret | YouTube Data API v3 |
| Supabase URL + Key | Hardcoded in HTML/JS | Database connection |
| `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | GitHub Actions secrets | Signing the Android APK (`mobile/`) |

## Architecture Notes

- CSS uses CSS variables (`--bg`, `--panel`, `--line`, `--gold`, `--text`, `--muted`)
- Both `index.html` and `admin.html` have independent but matching styles
- The Worker serves static assets via `env.ASSETS.fetch()` for non-API routes
- AI auto-fill uses OpenRouter's `openrouter:web_search` tool (limited to 5 results)
- Thumbnails are stored in Supabase Storage under the `thumbnails` bucket
