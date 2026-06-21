/**
 * v158: Route Chris/Will player-area votes to coachVotes; dedupe tally retained from v157.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "route coach names to coachVotes from player submit",
    from: 'if(ge.length===3){var l=mu(ge),h=ie(ne),m=Gi(h),f=Zp(c),_=Zp(m),E={teamId:ne,voterName:c,voterNameKey:f,round:m,picks:l,submittedAt:new Date().toISOString()};if(ye&&he)try{var b="t"+ne+"_r"+_+"_v"+f,C=Qn(he,"votes",b);await yp(C,E),Bi={kind:"teamVote",docId:b,at:Date.now()}}catch(pe){console.error(pe),Kt.textContent=Jn(pe,vp(pe)?fI:mI);return}',
    to: 'if(ge.length===3){var l=mu(ge),h=ie(ne),m=Gi(h),f=Zp(c),_=Zp(m);try{var _svCs=typeof window.__svResolveCoachSlot=="function"?window.__svResolveCoachSlot(c,ne):null;if(_svCs&&_svCs.slot&&typeof window.__svSubmitCoachVoteFromPlayerUI=="function"){await window.__svSubmitCoachVoteFromPlayerUI({voterName:c,teamId:ne,picks:l,round:m,slot:_svCs.slot,coachLabel:_svCs.label});ge=[],yn(),et.value="",Kt.textContent="Thanks — coach ballot recorded ("+String(_svCs.label||"")+", "+String(m)+").",KI(Ii),Kt.style.color="#15803d",Un&&clearTimeout(Un),Un=setTimeout(nu,1e4),st("Coach ballot saved.","Undo",Uh,1e4),setTimeout(function(){Kt.textContent="",Kt.style.color=""},3500);return}}catch(_svCe){console.warn("[coach-route]",_svCe)}var E={teamId:ne,voterName:c,voterNameKey:f,round:m,picks:l,submittedAt:new Date().toISOString()};if(ye&&he)try{var b="t"+ne+"_r"+_+"_v"+f,C=Qn(he,"votes",b);await yp(C,E),Bi={kind:"teamVote",docId:b,at:Date.now()}}catch(pe){console.error(pe),Kt.textContent=Jn(pe,vp(pe)?fI:mI);return}',
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
    if (p.to && s.includes(p.to.slice(0, 100)) && p.from !== p.to) {
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
console.log("app.min.js v158 patches applied");
