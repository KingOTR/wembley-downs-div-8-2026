/**
 * v146: compact weather UI + WA location search (no app.min logic changes).
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");
const from = 'import("./chunk-HQEVIJDY.js?tag=v145")';
const to = 'import("./chunk-HQEVIJDY.js?tag=v146")';
if (s.includes(from)) {
  s = s.replace(from, to);
  fs.writeFileSync(appPath, s);
  console.log("OK: chunk tag v146");
} else if (s.includes(to)) {
  console.log("SKIP: already v146");
} else {
  console.error("MISSING chunk tag");
  process.exit(1);
}
