/**
 * v174: Coach results tally dedupes one ballot per coach slot (latest wins).
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "coach Uo() uses __svDedupeCoachVotesForTally",
    from: "L=U.coachVotes.filter(function(Ne){return Ne.teamId===c&&We(Ne)===C}),B=Uo(c,C,U.coachVotes);",
    to: 'L=U.coachVotes.filter(function(Ne){return Ne.teamId===c&&We(Ne)===C});var _svCv=L;try{typeof window.__svDedupeCoachVotesForTally=="function"&&(_svCv=window.__svDedupeCoachVotesForTally(c,C,L)||L)}catch(_svCe){console.warn("[dedupe-coach-tally]",_svCe)}B=Uo(c,C,_svCv);',
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
    if (p.to && s.includes(p.to.slice(0, Math.min(100, p.to.length))) && p.from !== p.to) {
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
console.log("app.min.js v174 patches applied");
