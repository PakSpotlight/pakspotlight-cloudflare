// Dev-only helper: build an ES2019-safe Supabase bundle from the npm UMD build.
// Usage: node scripts/build-supabase.js <path-to-supabase.js> <outfile>
const esbuild = require("esbuild");
const fs = require("fs");

const [, , srcPath, outPath] = process.argv;
if (!srcPath || !outPath) {
  console.error("usage: node scripts/build-supabase.js <src> <out>");
  process.exit(1);
}

const src = fs.readFileSync(srcPath, "utf8");
const banner = `/*!
 * supabase-js UMD build, downlevelled to ES2019 so it parses on Chrome 75 / Android 6.
 * Source: @supabase/supabase-js (dist/umd/supabase.js)
 * Rebuild: node scripts/build-supabase.js <path-to-supabase.js> public/js/supabase.min.js
 */`;

esbuild
  .transform(src, { target: "es2019", minify: true })
  .then((r) => {
    fs.writeFileSync(outPath, banner + "\n" + r.code);
    const leftovers = {
      "optional chaining ?.": (r.code.match(/\w\?\.\w/g) || []).length,
      "nullish ??": (r.code.match(/\w\?\?\w/g) || []).length,
      "logical assignment": (r.code.match(/(\|\|=|&&=|\?\?=)/g) || []).length
    };
    console.log("wrote", outPath, fs.statSync(outPath).size, "bytes");
    console.log("post-transform feature check:", JSON.stringify(leftovers));
  })
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  });
