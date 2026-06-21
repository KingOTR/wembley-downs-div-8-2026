/**
 * v160: Preserve voteMetaByRound (exclusions/aliases) when cloud config sync wins.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const mergeFn =
  'function SvMergeVoteMetaByRound(prev,incoming,cloudWin){var a=prev||{},b=incoming||{},out={},keys={};Object.keys(a).forEach(function(k){keys[k]=1});Object.keys(b).forEach(function(k){keys[k]=1});Object.keys(keys).forEach(function(rk){var p=a[rk]||{excluded:[],aliases:{}},i=b[rk]||{excluded:[],aliases:{}},ex=[];if(cloudWin){ex=i.excluded&&i.excluded.length?i.excluded.slice():((p.excluded||[]).slice())}else{ex=(b[rk]&&b[rk].excluded&&b[rk].excluded.length)?b[rk].excluded.slice():((p.excluded||[]).length?(p.excluded||[]).slice():((i.excluded||[]).slice()))}out[rk]={excluded:ex,aliases:Object.assign({},p.aliases||{},i.aliases||{})}});return out}';

const patches = [
  {
    name: "inject SvMergeVoteMetaByRound after SvMergeMatchesByRound",
    from: "function SvSnapshotTeams(){try{return U.teams&&U.teams.slice?U.teams.slice():[]}catch{return[]}}",
    to: mergeFn + "function SvSnapshotTeams(){try{return U.teams&&U.teams.slice?U.teams.slice():[]}catch{return[]}}",
    once: true,
  },
  {
    name: "merge voteMetaByRound preserving local exclusions",
    from: "voteMetaByRound:_cloudWin?(l.voteMetaByRound||{}):(l.voteMetaByRound||(_p[h]&&_p[h].voteMetaByRound)||{})",
    to: "voteMetaByRound:SvMergeVoteMetaByRound(_p[h]&&_p[h].voteMetaByRound,l.voteMetaByRound,_cloudWin)",
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
console.log("app.min.js v160 patches applied");
