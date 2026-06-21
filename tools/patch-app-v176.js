/**
 * v176: Fix results tally — coach votes must not run player dedupe; normalize round in Uo().
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "Uo() normalize round + coach dedupe hook",
    from: 'function Uo(c,l,h){var m={},_h=h;try{typeof window.__svDedupeVotesForTally=="function"&&(_svT=window.__svDedupeVotesForTally(c,l,h),_h=Array.isArray(_svT)?_svT:h)}catch(e){console.warn("[dedupe-tally]",e)}return _h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){',
    to: 'function Uo(c,l,h,_coach){var m={},_h=h;l=We({round:l});try{_coach?typeof window.__svDedupeCoachVotesForTally=="function"&&(_svTd=window.__svDedupeCoachVotesForTally(c,l,h),_h=Array.isArray(_svTd)?_svTd:h):typeof window.__svDedupeVotesForTally=="function"&&(_svT=window.__svDedupeVotesForTally(c,l,h),_h=Array.isArray(_svT)?_svT:h)}catch(e){console.warn(_coach?"[dedupe-coach-tally]":"[dedupe-tally]",e)}return _h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){',
    once: true,
  },
  {
    name: "ht() coach tally uses Uo coach mode",
    from: 'L=U.coachVotes.filter(function(Ne){return Ne.teamId===c&&We(Ne)===C});var _svCv=L;try{typeof window.__svDedupeCoachVotesForTally=="function"&&(_svCv=window.__svDedupeCoachVotesForTally(c,C,L)||L)}catch(_svCe){console.warn("[dedupe-coach-tally]",_svCe)}var B=Uo(c,C,_svCv);',
    to: "L=U.coachVotes.filter(function(Ne){return Ne.teamId===c&&We(Ne)===C});var B=Uo(c,C,L,!0);",
    once: true,
  },
  {
    name: "Qp() coach comparison uses Uo coach mode",
    from: "b=Uo(c,E,U.votes),C=Uo(c,E,U.coachVotes);",
    to: "b=Uo(c,E,U.votes),C=Uo(c,E,U.coachVotes,!0);",
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
    if (p.to && s.includes(p.to.slice(0, Math.min(80, p.to.length))) && p.from !== p.to) {
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
console.log("app.min.js v176 patches applied");
