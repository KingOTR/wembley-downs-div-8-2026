/**
 * v156: voteMetaByRound (exclusions + ballot aliases) + cloud sync hooks for who-voted panel.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const voteMetaHook =
  'window.__svPatchVoteMeta=function(tid,rk,patch){try{var c=ie(tid);if(!c)return;var rr=N(rk)||rk;c.voteMetaByRound=c.voteMetaByRound||{};var m=c.voteMetaByRound[rr]||{excluded:[],aliases:{}};if(!m.excluded)m.excluded=[];if(!m.aliases)m.aliases={};if(patch.excluded)m.excluded=patch.excluded.slice();if(patch.aliases)m.aliases=Object.assign({},m.aliases,patch.aliases);if(patch.addAlias&&patch.addAlias.from&&patch.addAlias.to){var k=String(patch.addAlias.from||"").replace(/\\s*\\([^)]*\\)\\s*/g," ").replace(/\\s+(goalkeeper|gk|captain|capt|c)\\s*$/i,"").replace(/\\s+/g," ").trim().toLowerCase();m.aliases[k]=String(patch.addAlias.to||"").replace(/\\s+/g," ").trim()}c.voteMetaByRound[rr]=m;A()}catch(e){console.warn("[sv] patch voteMeta",e)}};window.__svSyncConfig=function(){return vu()};';

const patches = [
  {
    name: "inject voteMeta + sync hooks after location patch",
    from: 'console.warn("[sv] patch location",e)}};function SvPad2(n)',
    to: 'console.warn("[sv] patch location",e)}};' + voteMetaHook + "function SvPad2(n)",
    once: true,
  },
  {
    name: "merge voteMetaByRound in qc team sync",
    from: "squadBadges:l.squadBadges||(_p[h]&&_p[h].squadBadges),coach1Name",
    to: "squadBadges:l.squadBadges||(_p[h]&&_p[h].squadBadges),voteMetaByRound:_cloudWin?(l.voteMetaByRound||{}):(l.voteMetaByRound||(_p[h]&&_p[h].voteMetaByRound)||{}),coach1Name",
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
console.log("app.min.js v156 patches applied");
