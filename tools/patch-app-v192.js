/**
 * v192: persist squadi on cloud save; show all squad in results tally; qc loads squadi.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "qc() preserve team.squadi from cloud/local",
    from: 'coach2PasswordHash:l.coach2PasswordHash||""}))})',
    to: 'coach2PasswordHash:l.coach2PasswordHash||"",squadi:l.squadi||(_p[h]&&_p[h].squadi)||null}))})',
    once: true,
  },
  {
    name: "vu() merge squadi from localStorage before Firestore write",
    from: "async function vu(){if(ye&&he&&me.currentUser){await yp(Qn(he,\"config\",\"main\"),{version:2,teams:U.teams,updatedAt:lp()},{merge:!0});",
    to:
      'async function vu(){if(ye&&he&&me.currentUser){try{var _sqRaw=localStorage.getItem(i);if(_sqRaw){var _sqD=JSON.parse(_sqRaw);if(_sqD&&Array.isArray(_sqD.teams))_sqD.teams.forEach(function(_sqT,_sqI){if(_sqT&&_sqT.squadi&&U.teams[_sqI])U.teams[_sqI].squadi=_sqT.squadi})}}catch(_sqE){console.warn("[squadi-cloud]",_sqE)}await yp(Qn(he,"config","main"),{version:2,teams:U.teams,updatedAt:lp()},{merge:!0});',
    once: true,
  },
  {
    name: "Uo() include zero-pt squad members (player tally only)",
    from: '}),Object.entries(m).sort(function(f,_){return _[1]-f[1]||f[0].localeCompare(_[0])}).map(function(f){return{name:f[0],pts:f[1]}})}function Ct(c){',
    to:
      '});var _rows=Object.entries(m).sort(function(f,_){return _[1]-f[1]||f[0].localeCompare(_[0])}).map(function(f){return{name:f[0],pts:f[1]}});if(!_coach)try{var _tm=ie(c),_pls=_tm&&_tm.players?_tm.players.filter(Boolean):[];if(_pls.length){var _seen={};_rows.forEach(function(r){_seen[svCanon(r.name)]=!0});_pls.forEach(function(p){var _n=svCanon(p);if(_n&&!_seen[_n]){_rows.push({name:_n,pts:0});_seen[_n]=!0}});_rows.sort(function(a,b){return b.pts-a.pts||String(a.name).localeCompare(String(b.name))})}}catch(_zE){console.warn("[tally-zero]",_zE)}return _rows}function Ct(c){',
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
    if (p.to && s.includes(p.to.slice(0, Math.min(120, p.to.length))) && p.from !== p.to) {
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
console.log("app.min.js v192 patches applied");
