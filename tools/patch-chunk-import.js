const fs = require("fs");
const p = "public/dist/app.min.js";
let s = fs.readFileSync(p, "utf8");
const from = 'import("./chunk-HQEVIJDY.js?tag=v133")';
const to = 'import("./chunk-HQEVIJDY.js?tag=v134")';
if (s.includes(to)) {
  console.log("chunk import already patched");
} else if (s.includes(from)) {
  s = s.split(from).join(to);
  fs.writeFileSync(p, s);
  console.log("patched chunk import");
} else {
  console.error("pattern not found");
  process.exit(1);
}
