/**
 * v144: location persist + weather refresh
 * - Patch match location into U.teams on autocomplete select (survives cloud Op() wipe)
 * - Dispatch sv-match-saved after XI save for weather refresh
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patchHook =
  'window.__svPatchMatchLocationFields=function(f){try{var c=ie(ue),l=N(Sn&&Sn.value?Sn.value:Lo(c))||"Round 1";(!c.matchesByRound||typeof c.matchesByRound!="object")&&(c.matchesByRound={});var h=Va(c,l)||{};c.matchesByRound[l]=Object.assign({},h,f||{});A()}catch(e){console.warn("[sv] patch location",e)}};';

const patches = [
  {
    name: "chunk import tag v144",
    from: 'import("./chunk-HQEVIJDY.js?tag=v143")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v144")',
  },
  {
    name: "inject location patch hook before ie",
    from: "Ta=!1;function SvPad2(n)",
    to: "Ta=!1;" + patchHook + "function SvPad2(n)",
    once: true,
  },
  {
    name: "XI dispatch match saved event",
    from: 'try{Y.style.color="#15803d",Y.textContent="Saved "+f+".",setTimeout(function(){Y.textContent==="Saved "+f+"."&&(Y.textContent="")},4500)}catch{}}async function ZI()',
    to: 'try{Y.style.color="#15803d",Y.textContent="Saved "+f+".",setTimeout(function(){Y.textContent==="Saved "+f+"."&&(Y.textContent="")},4500)}catch{}try{window.dispatchEvent(new CustomEvent("sv-match-saved",{detail:{teamId:ue,round:l}}))}catch{}}async function ZI()',
    once: true,
  },
  {
    name: "SvMerge preserve numeric lat/lng when cloud empty",
    from: '["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review"].forEach(function(k){if(b[k]==null||b[k]===""){if(a[k]!=null&&a[k]!=="")o[k]=a[k]}})',
    to: '["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review"].forEach(function(k){var bv=b[k],av=a[k];if(bv==null||bv===""||(k==="lat"||k==="lng")&&!isFinite(Number(bv))){if(av!=null&&av!==""&&(k!=="lat"&&k!=="lng"||isFinite(Number(av))))o[k]=av}})',
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
console.log("app.min.js v144 patches applied");
