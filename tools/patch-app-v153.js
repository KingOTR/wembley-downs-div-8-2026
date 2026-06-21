/**
 * v153: Squad/coach save local-first (match XI); chunk tag bump.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "ZI squad save local-first then cloud",
    from:
      'if(ge=[],gt=[],qt=[],xa=!1,Zc=null,ye&&he)if(!me.currentUser)A(),Y.style.color="#a16207",Y.textContent="Squad saved locally only (not synced). Sign in as super admin to save to cloud for everyone.";else try{await vu()}catch(m){Y.textContent=Jn(m,"Could not save."),console.error(m);return}else A();',
    to:
      'if(ge=[],gt=[],qt=[],xa=!1,Zc=null,ye&&he){A();if(!me.currentUser)Y.style.color="#a16207",Y.textContent="Squad saved locally only (not synced). Sign in as super admin to save to cloud for everyone.";else try{await vu()}catch(m){Y.style.color="#a16207",Y.textContent="Saved on this device — cloud sync failed: "+Jn(m,"Could not sync to cloud."),console.error(m)}}else A();',
    once: true,
  },
  {
    name: "eE coach codes save local-first then cloud",
    from:
      'mn.value="",ps.value="",ye&&he)if(!me.currentUser)A(),Y.style.color="#a16207",Y.textContent="Codes saved locally only (not synced). Sign in as super admin to save to cloud for everyone.";else try{await vu()}catch(m){Y.textContent=Jn(m,"Could not save codes."),console.error(m);return}else A();',
    to:
      'mn.value="",ps.value="",ye&&he){A();if(!me.currentUser)Y.style.color="#a16207",Y.textContent="Codes saved locally only (not synced). Sign in as super admin to save to cloud for everyone.";else try{await vu()}catch(m){Y.style.color="#a16207",Y.textContent="Saved on this device — cloud sync failed: "+Jn(m,"Could not sync codes to cloud."),console.error(m)}}else A();',
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
console.log("app.min.js v153 patches applied");
