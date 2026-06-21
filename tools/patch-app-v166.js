/**
 * v166: Public round visibility — voters only see rounds up to publishedRound.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "round filter helpers + Gh filter",
    from: 'function Gh(c){var l={},h=c&&c.round?c.round:"Round 1";l[N(h)||"Round 1"]=!0;try{var m=rt(),f=c&&c.id!=null?String(c.id):null,_=f&&m&&m.roundByTeam?m.roundByTeam[f]:null;_&&(l[N(_)]=!0)}catch{}return c&&c.matchesByRound&&Object.keys(c.matchesByRound).forEach(function(E){l[N(E)||String(E)]=!0}),(U.votes||[]).forEach(function(E){if(!(!E||T(E.teamId)!==T(c&&c.id))){var b=We(E)||"Round 1";l[b]=!0}}),Object.keys(l).sort(function(E,b){var C=Ct(E),L=Ct(b);return C!==L?C-L:String(E).localeCompare(String(b))})}',
    to: 'function SvRoundNum(l){var h=String(l||"").trim(),m=h.match(/^round\\s*(\\d+(?:\\.\\d+)?)$/i);if(m)return parseFloat(m[1]);m=h.match(/^(\\d+(?:\\.\\d+)?)$/);return m?parseFloat(m[1]):null}function SvFilterPublicRounds(c,l){var h=N(c&&c.publishedRound||c&&c.round||"Round 1"),m=SvRoundNum(h),f=c&&c.showPastRoundsToVoters!==!1,_=(l||[]).slice();if(!_.length)return _;if(m==null){if(!f)return _.filter(function(E){return N(E)===h});var E=_.map(N).indexOf(h);return E>=0?_.slice(0,E+1):_}return _.filter(function(E){var b=SvRoundNum(E);if(b!=null)return f?b<=m:b===m;var C=_.map(N),L=C.indexOf(h);return L<0?N(E)===h:f?C.indexOf(N(E))<=L:N(E)===h})}function Gh(c){var l={},h=c&&c.round?c.round:"Round 1";l[N(h)||"Round 1"]=!0;try{var m=rt(),f=c&&c.id!=null?String(c.id):null,_=f&&m&&m.roundByTeam?m.roundByTeam[f]:null;_&&(l[N(_)]=!0)}catch{}return c&&c.matchesByRound&&Object.keys(c.matchesByRound).forEach(function(E){l[N(E)||String(E)]=!0}),(U.votes||[]).forEach(function(E){if(!(!E||T(E.teamId)!==T(c&&c.id))){var b=We(E)||"Round 1";l[b]=!0}}),SvFilterPublicRounds(c,Object.keys(l).sort(function(E,b){var C=Ct(E),L=Ct(b);return C!==L?C-L:String(E).localeCompare(String(b))}))}',
    once: true,
  },
  {
    name: "wire publishedRound admin elements in tE",
    from: 'hn=document.getElementById("roundInput"),ds=document.getElementById("matchDateInput")',
    to: 'hn=document.getElementById("roundInput"),SvPubRoundEl=document.getElementById("publishedRoundInput"),SvShowPastRoundsEl=document.getElementById("showPastRoundsInput"),ds=document.getElementById("matchDateInput")',
    once: true,
  },
  {
    name: "load publishedRound into admin form",
    from: 'hn.value=c.round||"",cu(),Op(),MI(),',
    to: 'hn.value=c.round||"",SvPubRoundEl&&(SvPubRoundEl.value=c.publishedRound||c.round||""),SvShowPastRoundsEl&&(SvShowPastRoundsEl.checked=c.showPastRoundsToVoters!==!1),cu(),Op(),MI(),',
    once: true,
  },
  {
    name: "save publishedRound on Save team & round",
    from: '_tm.round=hn&&hn.value?hn.value.trim():"Round 1",(!_tm.matchesByRound||typeof _tm.matchesByRound!="object")&&(_tm.matchesByRound={})',
    to: '_tm.round=hn&&hn.value?hn.value.trim():"Round 1",_tm.publishedRound=SvPubRoundEl&&SvPubRoundEl.value?SvPubRoundEl.value.trim():"",_tm.showPastRoundsToVoters=!(SvShowPastRoundsEl&&!SvShowPastRoundsEl.checked),(!_tm.matchesByRound||typeof _tm.matchesByRound!="object")&&(_tm.matchesByRound={})',
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
console.log("app.min.js v166 patches applied");
