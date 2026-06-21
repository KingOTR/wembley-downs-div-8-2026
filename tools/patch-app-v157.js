/**
 * v157: Results tally dedupes one ballot per squad member (latest wins).
 * @deprecated Patch chain frozen — prefer src/ + npm run build when app is migrated.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "Uo() dedupe votes via __svDedupeVotesForTally before tally",
    from: "function Uo(c,l,h){var m={};return h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}}),Object.entries(m).sort(function(f,_){return _[1]-f[1]||f[0].localeCompare(_[0])}).map(function(f){return{name:f[0],pts:f[1]}})}",
    to: 'function Uo(c,l,h){var m={},_h=h;try{typeof window.__svDedupeVotesForTally=="function"&&(_h=window.__svDedupeVotesForTally(c,l,h)||h)}catch(e){console.warn("[dedupe-tally]",e)}return _h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}}),Object.entries(m).sort(function(f,_){return _[1]-f[1]||f[0].localeCompare(_[0])}).map(function(f){return{name:f[0],pts:f[1]}})}',
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
    if (p.to && s.includes(p.to.slice(0, 80)) && p.from !== p.to) {
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
console.log("app.min.js v157 patches applied");
