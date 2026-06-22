/**
 * v186: coach ballot delete UI hook; remove coach vote from in-memory app state.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "ht() delegate coach ballot list to __svRenderCoachBallots",
    from: 'if(!L.length)Oi.innerHTML=\'<p class="empty-state" style="margin:0">No ballot history for this round.</p>\';else{var xe="";L.forEach(function(Ne){var tt=Ne.picks||[],$e=tt.map(function(Ae,kt){return kt+1+". "+we(Ae)+" ("+[3,2,1][kt]+" pts)"}).join(" · "),De=Qr(l,Ne.slot||1);xe+=\'<p style="margin:0.35rem 0;font-size:0.9rem">\'+we(De)+" · "+we(Ne.submittedAt||"Submitted")+": "+$e+"</p>"}),Oi.innerHTML=xe||""}Qp()}}function we(c){return String(c).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Xp(c){try',
    to: 'try{typeof window.__svRenderCoachBallots=="function"&&window.__svRenderCoachBallots(c,C,{rawVotes:L,showLoading:false})}catch(_svCbe){console.warn("[coach-ballots]",_svCbe)}Qp()}}function we(c){return String(c).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Xp(c){try',
    once: true,
  },
  {
    name: "expose __svRemoveCoachVoteById",
    from: "};function N(c){var l=String(c??\"\").trim();if(!l)return\"\";l=l.replace(/\\s+/g,\" \").trim();var h=l.match(/^round\\s*(\\d+(?:\\.\\d+)?)$/i);",
    to: '};window.__svRemoveCoachVoteById=function(id){if(!id)return;U.coachVotes=(U.coachVotes||[]).filter(function(v){return!v||v.id!==id});try{A()}catch(e){}try{ht()}catch(e){}};function N(c){var l=String(c??"").trim();if(!l)return"";l=l.replace(/\\s+/g," ").trim();var h=l.match(/^round\\s*(\\d+(?:\\.\\d+)?)$/i);',
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
    if (p.to && s.includes(p.to.slice(0, Math.min(100, p.to.length))) && p.from !== p.to) {
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
console.log("app.min.js v186 patches applied");
