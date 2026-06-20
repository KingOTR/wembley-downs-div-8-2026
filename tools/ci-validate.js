const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8");

const required = [
  "public/index.html",
  "public/sw.js",
  "public/manifest.json",
  "public/wembley-downs-logo.png",
  "public/dist/app.min.js",
  "public/dist/voter-enhancements.js",
  "public/dist/admin-merge-rounds.js",
  "public/dist/name-match.js",
  "public/dist/name-match-bootstrap.js",
  "firestore.rules",
  "firebase.json",
];

let failed = false;
required.forEach((rel) => {
  const p = path.join(root, rel.replace(/\//g, path.sep));
  if (!fs.existsSync(p)) {
    console.error("MISSING:", rel);
    failed = true;
  }
});

function extractTag(name) {
  const m = html.match(new RegExp(name + "[^\"']*\\?tag=(v\\d+)", "i"));
  return m ? m[1] : null;
}

const appTag = extractTag("app.min.js");
const enhTag = extractTag("voter-enhancements.js");
const mergeTag = html.match(/admin-merge-rounds\.js\?tag=(v\d+)/);
const mergeTagVal = mergeTag ? mergeTag[1] : null;
const swMatch = sw.match(/CACHE_VERSION\s*=\s*"(v\d+)"/);
const swVer = swMatch ? swMatch[1] : null;
const swReg = html.match(/sw\.js\?v=(\d+)/);
const swRegVer = swReg ? "v" + swReg[1] : null;

console.log("Tags:", { appTag, enhTag, mergeTag: mergeTagVal, swVer, swRegVer });

if (!appTag || appTag !== enhTag || appTag !== mergeTagVal) {
  console.error("Version tag mismatch between app / enhancements / merge modules");
  failed = true;
}
if (!swVer || swVer !== appTag) {
  console.error("CACHE_VERSION must match ?tag= on dist scripts");
  failed = true;
}
if (!swRegVer || swRegVer !== appTag) {
  console.error("sw.js?v= must match dist ?tag= version");
  failed = true;
}

if (!html.includes("<!DOCTYPE html>")) {
  console.error("index.html missing DOCTYPE");
  failed = true;
}

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.json"), "utf8"));
  if (manifest.theme_color !== "#EE2B33") {
    console.error("manifest.json theme_color must be #EE2B33");
    failed = true;
  }
  if (!html.includes('rel="manifest"')) {
    console.error("index.html missing manifest link");
    failed = true;
  }
} catch (e) {
  console.error("manifest.json invalid:", e.message);
  failed = true;
}

try {
  const appPath = path.join(publicDir, "dist", "app.min.js");
  const tmp = path.join(root, ".tmp-ci-app.mjs");
  fs.writeFileSync(tmp, fs.readFileSync(appPath, "utf8"));
  execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  fs.unlinkSync(tmp);
} catch (e) {
  console.error("app.min.js syntax check failed");
  failed = true;
}

if (failed) process.exit(1);
console.log("CI validate OK");
