/**
 * v147: Fix kickoff + match review/location fields not saving (wire refs, defensive reads).
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "chunk import tag v147",
    from: 'import("./chunk-HQEVIJDY.js?tag=v146")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v147")',
  },
  {
    name: "SvGetEl helper",
    from: "function SvWireMatchFieldRefs(){",
    to:
      'function SvGetEl(el,id){try{return el&&el.isConnected?el:document.getElementById(id)}catch{return document.getElementById(id)}}function SvWireMatchFieldRefs(){',
    once: true,
  },
  {
    name: "SvWireMatchFieldRefs via SvGetEl",
    from:
      'function SvWireMatchFieldRefs(){try{MsubEl=document.getElementById("matchSuburbInput"),MkfEl=document.getElementById("matchKickoffInput"),MgrEl=document.getElementById("matchGroundInput"),MpchEl=document.getElementById("matchPitchInput"),MlatEl=document.getElementById("matchLatInput"),MlngEl=document.getElementById("matchLngInput"),ds=document.getElementById("matchDateInput"),fs=document.getElementById("matchVenueInput"),ms=document.getElementById("matchOpponentInput"),Ti=document.getElementById("matchOurScoreInput"),Bn=document.getElementById("matchOppScoreInput"),bn=document.getElementById("matchScorersInput"),wi=document.getElementById("matchOppScorersInput"),dn=document.getElementById("matchReviewInput")}catch{}}',
    to:
      'function SvWireMatchFieldRefs(){try{MsubEl=SvGetEl(MsubEl,"matchSuburbInput"),MkfEl=SvGetEl(MkfEl,"matchKickoffInput"),MgrEl=SvGetEl(MgrEl,"matchGroundInput"),MpchEl=SvGetEl(MpchEl,"matchPitchInput"),MlatEl=SvGetEl(MlatEl,"matchLatInput"),MlngEl=SvGetEl(MlngEl,"matchLngInput"),ds=SvGetEl(ds,"matchDateInput"),fs=SvGetEl(fs,"matchVenueInput"),ms=SvGetEl(ms,"matchOpponentInput"),Ti=SvGetEl(Ti,"matchOurScoreInput"),Bn=SvGetEl(Bn,"matchOppScoreInput"),bn=SvGetEl(bn,"matchScorersInput"),wi=SvGetEl(wi,"matchOppScorersInput"),Sn=SvGetEl(Sn,"adminMatchRoundSelect"),dn=SvGetEl(dn,"matchReviewInput")}catch{}}',
    once: true,
  },
  {
    name: "SvKickoffSave local time not UTC ISO",
    from:
      'function SvKickoffSave(v){var s=String(v||"").trim();if(!s)return"";if(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(s))return s;try{var d=new Date(s);if(!isNaN(d.getTime()))return SvKickoffToInput(d.toISOString())}catch{}return s}',
    to:
      'function SvKickoffSave(v){var s=String(v||"").trim();if(!s)return"";if(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(s))return s;try{var d=new Date(s);if(!isNaN(d.getTime()))return d.getFullYear()+"-"+SvPad2(d.getMonth()+1)+"-"+SvPad2(d.getDate())+"T"+SvPad2(d.getHours())+":"+SvPad2(d.getMinutes())}catch{}return s}',
    once: true,
  },
  {
    name: "merge preserve scores and scorers",
    from:
      '["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review"]',
    to:
      '["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review","ourScore","oppScore","scorers","oppScorers","opponent"]',
    once: true,
  },
  {
    name: "XI wire refs before read",
    from: 'async function XI(){Y.textContent="";',
    to: 'async function XI(){try{SvWireMatchFieldRefs()}catch{}Y.textContent="";',
    once: true,
  },
  {
    name: "Op wire refs before load",
    from: "function Op(){var c=ie(ue)",
    to: 'function Op(){try{SvWireMatchFieldRefs()}catch{}var c=ie(ne||ue)',
    once: true,
  },
  {
    name: "XI use admin team ne",
    from:
      'async function XI(){try{SvWireMatchFieldRefs()}catch{}Y.textContent="";var c=ie(ue)',
    to:
      'async function XI(){try{SvWireMatchFieldRefs()}catch{}Y.textContent="";var c=ie(ne||ue)',
    once: true,
  },
  {
    name: "XI kickoff read via SvGetEl",
    from: 'kickoff:MkfEl?SvKickoffSave(MkfEl.value):""',
    to:
      'kickoff:(function(){var el=SvGetEl(MkfEl,"matchKickoffInput");return el?SvKickoffSave(el.value):""})()',
    once: true,
  },
  {
    name: "XI date from kickoff via SvGetEl",
    from:
      'date:(function(){var _k=MkfEl?SvKickoffSave(MkfEl.value):"";return _k?_k.slice(0,10):(ds?ds.value:"")})()',
    to:
      'date:(function(){var el=SvGetEl(MkfEl,"matchKickoffInput"),_k=el?SvKickoffSave(el.value):"";return _k?_k.slice(0,10):(SvGetEl(ds,"matchDateInput")?SvGetEl(ds,"matchDateInput").value:"")})()',
    once: true,
  },
  {
    name: "XI review read via SvGetEl",
    from: 'review:dn?dn.value.trim():""',
    to:
      'review:(function(){var el=SvGetEl(dn,"matchReviewInput");return el?el.value.trim():""})()',
    once: true,
  },
  {
    name: "reattach team object before localStorage save",
    from:
      'locationLabel:(function(){try{var _el=document.getElementById("matchLocationLabel");return _el&&_el.value?_el.value.trim():h&&h.locationLabel?h.locationLabel:""}catch{return""}})()}),Kt.textContent="",Lt.textContent="",St.textContent="",A()',
    to:
      'locationLabel:(function(){try{var _el=document.getElementById("matchLocationLabel");return _el&&_el.value?_el.value.trim():h&&h.locationLabel?h.locationLabel:""}catch{return""}})()}),(function(){try{var _sid=ne||ue,_sx=U.teams.findIndex(function(t){return t.id===_sid});_sx>=0&&(U.teams[_sx]=c)}catch{}})(),Kt.textContent="",Lt.textContent="",St.textContent="",A()',
    once: true,
  },
  {
    name: "final A() after refresh hooks before event",
    from:
      'try{window.dispatchEvent(new CustomEvent("sv-match-saved",{detail:{teamId:ue,round:l}}))}catch{}}async function ZI()',
    to:
      'try{A()}catch{}try{window.dispatchEvent(new CustomEvent("sv-match-saved",{detail:{teamId:ne||ue,round:l}}))}catch{}}async function ZI()',
    once: true,
  },
  {
    name: "reload match fields on admin team change",
    from: "Ns(ne),ou(ne)}),Ze&&Ze.addEventListener",
    to: "Ns(ne),ou(ne);try{Op()}catch{}}),Ze&&Ze.addEventListener",
    once: true,
  },
  {
    name: "qc sync main localStorage after cloud merge",
    from: "})(SvSnapshotTeams()),k()):(c.round!=null||c.players)",
    to: "})(SvSnapshotTeams()),k(),A()):(c.round!=null||c.players)",
    once: true,
  },
  {
    name: "save feedback lists persisted fields",
    from:
      'st("Team & round saved ("+f+").",null,null,4500,{success:!0});try{Y.style.color="#15803d",Y.textContent="Saved "+f+".",setTimeout(function(){Y.textContent==="Saved "+f+"."&&(Y.textContent="")},4500)}catch{}',
    to:
      'var _svSaved=[];try{var _mr=c.matchesByRound&&c.matchesByRound[l]?c.matchesByRound[l]:{};_mr.kickoff&&_svSaved.push("kickoff");_mr.review&&_svSaved.push("review");(_mr.opponent||_mr.venue)&&_svSaved.push("match details");(_mr.ourScore!=null||_mr.oppScore!=null)&&_svSaved.push("scores")}catch{}st("Team & round saved ("+f+")."+(_svSaved.length?" Saved: "+_svSaved.join(", ")+".":""),null,null,4500,{success:!0});try{Y.style.color="#15803d",Y.textContent="Saved "+f+"."+(_svSaved.length?" ("+_svSaved.join(", ")+")":""),setTimeout(function(){Y.textContent&&Y.textContent.indexOf("Saved "+f)===0&&(Y.textContent="")},4500)}catch{}',
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
console.log("app.min.js v147 patches applied");
