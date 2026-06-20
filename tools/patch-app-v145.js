/**
 * v145: Fix Save team & round — always persist locally, clear errors on cloud fail.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "chunk import tag v145",
    from: 'import("./chunk-HQEVIJDY.js?tag=v144")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v145")',
  },
  {
    name: "XI always local save then optional cloud",
    from:
      'Kt.textContent="",Lt.textContent="",St.textContent="",ye&&he)if(!me.currentUser)A(),Y.style.color="#a16207",Y.textContent="Saved locally only (not synced). Sign in as super admin to save to cloud for everyone.";else try{await vu()}catch(_){Y.textContent=Jn(_,"Could not save."),console.error(_);return}else A();',
    to:
      'Kt.textContent="",Lt.textContent="",St.textContent="",A(),ye&&he)if(ye&&he&&me.currentUser)try{await vu()}catch(_){Y.style.color="#a16207",Y.textContent="Saved on this device — cloud sync failed: "+Jn(_,"Could not sync to cloud."),console.error(_)}else if(ye&&he&&!me.currentUser)Y.style.color="#a16207",Y.textContent="Saved on this device only. Sign in as super admin to sync to cloud for everyone.";',
    once: true,
  },
  {
    name: "XI null-safe team name input",
    from: "try{Wh()}catch{}var m=mr.value.trim();",
    to: "try{Wh()}catch{}var m=mr&&mr.value?mr.value.trim():\"\";",
    once: true,
  },
  {
    name: "log admin template mount failures",
    from: "Ra.appendChild(To.content.cloneNode(!0)),ed=!0,tE(),ng(),iE()}catch{}",
    to: 'Ra.appendChild(To.content.cloneNode(!0)),ed=!0,tE(),ng(),iE()}catch(e){console.error("[admin] deferred mount failed",e)}',
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
    if (p.to && s.includes(p.to) && p.from !== p.to) {
      console.log("SKIP (already applied):", p.name);
      return;
    }
    console.error("MISSING patch target:", p.name);
    failed = true;
    return;
  }
  if (p.once) {
    var next = replaceOnce(s, p.from, p.to);
    if (next == null) {
      console.error("replaceOnce failed:", p.name);
      failed = true;
      return;
    }
    s = next;
  } else {
    s = s.replace(p.from, p.to);
  }
  console.log("OK:", p.name);
});

if (failed) process.exit(1);
fs.writeFileSync(appPath, s);
console.log("app.min.js v145 patches applied");
