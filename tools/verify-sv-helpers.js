const fs = require("fs");
const s = fs.readFileSync("public/dist/app.min.js", "utf8");
const matches = [...s.matchAll(/function SvPad2/g)];
console.log("SvPad2 occurrences:", matches.length, matches.map((m) => m.index));
const qc = s.indexOf("function qc(c){c&&(c.version===2");
const def = s.indexOf("function SvMergeMatchesByRound");
console.log("def@", def, "qc@", qc, "OK:", def < qc);
console.log("window export:", s.includes("window.SvMergeMatchesByRound=SvMergeMatchesByRound"));
