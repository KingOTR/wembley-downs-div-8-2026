/**
 * v142 patches for app.min.js:
 * - Kickoff datetime-local ↔ stored format conversion
 * - Op() focus guard for match admin inputs
 * - Cloud config merge preserves local kickoff/location when cloud missing
 * - Sync date from kickoff on save
 * - Fix ys/vs DOM ref collision (ground/pitch vs coach clear / results body)
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const helpers =
  'function SvPad2(n){return n<10?"0"+n:""+n}function SvKickoffToInput(v){if(!v)return"";var s=String(v).trim();if(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(s))return s;try{var d=new Date(s);if(!isNaN(d.getTime()))return d.getFullYear()+"-"+SvPad2(d.getMonth()+1)+"-"+SvPad2(d.getDate())+"T"+SvPad2(d.getHours())+":"+SvPad2(d.getMinutes())}catch{}return s.length>=16?s.slice(0,16):""}function SvKickoffSave(v){var s=String(v||"").trim();if(!s)return"";if(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(s))return s;try{var d=new Date(s);if(!isNaN(d.getTime()))return SvKickoffToInput(d.toISOString())}catch{}return s}function SvMergeMatchRound(a,b){if(!a&&!b)return{};if(!b)return a||{};if(!a)return b||{};var o=Object.assign({},a,b);["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review"].forEach(function(k){if(b[k]==null||b[k]===""){if(a[k]!=null&&a[k]!=="")o[k]=a[k]}});if(b.lineup)o.lineup=b.lineup;return o}function SvMergeMatchesByRound(a,b){var o=Object.assign({},a||{});if(b)Object.keys(b).forEach(function(k){o[k]=SvMergeMatchRound(a&&a[k],b[k])});return o}function SvSnapshotTeams(){try{return U.teams&&U.teams.slice?U.teams.slice():[]}catch{return[]}}';

const patches = [
  {
    name: "chunk import tag v142",
    from: 'import("./chunk-HQEVIJDY.js?tag=v141")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v142")',
  },
  {
    name: "rename ground/pitch refs MgrEl/MpchEl",
    from: 'ys=document.getElementById("matchGroundInput"),vs=document.getElementById("matchPitchInput")',
    to: 'MgrEl=document.getElementById("matchGroundInput"),MpchEl=document.getElementById("matchPitchInput")',
    once: true,
  },
  {
    name: "inject kickoff merge helpers before Op",
    from: "function Op(){var c=ie(ue),l=Lo(c),h=c.matchesByRound&&c.matchesByRound[l]?c.matchesByRound[l]:{};ds&&(ds.value=h.date||\"\"),MsubEl&&(MsubEl.value=h.suburb||\"\"),MkfEl&&(MkfEl.value=h.kickoff||\"\")",
    to: helpers + "function Op(){var c=ie(ue),l=Lo(c),h=c.matchesByRound&&c.matchesByRound[l]?c.matchesByRound[l]:{};var _ko=SvKickoffToInput(h.kickoff||\"\");ds&&document.activeElement!==ds&&(ds.value=h.date||(_ko?_ko.slice(0,10):\"\")),MsubEl&&document.activeElement!==MsubEl&&(MsubEl.value=h.suburb||\"\"),MkfEl&&document.activeElement!==MkfEl&&(MkfEl.value=_ko)",
    once: true,
  },
  {
    name: "Op focus guard ground/pitch/venue",
    from: "ys&&(ys.value=h.groundName||\"\"),vs&&(vs.value=h.pitchNumber||\"\"),MlatEl&&(MlatEl.value=h.lat!=null?String(h.lat):\"\"),MlngEl&&(MlngEl.value=h.lng!=null?String(h.lng):\"\"),function(){try{window.__svSyncLocationFromMatch&&window.__svSyncLocationFromMatch(h)}catch{}}(),fs&&(fs.value=h.venue||h.groundName||\"\"),ms&&(ms.value=h.opponent||\"\")",
    to: "MgrEl&&document.activeElement!==MgrEl&&(MgrEl.value=h.groundName||\"\"),MpchEl&&document.activeElement!==MpchEl&&(MpchEl.value=h.pitchNumber||\"\"),MlatEl&&(MlatEl.value=h.lat!=null?String(h.lat):\"\"),MlngEl&&(MlngEl.value=h.lng!=null?String(h.lng):\"\"),function(){try{window.__svSyncLocationFromMatch&&window.__svSyncLocationFromMatch(h)}catch{}}(),fs&&document.activeElement!==fs&&(fs.value=h.venue||h.groundName||\"\"),ms&&document.activeElement!==ms&&(ms.value=h.opponent||\"\")",
  },
  {
    name: "XI save kickoff normalized + date from kickoff",
    from: 'date:ds?ds.value:"",suburb:MsubEl?MsubEl.value.trim():"",kickoff:MkfEl?MkfEl.value:""',
    to: 'date:(function(){var _k=MkfEl?SvKickoffSave(MkfEl.value):"";return _k?_k.slice(0,10):(ds?ds.value:"")})(),suburb:MsubEl?MsubEl.value.trim():"",kickoff:MkfEl?SvKickoffSave(MkfEl.value):""',
  },
  {
    name: "XI save ground/pitch safe refs",
    from: 'groundName:ys?ys.value.trim():"",pitchNumber:vs?vs.value.trim():""',
    to: 'groundName:MgrEl?MgrEl.value.trim():"",pitchNumber:MpchEl?MpchEl.value.trim():""',
  },
  {
    name: "qc merge local matchesByRound on cloud sync",
    from: "U.teams=Ye(),c.teams.forEach(function(l,h){h>=r||(U.teams[h]=P({id:h+1,name:l.name||\"Team \"+(h+1),round:l.round||\"Round 1\",players:Array.isArray(l.players)?l.players.slice(0,y).filter(Boolean):[],matchesByRound:l.matchesByRound,coach1Name:l.coach1Name",
    to: "((function(_p){U.teams=Ye(),c.teams.forEach(function(l,h){h>=r||(U.teams[h]=P({id:h+1,name:l.name||\"Team \"+(h+1),round:l.round||\"Round 1\",players:Array.isArray(l.players)?l.players.slice(0,y).filter(Boolean):[],matchesByRound:SvMergeMatchesByRound(_p[h]&&_p[h].matchesByRound,l.matchesByRound),squadBadges:l.squadBadges||(_p[h]&&_p[h].squadBadges),coach1Name:l.coach1Name",
    once: true,
  },
  {
    name: "qc IIFE close with snapshot",
    from: "coach2PasswordHash:l.coach2PasswordHash||\"\"}))}),k():(c.round!=null",
    to: "coach2PasswordHash:l.coach2PasswordHash||\"\"}))})})(SvSnapshotTeams()),k():(c.round!=null",
    once: true,
  },
  {
    name: "refresh admin match inputs after cloud sync",
    from: "ke()&&(su(),iu(),Ki(),$i(),Ds(ue),Pt(),ht())",
    to: "ke()&&(su(),iu(),Ki(),$i(),Op(),Ds(ue),Pt(),ht())",
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
    if (p.to && s.includes(p.to)) {
      console.log("SKIP (already applied):", p.name);
      return;
    }
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
console.log("app.min.js v142 patches applied");
