/**
 * v193: fix Uo() — v192 patch left `return _h.forEach(...)` so tally always returned undefined.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "Uo() remove erroneous return before forEach (v192 regression)",
    from: "return _h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}});var _rows=Object.entries(m)",
    to: "_h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}});var _rows=Object.entries(m)",
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
console.log("app.min.js v193 patches applied");
