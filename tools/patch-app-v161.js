/**
 * v161: Fix results tally when dedupe returns empty array (avoid || h doubling votes).
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "Uo() use dedupe result even when empty array",
    from: 'typeof window.__svDedupeVotesForTally=="function"&&(_h=window.__svDedupeVotesForTally(c,l,h)||h)',
    to: 'typeof window.__svDedupeVotesForTally=="function"&&(_svT=window.__svDedupeVotesForTally(c,l,h),_h=Array.isArray(_svT)?_svT:h)',
    once: true,
  },
  {
    name: "remove duplicate teamId string listener in Ds",
    from: '),C=Lc(Ia($n(he,"votes"),Vc("teamId","==",String(l))),function(L){f=L,E()},function(L){console.error(L)});as=function(){try{b&&b()}catch{}try{C&&C()}catch{}}',
    to: ");as=function(){try{b&&b()}catch{}}",
    once: true,
  },
];

function replaceOnce(str, from, to) {
  var i = str.indexOf(from);
  if (i === -1) return null;
  return str.slice(0, i) + to + str.slice(i + from.length);
}

let failed = false;
patches.forEach(function (p) {
  if (!s.includes(p.from)) {
    if (p.to && s.includes(p.to.slice(0, Math.min(60, p.to.length))) && p.from !== p.to) {
      console.log("SKIP (already applied):", p.name);
      return;
    }
    console.error("MISSING patch target:", p.name);
    failed = true;
    return;
  }
  var next = replaceOnce(s, p.from, p.to);
  if (next == null) {
    console.error("replaceOnce failed:", p.name);
    failed = true;
    return;
  }
  s = next;
  console.log("OK:", p.name);
});

if (failed) process.exit(1);
fs.writeFileSync(appPath, s);
console.log("app.min.js v161 patches applied");
