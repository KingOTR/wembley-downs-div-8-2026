/**
 * v179: Ua() votes-received count uses __svCountVotesForRound (backup/cache/queue merge).
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "Ua() use __svCountVotesForRound for merged local sources",
    from:
      "function Ua(c,l,h){var m=We({round:l}),f=0;return h.forEach(function(_){T(_.teamId)===T(c)&&We(_)===m&&f++}),f}",
    to:
      'function Ua(c,l,h){try{if(typeof window.__svCountVotesForRound=="function"){var _svN=window.__svCountVotesForRound(c,l,h);if(typeof _svN==="number")return _svN}}catch(_svUe){console.warn("[vote-count]",_svUe)}var m=We({round:l}),f=0;return h.forEach(function(_){T(_.teamId)===T(c)&&We(_)===m&&f++}),f}',
    once: true,
  },
  {
    name: "Coach vote selectors use SvLatestResultRound",
    from: 'function MI(){try{if(!ke())return;var c=ue,l=ie(c),h=Xh(c),m=SvDefaultRound(l,h);Vt&&xs(Vt,h,Vt._touched&&Vt.value||m),Ot&&xs(Ot,h,Ot._touched&&Ot.value||m)}catch{}}',
    to: 'function MI(){try{if(!ke())return;var c=ue,l=ie(c),h=Xh(c),m=SvLatestResultRound(l)||SvDefaultRound(l,h);m&&h.indexOf(m)===-1&&h.unshift(m),Vt&&xs(Vt,h,Vt._touched&&Vt.value||m),Ot&&xs(Ot,h,Ot._touched&&Ot.value||m)}catch{}}',
    once: true,
  },
  {
    name: "Coach vote selectors use SvLatestResultRound (slot 1/2)",
    from: 'function BI(){try{if(!bt(le.teamId,le.slot))return;var c=le.teamId,l=ie(c),h=Xh(c),m=SvDefaultRound(l,h);Rt&&xs(Rt,h,Rt._touched&&Rt.value||m)}catch{}}',
    to: 'function BI(){try{if(!bt(le.teamId,le.slot))return;var c=le.teamId,l=ie(c),h=Xh(c),m=SvLatestResultRound(l)||SvDefaultRound(l,h);m&&h.indexOf(m)===-1&&h.unshift(m),Rt&&xs(Rt,h,Rt._touched&&Rt.value||m)}catch{}}',
    once: true,
  },
  {
    name: "Coach results default uses SvLatestResultRound",
    from: 'function FI(c){var l=c??ue,h=ie(l),m=h.round||"Round 1",f=Fa(l,U.coachVotes,m),_=SvDefaultRound(h,f),E=vt?String(vt.value||""):"";return pi&&E&&f.map(String).indexOf(E)!==-1?E:_}',
    to: 'function FI(c){var l=c??ue,h=ie(l),m=h.round||"Round 1",f=Fa(l,U.coachVotes,m),_=SvLatestResultRound(h)||SvDefaultRound(h,f),E=vt?String(vt.value||""):"";return _&&f.indexOf(_)===-1&&f.unshift(_),pi&&E&&f.map(String).indexOf(E)!==-1?E:_}',
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
console.log("app.min.js v179 patches applied");
