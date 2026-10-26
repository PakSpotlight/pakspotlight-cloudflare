# Cloudflare snapshot — 2026-10-26

Byte-for-byte copy of what `https://classictvpakistan.com` was serving before any further
push to `main` (the site auto-deploys from `main`, so a push replaces production).

Captured with `node scripts/backup-live.js cloudflare-2026-10-26`.

## What is in here

Every page, stylesheet, script and JSON file the site serves, plus the API payloads:

| File | Notes |
|---|---|
| `index.html`, `browse.html`, `watch.html`, `admin.html`, `get-app.html` | server responses for `/`, `/browse`, `/watch`, `/admin`, `/get-app` |
| `css/*`, `js/*` | all stylesheets and scripts, including `js/admin/*` |
| `robots.txt`, `sitemap.xml` | as served |
| `app/latest.json`, `.well-known/assetlinks.json` | release manifest + deep-link verification |
| `api/categories.json`, `api/featured.json` | current API payloads (data, not code) |
| `manifest.json` | URL, status, content-type, ETag, byte size and SHA-256 for all 31 responses |

`/logo.png` and `/js/supabase.min.js` are large binaries and were captured as well; hashes are in
`manifest.json`. `/api/app/ping` returns `204 No Content` by design (fire-and-forget beacon) and has
no body to save.

## Verification against the repo

Captured at commit `d59ab67`:

- **All CSS and JS files are identical** to `public/` once CRLF/LF line endings are normalized.
- **Every HTML page is identical** apart from one 437-character `<script>` that `src/index.js`
  injects at runtime (`FETCH_FIX_SCRIPT`). The injected line matches the committed constant exactly.
- Therefore the deployed Worker and the repo were in sync: **no live-only fixes existed** that a
  push could have destroyed.

## Known pre-existing bug found while capturing

`/google03be8bc9e7d47207.html` and `/googleb57603fb2d740b66.html` (Google Search Console
verification files) do not resolve:

1. Workers Assets answers `307` and rewrites the request to the extensionless path.
2. The extensionless path falls through the Worker to `env.ASSETS.fetch()`, which rewrites again.
3. The loop ends in Cloudflare's "Worker threw exception" page (HTTP 500).

Reproduced locally with `wrangler dev` (the 307 is visible there; the loop only completes on
Cloudflare). Not caused by this snapshot, and not fixed here.
