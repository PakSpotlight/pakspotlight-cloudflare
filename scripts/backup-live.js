/**
 * Snapshot the live Cloudflare deployment before the repo is pushed again.
 *
 * The site auto-deploys from `main`, so a single push replaces whatever is running in
 * production. This script fetches every page, stylesheet, script and API response the
 * site actually serves and writes them to backups/<label>/ together with a manifest of
 * hashes, so the deployed build can be diffed against the repo and restored.
 *
 * Usage: node scripts/backup-live.js [label]
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ORIGIN = process.env.BACKUP_ORIGIN || "https://classictvpakistan.com";
const label = process.argv[2] || "cloudflare-" + new Date().toISOString().slice(0, 10);
const outRoot = path.resolve(__dirname, "..", "backups", label);

const SEED_PATHS = [
  "/",
  "/browse",
  "/watch",
  "/admin",
  "/get-app",
  "/index.html",
  "/browse.html",
  "/watch.html",
  "/admin.html",
  "/get-app.html",
  "/sitemap.xml",
  "/robots.txt",
  "/app/latest.json",
  "/.well-known/assetlinks.json",
  "/google03be8bc9e7d47207.html",
  "/googleb57603fb2d740b66.html",
  "/api/categories",
  "/api/featured",
  "/api/app/ping",
];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function safePath(urlPath) {
  const clean = urlPath.split("?")[0];
  if (clean === "/") return "index.html";
  return clean.replace(/^\/+/, "");
}

function discoverAssets(html) {
  const found = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#")) continue;
    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("mailto:")) continue;
    if (!raw.startsWith("/")) continue;
    if (!/^\/(css|js|assets|images|img|fonts|audio|video|\.well-known|app)\//.test(raw)) continue;
    found.add(raw.split("?")[0]);
  }
  return [...found];
}

async function get(urlPath) {
  const started = Date.now();
  const res = await fetch(ORIGIN + urlPath, {
    headers: {
      "user-agent": "classictv-backup/1.0 (+pre-deploy snapshot)",
      accept: "*/*",
      "cache-control": "no-cache",
    },
    redirect: "follow",
  });
  const body = Buffer.from(await res.arrayBuffer());
  return {
    urlPath,
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    etag: res.headers.get("etag") || "",
    lastModified: res.headers.get("last-modified") || "",
    bytes: body.length,
    sha256: sha256(body),
    ms: Date.now() - started,
    body,
  };
}

(async () => {
  fs.mkdirSync(outRoot, { recursive: true });
  const manifest = { origin: ORIGIN, label, capturedAt: new Date().toISOString(), files: [] };
  const seen = new Map(); // urlPath -> result
  const queue = [...SEED_PATHS];

  while (queue.length) {
    const batch = queue.splice(0, 6);
    const results = await Promise.all(
      batch.map(async (p) => {
        try {
          return await get(p);
        } catch (err) {
          return { urlPath: p, error: String(err && err.message ? err.message : err), bytes: 0 };
        }
      })
    );

    for (const r of results) {
      if (seen.has(r.urlPath)) continue;
      seen.set(r.urlPath, r);

      if (r.error) {
        console.log(`ERR  ${r.urlPath}  ${r.error}`);
        manifest.files.push({ path: r.urlPath, error: r.error });
        continue;
      }

      console.log(`${String(r.status).padEnd(4)} ${String(r.bytes).padStart(8)}  ${r.urlPath}  ${r.contentType}`);
      manifest.files.push({
        path: r.urlPath,
        status: r.status,
        contentType: r.contentType,
        etag: r.etag,
        lastModified: r.lastModified,
        bytes: r.bytes,
        sha256: r.sha256,
      });

      if (r.status === 200) {
        const rel = safePath(r.urlPath);
        const dest = path.join(outRoot, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, r.body);

        if (/text\/html/i.test(r.contentType)) {
          for (const asset of discoverAssets(r.body.toString("utf8"))) {
            if (!seen.has(asset) && !queue.includes(asset)) queue.push(asset);
          }
        }
      }
    }
  }

  fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const ok = manifest.files.filter((f) => f.status === 200);
  const total = ok.reduce((n, f) => n + (f.bytes || 0), 0);
  console.log(`\nCaptured ${ok.length} files (${(total / 1024).toFixed(1)} KB) into backups/${label}/`);
  const bad = manifest.files.filter((f) => f.error || (f.status && f.status !== 200));
  if (bad.length) {
    console.log("Non-200 responses (recorded, not saved):");
    for (const b of bad) console.log(`  ${b.path}  ${b.status || b.error}`);
  }
})();
