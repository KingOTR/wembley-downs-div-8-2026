/**
 * v134 patches for app.min.js:
 * - Export bundled Firestore batch helpers (not modular CDN SDK)
 * - Name suggestions only on focus/click, not on Vo() / page load
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "export Firestore batch helpers",
    from: "window.__svFirestore=he;try{al(me,cc)}",
    to:
      'window.__svFirestore=he;window.__svFirestoreBatch=function(){return gh(he)};window.__svVoteDoc=function(c){return Qn(he,"votes",c)};window.__svCoachVotesCol=function(){return $n(he,"coachVotes")};window.__svAdminLogCol=function(){return $n(he,"adminLog")};window.__svSetDoc=yp;window.__svAddDoc=mh;try{al(me,cc)}',
  },
  {
    name: "Vo() defer suggestions until focus",
    from: "m(L.voterName)}bp(),eu()}function gI()",
    to: "m(L.voterName)}bp()}function gI()",
  },
  {
    name: "focus/click triggers name suggestions",
    from: 'et.addEventListener("focus",function(){eu()}),et.addEventListener("blur"',
    to: 'et.addEventListener("focus",function(){bp(),eu()}),et.addEventListener("click",function(){bp(),eu()}),et.addEventListener("blur"',
  },
];

let failed = false;
patches.forEach(function (p) {
  if (!s.includes(p.from)) {
    console.error("MISSING patch target:", p.name);
    failed = true;
    return;
  }
  if (p.to && s.includes(p.to) && p.from !== p.to) {
    console.log("SKIP (already applied):", p.name);
    return;
  }
  s = s.replace(p.from, p.to);
  console.log("OK:", p.name);
});

if (failed) process.exit(1);
fs.writeFileSync(appPath, s);
console.log("app.min.js v134 patches applied");
