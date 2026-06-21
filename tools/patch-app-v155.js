/**
 * v155: Cloud config wins when newer; push local config on super-admin sign-in.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "track local config write time in A()",
    from: 'function A(){localStorage.setItem(i,JSON.stringify({teams:U.teams,votes:U.votes,coachVotes:U.coachVotes}))}',
    to: 'function A(){localStorage.setItem(i,JSON.stringify({teams:U.teams,votes:U.votes,coachVotes:U.coachVotes}));try{localStorage.setItem(i+"_local_w",String(Date.now()))}catch{}}',
    once: true,
  },
  {
    name: "SvCloudTs helper before qc",
    from: "function qc(c){c&&(c.version===2&&Array.isArray(c.teams)&&c.teams.length?((function(_p){U.teams=Ye(),c.teams.forEach(function(l,h){h>=r||(U.teams[h]=P({id:h+1,name:l.name||\"Team \"+(h+1),round:l.round||\"Round 1\",players:Array.isArray(l.players)?l.players.slice(0,y).filter(Boolean):[],matchesByRound:SvMergeMatchesByRound(_p[h]&&_p[h].matchesByRound,l.matchesByRound),",
    to: 'function SvCloudTs(c){try{if(!c||!c.updatedAt)return 0;if(typeof c.updatedAt.toMillis=="function")return c.updatedAt.toMillis();if(c.updatedAt.seconds)return c.updatedAt.seconds*1e3+Math.floor((c.updatedAt.nanoseconds||0)/1e6)}catch{}return 0}function qc(c){c&&(c.version===2&&Array.isArray(c.teams)&&c.teams.length?((function(_p){var _cts=SvCloudTs(c),_lw=0;try{_lw=parseInt(localStorage.getItem(i+"_local_w")||"0",10)||0}catch{}var _cloudWin=_cts>0&&_cts>=_lw;U.teams=Ye(),c.teams.forEach(function(l,h){h>=r||(U.teams[h]=P({id:h+1,name:l.name||"Team "+(h+1),round:l.round||"Round 1",players:Array.isArray(l.players)?l.players.slice(0,y).filter(Boolean):[],matchesByRound:_cloudWin?SvMergeMatchesByRound({},l.matchesByRound||{}):SvMergeMatchesByRound(_p[h]&&_p[h].matchesByRound,l.matchesByRound),',
    once: true,
  },
  {
    name: "vu clears pending local write after cloud push",
    from: 'async function vu(){ye&&he&&me.currentUser?await yp(Qn(he,"config","main"),{version:2,teams:U.teams,updatedAt:lp()},{merge:!0}):ye||A()}',
    to: 'async function vu(){if(ye&&he&&me.currentUser){await yp(Qn(he,"config","main"),{version:2,teams:U.teams,updatedAt:lp()},{merge:!0});try{localStorage.removeItem(i+"_local_w")}catch{}}else ye||A()}',
    once: true,
  },
  {
    name: "push config to cloud on super-admin sign-in",
    from:
      'try{W&&(!W.textContent||W.textContent.indexOf("Lineup saved")===-1)&&(W.style.color="#15803d",W.textContent="Signed in as "+String(f.email||"")+".")}catch{}Xr(),Mp()}',
    to:
      'try{W&&(!W.textContent||W.textContent.indexOf("Lineup saved")===-1)&&(W.style.color="#15803d",W.textContent="Signed in as "+String(f.email||"")+".")}catch{}try{await vu();W&&(W.style.color="#15803d",W.textContent="Signed in — config synced to cloud for all devices.")}catch(e){console.error("[sync-on-signin]",e);try{W&&(W.style.color="#a16207",W.textContent="Signed in — cloud sync failed. Try Save team & round again.")}catch{}}Xr(),Mp()}',
    once: true,
  },
  {
    name: "debounced config listener always refreshes UI",
    from:
      'Uc=Lc(Qn(he,"config","main"),function(f){h=f.data(),!l&&(l=setTimeout(function(){l=0;var _=h;h=null,qc(_),Yn=!0,Dt=new Date,ru(),Oo();try{Ea(ne,rt())}catch{}try{Wp(ne)}catch{}yt&&(yt.value=String(ne)),Ps(),Ns(ne),ou(ne);try{Ds(ne)}catch{}lu();try{document.body.classList.remove("booting")}catch{}},60),ke()&&(su(),iu(),Ki(),$i(),Op(),Ds(ue),Pt(),ht()),bt(le.teamId,le.slot)&&(Ba(),Ds(le.teamId),Vs()))},function(f){',
    to:
      'Uc=Lc(Qn(he,"config","main"),function(f){h=f.data(),l&&clearTimeout(l),l=setTimeout(function(){l=0;var _=h;h=null;if(!_)return;qc(_),Yn=!0,Dt=new Date,ru(),Oo();try{Ea(ne,rt())}catch{}try{Wp(ne)}catch{}yt&&(yt.value=String(ne)),Ps(),Ns(ne),ou(ne);try{Ds(ne)}catch{}lu();try{document.body.classList.remove("booting")}catch{}},60),ke()&&(su(),iu(),Ki(),$i(),Op(),Ds(ue),Pt(),ht()),bt(le.teamId,le.slot)&&(Ba(),Ds(le.teamId),Vs())},function(f){',
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
console.log("app.min.js v155 patches applied");
