/**
 * v169: Date-based round default (Perth, Sunday rule), expose team squad for dedupe.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const roundHelpers =
  'function SvPerthTodayYmd(){try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Perth",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}catch{return""}}function SvMatchGameYmd(m){if(!m)return"";var k=m.kickoff||"";if(k&&String(k).length>=10)return String(k).slice(0,10);return m.date?String(m.date).slice(0,10):""}function SvRoundByDate(c,l){var rounds=(l||[]).slice().sort(function(a,b){var na=Ct(a),nb=Ct(b);return na!==nb?na-nb:String(a).localeCompare(String(b))});if(!rounds.length)return c&&c.round||"Round 1";var mbr=c&&c.matchesByRound||{},today=SvPerthTodayYmd(),nextIdx=-1,i;for(i=0;i<rounds.length;i++){var gd=SvMatchGameYmd(mbr[rounds[i]]);if(gd&&today&&gd>=today){nextIdx=i;break}}if(nextIdx<0)return rounds[rounds.length-1];var nextRound=rounds[nextIdx],nextGd=SvMatchGameYmd(mbr[nextRound]);if(!nextGd||!today)return nextIdx>0?rounds[nextIdx-1]:nextRound;if(today<nextGd)return nextIdx>0?rounds[nextIdx-1]:nextRound;return nextRound}function SvDefaultRound(c,l){var d=SvRoundByDate(c,l||[]);if(d)return d;return Yr(l||[],c&&c.round||"Round 1")}';

const patches = [
  {
    name: "round-by-date helpers before SvLatestResultRound",
    from: "function SvLatestResultRound(c){",
    to: roundHelpers + "function SvLatestResultRound(c){",
    once: true,
  },
  {
    name: "admin match round default uses date rule",
    from:
      'function cu(){if(Sn){var c=ie(ne||ue),l=Vp(c),h=Cs;if(!h){h=SvLatestResultRound(c);if(!h&&l&&l.length)h=l.slice().sort(function(m,f){var _=Ct(m),E=Ct(f);return _!==E?E-_:String(f).localeCompare(String(m))})[0];if(!h)h=c.round||"Round 1"}xs(Sn,l,h),Cs=Sn.value||h}}',
    to:
      'function cu(){if(Sn){var c=ie(ne||ue),l=Vp(c),h=Cs;if(!h){h=SvDefaultRound(c,l);if(!h&&l&&l.length)h=l.slice().sort(function(m,f){var _=Ct(m),E=Ct(f);return _!==E?E-_:String(f).localeCompare(String(m))})[0];if(!h)h=c.round||"Round 1"}xs(Sn,l,h),Cs=Sn.value||h}}',
    once: true,
  },
  {
    name: "public round Wp uses date rule",
    from: "function Wp(c){try{if(!Ze)return;var l=ie(c||ne),h=Gh(l),m=qI(h);if(!m)return;",
    to: "function Wp(c){try{if(!Ze)return;var l=ie(c||ne),h=Gh(l),m=SvDefaultRound(l,h);if(!m)return;",
    once: true,
  },
  {
    name: "public round Oo uses date rule",
    from: 'function Oo(){if(Ze){var c=ie(ne),l=Gh(c),h=Yr(l,c&&c.round||"Round 1"),m=Ze.value,f=h;',
    to: 'function Oo(){if(Ze){var c=ie(ne),l=Gh(c),h=SvDefaultRound(c,l),m=Ze.value,f=h;',
    once: true,
  },
  {
    name: "results Gp uses date rule",
    from: 'function Gp(c){var l=c??ue,h=ie(l),m=Fa(l,U.votes,h.round||"Round 1"),f=Yr(m,h.round||"Round 1"),_=An?String(An.value||""):"";',
    to: 'function Gp(c){var l=c??ue,h=ie(l),m=Fa(l,U.votes,h.round||"Round 1"),f=SvDefaultRound(h,m),_=An?String(An.value||""):"";',
    once: true,
  },
  {
    name: "Pt inline default round uses date rule",
    from: 'function Pt(){if(!(!At||!Pi||!jr)){var c=parseInt(At.value,10)||1,l=ie(c),h=Fa(c,U.votes,l.round||"Round 1"),m=Yr(h,l.round||"Round 1"),f=An?String(An.value||""):"";',
    to: 'function Pt(){if(!(!At||!Pi||!jr)){var c=parseInt(At.value,10)||1,l=ie(c),h=Fa(c,U.votes,l.round||"Round 1"),m=SvDefaultRound(l,h),f=An?String(An.value||""):"";',
    once: true,
  },
  {
    name: "coach vote round MI uses date rule",
    from: "function MI(){try{if(!ke())return;var c=ue,l=ie(c),h=Xh(c),m=Yr(h,l&&l.round||\"Round 1\");",
    to: "function MI(){try{if(!ke())return;var c=ue,l=ie(c),h=Xh(c),m=SvDefaultRound(l,h);",
    once: true,
  },
  {
    name: "coach vote round BI uses date rule",
    from: "function BI(){try{if(!bt(le.teamId,le.slot))return;var c=le.teamId,l=ie(c),h=Xh(c),m=Yr(h,l&&l.round||\"Round 1\");",
    to: "function BI(){try{if(!bt(le.teamId,le.slot))return;var c=le.teamId,l=ie(c),h=Xh(c),m=SvDefaultRound(l,h);",
    once: true,
  },
  {
    name: "coach results FI uses date rule",
    from: 'function FI(c){var l=c??ue,h=ie(l),m=h.round||"Round 1",f=Fa(l,U.coachVotes,m),_=Yr(f,m),E=vt?String(vt.value||""):"";',
    to: 'function FI(c){var l=c??ue,h=ie(l),m=h.round||"Round 1",f=Fa(l,U.coachVotes,m),_=SvDefaultRound(h,f),E=vt?String(vt.value||""):"";',
    once: true,
  },
  {
    name: "expose SvDefaultRound and __svTeamPlayers",
    from:
      'try{typeof window!="undefined"&&(window.SvMergeMatchesByRound=SvMergeMatchesByRound,window.SvMergeMatchRound=SvMergeMatchRound,window.SvSnapshotTeams=SvSnapshotTeams,window.SvKickoffToInput=SvKickoffToInput,window.SvKickoffSave=SvKickoffSave,window.__svRefreshMatchForm=Op)}catch{}',
    to:
      'try{typeof window!="undefined"&&(window.SvMergeMatchesByRound=SvMergeMatchesByRound,window.SvMergeMatchRound=SvMergeMatchRound,window.SvSnapshotTeams=SvSnapshotTeams,window.SvKickoffToInput=SvKickoffToInput,window.SvKickoffSave=SvKickoffSave,window.__svRefreshMatchForm=Op,window.SvDefaultRound=SvDefaultRound,window.SvRoundByDate=SvRoundByDate,window.__svTeamPlayers=function(c){var l=ie(c);return l&&l.players?l.players.filter(Boolean):[]})}catch{}',
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
console.log("app.min.js v169 patches applied");
