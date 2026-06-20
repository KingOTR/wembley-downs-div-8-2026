/**
 * v143: Move Sv* helpers before qc() + window exports (fixes ReferenceError on mobile/SW cache).
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const helpers =
  'function SvPad2(n){return n<10?"0"+n:""+n}function SvKickoffToInput(v){if(!v)return"";var s=String(v).trim();if(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(s))return s;try{var d=new Date(s);if(!isNaN(d.getTime()))return d.getFullYear()+"-"+SvPad2(d.getMonth()+1)+"-"+SvPad2(d.getDate())+"T"+SvPad2(d.getHours())+":"+SvPad2(d.getMinutes())}catch{}return s.length>=16?s.slice(0,16):""}function SvKickoffSave(v){var s=String(v||"").trim();if(!s)return"";if(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(s))return s;try{var d=new Date(s);if(!isNaN(d.getTime()))return SvKickoffToInput(d.toISOString())}catch{}return s}function SvMergeMatchRound(a,b){if(!a&&!b)return{};if(!b)return a||{};if(!a)return b||{};var o=Object.assign({},a,b);["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review"].forEach(function(k){if(b[k]==null||b[k]===""){if(a[k]!=null&&a[k]!=="")o[k]=a[k]}});if(b.lineup)o.lineup=b.lineup;return o}function SvMergeMatchesByRound(a,b){var o=Object.assign({},a||{});if(b)Object.keys(b).forEach(function(k){o[k]=SvMergeMatchRound(a&&a[k],b[k])});return o}function SvSnapshotTeams(){try{return U.teams&&U.teams.slice?U.teams.slice():[]}catch{return[]}}try{typeof window!="undefined"&&(window.SvMergeMatchesByRound=SvMergeMatchesByRound,window.SvMergeMatchRound=SvMergeMatchRound,window.SvSnapshotTeams=SvSnapshotTeams,window.SvKickoffToInput=SvKickoffToInput,window.SvKickoffSave=SvKickoffSave)}catch{}';

const patches = [
  {
    name: "chunk import tag v143",
    from: 'import("./chunk-HQEVIJDY.js?tag=v142")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v143")',
  },
  {
    name: "remove helpers before Op (late placement)",
    from: helpers + "function Op(){",
    to: "function Op(){",
    once: true,
  },
  {
    name: "insert helpers before ie/qc",
    from: "Ta=!1;function ie(c){var l=U.teams.filter(function(h){return h.id===c})[0];return l||U.teams[0]}function qc(c){",
    to: "Ta=!1;" + helpers + "function ie(c){var l=U.teams.filter(function(h){return h.id===c})[0];return l||U.teams[0]}function qc(c){",
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

// Remove duplicate late-placed helpers (before Op) if present
var secondPad = s.indexOf("function SvPad2", s.indexOf("function SvPad2") + 1);
if (secondPad !== -1) {
  var opIdx = s.indexOf("function Op()", secondPad);
  if (opIdx !== -1 && opIdx < secondPad + 3000) {
    s = s.slice(0, secondPad) + s.slice(opIdx);
    console.log("OK: removed duplicate helpers before Op()");
  }
}

const qcPos = s.indexOf("function qc(c){c&&(c.version===2");
const defPos = s.indexOf("function SvMergeMatchesByRound");
if (qcPos === -1 || defPos === -1 || defPos > qcPos) {
  console.error("VERIFY FAIL: SvMergeMatchesByRound must be defined before qc(), got def@", defPos, "qc@", qcPos);
  process.exit(1);
}
console.log("VERIFY OK: helpers before qc (def@", defPos, "qc@", qcPos, ")");

fs.writeFileSync(appPath, s);
console.log("app.min.js v143 patches applied");
