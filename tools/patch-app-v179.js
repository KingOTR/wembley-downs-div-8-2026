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
