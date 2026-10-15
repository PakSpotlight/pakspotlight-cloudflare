// Dev-only helper: fail if any shipped browser JS uses syntax newer than
// ES2019 (safe floor = Chrome 75 / Android 6). Checks public/**/*.js and every
// inline <script> block in public/*.html. Run: node scripts/check-es2019.js
const acorn = require("acorn");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "public");
const ECMASCRIPT = 2019; // Chrome 75 understands ES2019 and nothing newer

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(js|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function inlineScripts(html) {
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/i.test(m[1])) continue; // external file, checked separately
    // Only real JS runs in the browser: skip JSON-LD / data blocks.
    const typeMatch = m[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const blockType = typeMatch ? typeMatch[1].toLowerCase() : "text/javascript";
    const isJs = blockType === "text/javascript" || blockType === "application/javascript" || blockType === "module" || blockType === "text/ecmascript";
    if (!isJs) continue;
    if (m[2].trim()) blocks.push({ code: m[2], offsetLine: html.slice(0, m.index).split("\n").length });
  }
  return blocks;
}

function check(label, code, offset) {
  try {
    acorn.parse(code, { ecmaVersion: ECMASCRIPT, sourceType: "script" });
    return null;
  } catch (e) {
    const line = (e.loc && e.loc.line ? (offset ? offset + e.loc.line - 1 : e.loc.line) : "?");
    return `${label}:${line} — ${e.message}`;
  }
}

let failures = 0;
for (const file of listFiles(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(path.join(__dirname, ".."), file);
  const targets = file.endsWith(".html")
    ? inlineScripts(src).map((b, i) => ({ label: `${rel} (inline script #${i + 1})`, code: b.code, offset: b.offsetLine }))
    : [{ label: rel, code: src, offset: 0 }];
  for (const t of targets) {
    const err = check(t.label, t.code, t.offset);
    if (err) {
      failures++;
      console.log("FAIL " + err);
    }
  }
}
console.log(failures ? `\n${failures} chunk(s) still use post-ES2019 syntax` : `OK: all shipped JS parses as ES${ECMASCRIPT}`);
process.exit(failures ? 1 : 0);
