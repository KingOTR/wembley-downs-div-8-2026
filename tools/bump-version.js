/**
 * Bump cache-breaking version across public/ (replaces bump-v152.js … bump-v156.js).
 * Usage: node tools/bump-version.js 157
 *        node tools/bump-version.js v157
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const swPath = path.join(publicDir, "sw.js");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node tools/bump-version.js <version>");
  console.error("Example: node tools/bump-version.js 157");
  process.exit(1);
}

const newNum = String(arg).replace(/^v/i, "").trim();
if (!/^\d+$/.test(newNum)) {
  console.error("Version must be a number, e.g. 157 or v157");
  process.exit(1);
}

const sw = fs.readFileSync(swPath, "utf8");
const curMatch = sw.match(/CACHE_VERSION\s*=\s*"(v\d+)"/);
if (!curMatch) {
  console.error("Could not read CACHE_VERSION from public/sw.js");
  process.exit(1);
}

const oldTag = curMatch[1];
const newTag = "v" + newNum;
const oldNum = oldTag.replace(/^v/i, "");

if (oldTag === newTag) {
  console.log("Already at", newTag);
  process.exit(0);
}

console.log("Bumping", oldTag, "→", newTag);

function bumpText(t) {
  let out = t;
  const tagRe = new RegExp("\\?tag=" + oldTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  out = out.replace(tagRe, "?tag=" + newTag);
  out = out.replace(
    new RegExp('CACHE_VERSION = "' + oldTag + '"', "g"),
    'CACHE_VERSION = "' + newTag + '"'
  );
  out = out.replace(
    new RegExp("sw\\.js\\?v=" + oldNum, "g"),
    "sw.js?v=" + newNum
  );
  out = out.replace(
    new RegExp('content="' + oldNum + '"', "g"),
    'content="' + newNum + '"'
  );
  const oldComment = oldTag + ": ";
  const newComment = newTag + ": ";
  out = out.split(oldComment).join(newComment);
  return out;
}

function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|json)$/.test(f)) {
      const raw = fs.readFileSync(p, "utf8");
      const next = bumpText(raw);
      if (next !== raw) {
        fs.writeFileSync(p, next);
        console.log("  updated", path.relative(root, p));
      }
    }
  }
}

walk(publicDir);
console.log("Done. Run: node tools/ci-validate.js");
