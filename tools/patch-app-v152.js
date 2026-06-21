/**
 * v152: Fix admin save binding + Op round load + dedupe SvGetEl.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "chunk import tag v152",
    from: 'import("./chunk-HQEVIJDY.js?tag=v151")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v152")',
  },
  {
    name: "remove duplicate SvGetEl",
    from:
      'function SvGetEl(el,id){try{return el&&el.isConnected?el:document.getElementById(id)}catch{return document.getElementById(id)}}function SvGetEl(el,id){try{return el&&el.isConnected?el:document.getElementById(id)}catch{return document.getElementById(id)}}',
    to:
      'function SvGetEl(el,id){try{return el&&el.isConnected?el:document.getElementById(id)}catch{return document.getElementById(id)}}',
    once: true,
  },
  {
    name: "ng per-element _svBound binding",
    from:
      'function ng(){tg||!Ai&&!Ri&&!nr&&!fn||(tg=!0,fn&&fn.addEventListener("input",function(){try{xa=!0,Zc=Mh(fn.value)}catch{}}),Ai&&!Ai._svBound&&(Ai._svBound=!0,Ai.addEventListener("click",XI)),Ri&&!Ri._svBound&&(Ri._svBound=!0,Ri.addEventListener("click",ZI)),nr&&!nr._svBound&&(nr._svBound=!0,nr.addEventListener("click",eE)))}',
    to:
      'function ng(){try{fn&&!fn._svBound&&(fn._svBound=!0,fn.addEventListener("input",function(){try{xa=!0,Zc=Mh(fn.value)}catch{}})),Ai&&!Ai._svBound&&(Ai._svBound=!0,Ai.addEventListener("click",XI)),Ri&&!Ri._svBound&&(Ri._svBound=!0,Ri.addEventListener("click",ZI)),nr&&!nr._svBound&&(nr._svBound=!0,nr.addEventListener("click",eE))}catch{}}',
    once: true,
  },
  {
    name: "Op load round from adminMatchRoundSelect",
    from:
      'function Op(){try{SvWireMatchFieldRefs()}catch{}var c=ie(ne||ue),l=Lo(c),h=c.matchesByRound',
    to:
      'function Op(){try{SvWireMatchFieldRefs()}catch{}var c=ie(ne||ue),l=Sn&&Sn.value?N(Sn.value)||Sn.value:Lo(c),h=c.matchesByRound',
    once: true,
  },
  {
    name: "XI refresh match fields after save",
    from:
      'try{A()}catch{}try{window.dispatchEvent(new CustomEvent("sv-match-saved",{detail:{teamId:ne||ue,round:l}}))}catch{}}async function ZI()',
    to:
      'try{A()}catch{}try{Op()}catch{}try{window.dispatchEvent(new CustomEvent("sv-match-saved",{detail:{teamId:ne||ue,round:l}}))}catch{}}async function ZI()',
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
console.log("app.min.js v152 patches applied");
