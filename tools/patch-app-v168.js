/**
 * v168: Goalscorer display names, manual-edit protection, latest-result round default.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "SvLatestResultRound helper",
    from: "function cu(){if(Sn){var c=ie(ue),l=Vp(c),h=Cs;h||(l&&l.length?h=l.slice().sort(function(m,f){var _=Ct(m),E=Ct(f);return _!==E?E-_:String(f).localeCompare(String(m))})[0]:h=c.round||\"Round 1\"),xs(Sn,l,h),Cs=Sn.value||h}}",
    to:
      'function SvLatestResultRound(c){var mbr=c&&c.matchesByRound||{},best=null,bestN=-1/0;Object.keys(mbr).forEach(function(k){var m=mbr[k];if(!m)return;var has=m.ourScore!=null||m.oppScore!=null;if(!has)return;var n=Ct(k);if(n>bestN){bestN=n;best=k}});return best}function cu(){if(Sn){var c=ie(ne||ue),l=Vp(c),h=Cs;if(!h){h=SvLatestResultRound(c);if(!h&&l&&l.length)h=l.slice().sort(function(m,f){var _=Ct(m),E=Ct(f);return _!==E?E-_:String(f).localeCompare(String(m))})[0];if(!h)h=c.round||"Round 1"}xs(Sn,l,h),Cs=Sn.value||h}}',
    once: true,
  },
  {
    name: "Op load round from adminMatchRoundSelect",
    from:
      "function Op(){try{SvWireMatchFieldRefs()}catch{}var c=ie(ne||ue),l=Lo(c),h=c.matchesByRound&&c.matchesByRound[l]?c.matchesByRound[l]:{}",
    to:
      'function Op(){try{SvWireMatchFieldRefs()}catch{}var c=ie(ne||ue),l=Sn&&Sn.value?N(Sn.value)||Sn.value:Lo(c),h=c.matchesByRound&&c.matchesByRound[l]?c.matchesByRound[l]:{}',
    once: true,
  },
  {
    name: "format goalscorers on public match card",
    from:
      'var Ne=xe(qe,"Our goalscorers",m.scorers||[],""),tt=xe(en,"Opposition goalscorers",m.oppScorers||[],"opp-scorers")',
    to:
      'var _svSc=m.scorers||[];try{var _svTm=ie(c),_svFmt=window.__svFormatGoalScorerList;if(_svFmt&&_svTm)_svSc=_svFmt(_svSc,_svTm.players||[])}catch{}var Ne=xe(qe,"Our goalscorers",_svSc,""),tt=xe(en,"Opposition goalscorers",m.oppScorers||[],"opp-scorers")',
    once: true,
  },
  {
    name: "preserve goalscorersManual on cloud merge",
    from:
      '["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review","ourScore","oppScore","scorers","oppScorers","opponent"]',
    to:
      '["kickoff","date","suburb","groundName","pitchNumber","venue","lat","lng","locationLabel","review","ourScore","oppScore","scorers","oppScorers","opponent","goalscorersManual"]',
    once: true,
  },
  {
    name: "XI save goalscorersManual flag",
    from:
      'lng:MlngEl&&MlngEl.value!==""?parseFloat(MlngEl.value):h&&h.lng!=null?h.lng:null,locationLabel:(function(){try{var _el=document.getElementById("matchLocationLabel");return _el&&_el.value?_el.value.trim():h&&h.locationLabel?h.locationLabel:""}catch{return""}})()})',
    to:
      'lng:MlngEl&&MlngEl.value!==""?parseFloat(MlngEl.value):h&&h.lng!=null?h.lng:null,goalscorersManual:(function(){var el=SvGetEl(bn,"matchScorersInput");return !!(el&&String(el.value||"").trim())})(),locationLabel:(function(){try{var _el=document.getElementById("matchLocationLabel");return _el&&_el.value?_el.value.trim():h&&h.locationLabel?h.locationLabel:""}catch{return""}})()})',
    once: true,
  },
  {
    name: "XI refresh match form after save",
    from:
      'try{A()}catch{}try{window.dispatchEvent(new CustomEvent("sv-match-saved",{detail:{teamId:ne||ue,round:l}}))}catch{}}async function ZI()',
    to:
      'try{A()}catch{}try{Op()}catch{}try{window.dispatchEvent(new CustomEvent("sv-match-saved",{detail:{teamId:ne||ue,round:l}}))}catch{}}async function ZI()',
    once: true,
  },
  {
    name: "expose __svRefreshMatchForm",
    from:
      "try{typeof window!=\"undefined\"&&(window.SvMergeMatchesByRound=SvMergeMatchesByRound,window.SvMergeMatchRound=SvMergeMatchRound,window.SvSnapshotTeams=SvSnapshotTeams,window.SvKickoffToInput=SvKickoffToInput,window.SvKickoffSave=SvKickoffSave)}catch{}",
    to:
      'try{typeof window!="undefined"&&(window.SvMergeMatchesByRound=SvMergeMatchesByRound,window.SvMergeMatchRound=SvMergeMatchRound,window.SvSnapshotTeams=SvSnapshotTeams,window.SvKickoffToInput=SvKickoffToInput,window.SvKickoffSave=SvKickoffSave,window.__svRefreshMatchForm=Op)}catch{}',
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
console.log("app.min.js v168 patches applied");
