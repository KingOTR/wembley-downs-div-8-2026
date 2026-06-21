/**
 * v170: Wrong-name vote flags on submit; admin ballots panel; unmatched tally exclusion.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "enrich vote payload with name-match flags",
    from: "var E={teamId:ne,voterName:c,voterNameKey:f,round:m,picks:l,submittedAt:new Date().toISOString()};if(ye&&he)try{var b=",
    to: 'var E={teamId:ne,voterName:c,voterNameKey:f,round:m,picks:l,submittedAt:new Date().toISOString()};try{if(typeof window.__svEnrichVotePayload=="function"){var _svEv=window.__svEnrichVotePayload(c,ne,E);if(_svEv&&typeof _svEv=="object")E=Object.assign({},E,_svEv)}}catch(_svEe){console.warn("[vote-enrich]",_svEe)}if(ye&&he)try{var b=',
    once: true,
  },
  {
    name: "thank-you message when name unmatched",
    from: 'Kt.textContent="Thanks — your vote was recorded."',
    to: 'Kt.textContent=E.tallyExcluded?"Thanks — vote saved. Your name didn\'t match the squad list; an admin will review before it counts in results.":"Thanks — your vote was recorded."',
    once: true,
  },
  {
    name: "admin ballots via __svRenderAdminBallots",
    from: 'function jI(c,l){if(rr){if(!ke()){rr.innerHTML=""',
    to: 'function jI(c,l){if(typeof window.__svRenderAdminBallots=="function"){window.__svRenderAdminBallots(c,l);return}if(rr){if(!ke()){rr.innerHTML=""',
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
console.log("app.min.js v170 patches applied");
