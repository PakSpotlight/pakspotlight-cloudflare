#!/usr/bin/env node
/**
 * Writes public/app/latest.json — the manifest the installed Android app polls to learn whether
 * a newer build exists.
 *
 * Run by .github/workflows/android.yml after a signed APK has been uploaded to a GitHub release,
 * so the download page and the in-app update check always point at the newest build.
 *
 * Usage:
 *   node scripts/write-app-manifest.js <apk-path> [repo-slug] [notes]
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const APP_JSON = path.join(ROOT, "mobile", "app.json");
const MANIFEST = path.join(ROOT, "public", "app", "latest.json");

function fail(message) {
  console.error("write-app-manifest: " + message);
  process.exit(1);
}

const apkPath = process.argv[2];
if (!apkPath) fail("pass the APK path as the first argument");
if (!fs.existsSync(apkPath)) fail("APK not found at " + apkPath);
if (!fs.existsSync(APP_JSON)) fail("mobile/app.json not found — run from the repository root");

const repo = process.argv[3] || process.env.GITHUB_REPOSITORY;
if (!repo) fail("pass the GitHub repo slug (owner/name) or set GITHUB_REPOSITORY");

const notes = process.argv[4] || "";
const config = JSON.parse(fs.readFileSync(APP_JSON, "utf8")).expo;
const versionName = String(config.version || "1.0.0");
const versionCode = Number(config.android && config.android.versionCode ? config.android.versionCode : 1);

const bytes = fs.statSync(apkPath).size;
const sizeMB = Math.round((bytes / (1024 * 1024)) * 10) / 10;
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(apkPath)).digest("hex");
const tag = "app-v" + versionName;
const file = "classic-tv-pakistan-" + versionName + ".apk";

// Downloads are served from Cloudflare R2 when R2_PUBLIC_BASE is set (fast edge route for
// Pakistan; egress is free). The APK for EVERY release must be uploaded to
// <R2_PUBLIC_BASE>/android/<file> before the manifest ships — the manifest manager's job.
// Without the variable we fall back to the GitHub release asset (slow but always exists).
const apkUrl = process.env.R2_PUBLIC_BASE
  ? process.env.R2_PUBLIC_BASE.replace(/\/+$/, "") + "/android/" + file
  : "https://github.com/" + repo + "/releases/download/" + tag + "/" + file;

const manifest = {
  published: true,
  versionCode: versionCode,
  versionName: versionName,
  apkUrl: apkUrl,
  notes: notes,
  sizeMB: sizeMB,
  sha256: sha256,
  minAndroid: "6.0",
  releasedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log("write-app-manifest: wrote " + path.relative(ROOT, MANIFEST));
console.log(JSON.stringify(manifest, null, 2));
