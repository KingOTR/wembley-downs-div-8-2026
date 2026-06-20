/**
 * v139 patches for app.min.js:
 * - Fix chunk import tag
 * - Lineup player badge (C/VC/GK) save/load in admin editor
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "chunk import tag v139",
    from: 'import("./chunk-HQEVIJDY.js?tag=v135")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v139")',
  },
  {
    name: "badge dom ref",
    from: 'Na=document.getElementById("lineupSelectedNumber"),Da=document.getElementById("lineupApplySelected")',
    to: 'Na=document.getElementById("lineupSelectedNumber"),Ba=document.getElementById("lineupSelectedBadge"),Da=document.getElementById("lineupApplySelected")',
    once: true,
  },
  {
    name: "load badge on select",
    from: 'ka&&(ka.value=m?String(m.name||""):""),Na&&(Na.value=m?String(m.number||""):""),Da&&(Da.disabled=!m)',
    to: 'ka&&(ka.value=m?String(m.name||""):""),Na&&(Na.value=m?String(m.number||""):""),Ba&&(Ba.value=m&&m.badge?String(m.badge):""),Da&&(Da.disabled=!m)',
  },
  {
    name: "save badge on apply",
    from: 'm&&(h.name=m),h.number=f||"",gn("starter"),Qt()',
    to: 'm&&(h.name=m),h.number=f||"",h.badge=Ba?String(Ba.value||"").trim().toUpperCase():"",gn("starter"),Qt()',
  },
  {
    name: "canonicalize voter name on submit",
    from: 'Kt.textContent="";var c=et.value.trim();if(!c){Kt.textContent="Enter your name before voting.";return}',
    to: 'Kt.textContent="";var c=et.value.trim();try{var _svC=window.__svCanonicalPlayerName;c=_svC?_svC(c)||c:c}catch{}if(!c){Kt.textContent="Enter your name before voting.";return}et.value=c;',
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
    console.error("MISSING patch target:", p.name);
    failed = true;
    return;
  }
  if (p.to && s.includes(p.to) && p.from !== p.to) {
    console.log("SKIP (already applied):", p.name);
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
console.log("app.min.js v139 patches applied");
