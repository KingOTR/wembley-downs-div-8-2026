const fs = require("fs");
const path = require("path");
const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const start = s.indexOf("function SvPad2");
const second = s.indexOf("function SvPad2", start + 1);
if (second === -1) {
  console.log("No duplicate SvPad2 block");
  process.exit(0);
}

const opIdx = s.indexOf("function Op()", second);
if (opIdx === -1 || opIdx > second + 3000) {
  console.error("Could not find Op() after second SvPad2");
  process.exit(1);
}

s = s.slice(0, second) + s.slice(opIdx);
fs.writeFileSync(appPath, s);
console.log("Removed duplicate helpers before Op() at", second);
