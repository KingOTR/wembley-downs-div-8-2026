/**
 * v141 patches for app.min.js:
 * - Fix La/Lg/Sb DOM ref collisions (v140 used minified function names)
 * - Subs textarea: don't overwrite while focused / mid-typing
 * - Paste 11+ starters → extras become subs; comma-separated names
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "chunk import tag v141",
    from: 'import("./chunk-HQEVIJDY.js?tag=v140")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v141")',
  },
  {
    name: "rename suburb ref MsubEl",
    from: 'Sb=document.getElementById("matchSuburbInput"),Kf=document.getElementById("matchKickoffInput")',
    to: 'MsubEl=document.getElementById("matchSuburbInput"),MkfEl=document.getElementById("matchKickoffInput")',
    once: true,
  },
  {
    name: "rename lat/lng refs MlatEl/MlngEl",
    from: 'La=document.getElementById("matchLatInput"),Lg=document.getElementById("matchLngInput")',
    to: 'MlatEl=document.getElementById("matchLatInput"),MlngEl=document.getElementById("matchLngInput")',
    once: true,
  },
  {
    name: "Op load suburb/kickoff/lat safe refs",
    from: 'Sb&&(Sb.value=h.suburb||""),Kf&&(Kf.value=h.kickoff||""),ys&&(ys.value=h.groundName||""),vs&&(vs.value=h.pitchNumber||""),La&&(La.value=h.lat!=null?String(h.lat):""),Lg&&(Lg.value=h.lng!=null?String(h.lng):"")',
    to: 'MsubEl&&(MsubEl.value=h.suburb||""),MkfEl&&(MkfEl.value=h.kickoff||""),ys&&(ys.value=h.groundName||""),vs&&(vs.value=h.pitchNumber||""),MlatEl&&(MlatEl.value=h.lat!=null?String(h.lat):""),MlngEl&&(MlngEl.value=h.lng!=null?String(h.lng):""),function(){try{window.__svSyncLocationFromMatch&&window.__svSyncLocationFromMatch(h)}catch{}}()',
  },
  {
    name: "XI save safe refs",
    from: 'suburb:Sb?Sb.value.trim():"",kickoff:Kf?Kf.value:""',
    to: 'suburb:MsubEl?MsubEl.value.trim():"",kickoff:MkfEl?MkfEl.value:""',
  },
  {
    name: "XI save lat/lng safe refs",
    from: 'lat:La&&La.value!==""?parseFloat(La.value):h&&h.lat!=null?h.lat:null,lng:Lg&&Lg.value!==""?parseFloat(Lg.value):h&&h.lng!=null?h.lng:null',
    to: 'lat:MlatEl&&MlatEl.value!==""?parseFloat(MlatEl.value):h&&h.lat!=null?h.lat:null,lng:MlngEl&&MlngEl.value!==""?parseFloat(MlngEl.value):h&&h.lng!=null?h.lng:null',
  },
  {
    name: "hI comma-separated names",
    from: 'function hI(c){return String(c||"").split(/\\r?\\n/).map(function(l){return String(l||"").trim()})',
    to: 'function hI(c){return String(c||"").split(/[\\r\\n,]+/).map(function(l){return String(l||"").trim()})',
  },
  {
    name: "dI paste extras to subs",
    from: 'for(var m=0;m<11;m++){var f=F.starters[m],_=l[m];!f||!_||(f.name=_.name,_.number&&(f.number=_.number))}try{F.squad=Bh(ue).slice(0,30)}catch{}try{Wi(pn)}catch{}gn("starters"),Qt()}}',
    to: 'for(var m=0;m<11;m++){var f=F.starters[m],_=l[m];!f||!_||(f.name=_.name,_.number&&(f.number=_.number))}if(l.length>11){var _xs=l.slice(11).map(function(x){return x&&x.name?String(x.name).trim():""}).filter(Boolean),_cur=Array.isArray(F.subs)?F.subs.slice():[];F.subs=_cur.concat(_xs).filter(function(n,i,a){return n&&a.indexOf(n)===i})}try{F.squad=Bh(ue).slice(0,30)}catch{}try{Wi(pn)}catch{}gn("starters"),Qt()}}',
  },
  {
    name: "Qt skip subs textarea when focused",
    from: 'Ss.appendChild(E)})),Pn.value=h.join(`\n`)',
    to: 'Ss.appendChild(E)})),document.activeElement!==Pn&&(Pn.value=h.join(`\n`))',
  },
  {
    name: "subs input no Qt loop",
    from: 'Pn.addEventListener("input",function(){if(F){F.subs=String(Pn.value||"").split(/\\r?\\n/).map(function(h){return h.trim()}).filter(Boolean),qn=-1,gn("subs"),Qt()',
    to: 'Pn.addEventListener("input",function(){if(F){F.subs=String(Pn.value||"").split(/\\r?\\n/),qn=-1;if(Pn._svT)clearTimeout(Pn._svT);Pn._svT=setTimeout(function(){try{gn("subs")}catch{}}(),450)',
  },
  {
    name: "subs blur normalize",
    from: 'Pn.addEventListener("input",function(){if(F){F.subs=String(Pn.value||"").split(/\\r?\\n/),qn=-1;if(Pn._svT)clearTimeout(Pn._svT);Pn._svT=setTimeout(function(){try{gn("subs")}catch{}}(),450);try{W&&(F.subs.length>Do',
    to: 'Pn.addEventListener("blur",function(){if(F){F.subs=String(Pn.value||"").split(/\\r?\\n/).map(function(h){return h.trim()}).filter(Boolean);Qt()}}),Pn.addEventListener("input",function(){if(F){F.subs=String(Pn.value||"").split(/\\r?\\n/),qn=-1;if(Pn._svT)clearTimeout(Pn._svT);Pn._svT=setTimeout(function(){try{gn("subs")}catch{}}(),450);try{W&&(F.subs.filter(function(h){return String(h||"").trim()}).length>Do',
  {
    name: "XI save locationLabel",
    from: 'lng:MlngEl&&MlngEl.value!==""?parseFloat(MlngEl.value):h&&h.lng!=null?h.lng:null})',
    to: 'lng:MlngEl&&MlngEl.value!==""?parseFloat(MlngEl.value):h&&h.lng!=null?h.lng:null,locationLabel:(function(){try{var _el=document.getElementById("matchLocationLabel");return _el&&_el.value?_el.value.trim():h&&h.locationLabel?h.locationLabel:""}catch{return""}})()})',
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
console.log("app.min.js v141 patches applied");
