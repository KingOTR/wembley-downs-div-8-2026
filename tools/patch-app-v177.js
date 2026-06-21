/**
 * v177: Cloud vote listener must merge local + cloud — not replace with cloud-only.
 * Empty Firestore votes collection was wiping U.votes and zeroing Round 9 results.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "Ds() merge cloud votes with local instead of replace",
    from:
      "function E(){var L=[];try{m&&m.docs&&(L=L.concat(m.docs))}catch{}try{f&&f.docs&&(L=L.concat(f.docs))}catch{}var B=_(L),x=U.votes&&U.votes.length;U.votes=B,jh(l),!x||!B.length?(vr&&(clearTimeout(vr),vr=0),Pt(),bt(le.teamId,le.slot)&&Vs(),Vo()):yI()}",
    to:
      "function E(){var L=[];try{m&&m.docs&&(L=L.concat(m.docs))}catch{}try{f&&f.docs&&(L=L.concat(f.docs))}catch{}var B=_(L),x=U.votes&&U.votes.length,byId=Object.create(null);function mv(v){if(!v||!v.id||T(v.teamId)!==T(l))return;byId[v.id]=v}(U.votes||[]).forEach(mv);B.forEach(mv);try{var raw=localStorage.getItem(i);if(raw){var data=JSON.parse(raw);(data.votes||[]).forEach(mv)}}catch(e){}U.votes=Object.keys(byId).map(function(k){return byId[k]}),jh(l),!x||!U.votes.length?(vr&&(clearTimeout(vr),vr=0),Pt(),bt(le.teamId,le.slot)&&Vs(),Vo()):yI()}",
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
console.log("app.min.js v177 patches applied");
