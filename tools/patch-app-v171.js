/**
 * v171: Block duplicate picks on submit; hide ballot picks in admin fallback panel.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "validate ballot picks before submit",
    from: "ge.length===3){var l=mu(ge),h=ie(ne),m=Gi(h),f=Zp(c),_=Zp(m);try{var _svCs=",
    to: 'ge.length===3){var l=mu(ge);try{if(typeof window.__svValidateBallotPicks=="function"){var _svVp=window.__svValidateBallotPicks(l);if(_svVp){Kt.textContent=_svVp,Kt.style.color="#b91c1c";return}}}catch(_svVe){console.warn("[validate-picks]",_svVe)}var h=ie(ne),m=Gi(h),f=Zp(c),_=Zp(m);try{var _svCs=',
    once: true,
  },
  {
    name: "hide picks in jI admin ballots fallback",
    from: "var b=Bp(_.submittedAt),C=(_.picks||[]).map(we).join(\" · \");f+=\"<div style='border:1px solid var(--border); border-radius:10px; padding:0.6rem 0.7rem; background:#fff'><div style='display:flex; justify-content:space-between; gap:0.6rem; align-items:baseline'><div style='font-weight:700; font-size:0.92rem'>Ballot \"+(E+1)+\"</div><button type='button' class='ghost' data-del-vote='\"+we(_.id||\"\")+\"' style='padding:0.35rem 0.65rem; border-color: var(--border); color:#991b1b'>Remove</button></div><div style='margin-top:0.25rem; font-size:0.85rem; color:#52525b'>\"+we(b)+\"</div><div style='margin-top:0.35rem; font-size:0.9rem'>\"+C+\"</div></div>\"",
    to: "var b=Bp(_.submittedAt),C=we(_.voterName||\"Unknown\");f+=\"<div style='border:1px solid var(--border); border-radius:10px; padding:0.6rem 0.7rem; background:#fff'><div style='display:flex; justify-content:space-between; gap:0.6rem; align-items:baseline'><div style='font-weight:700; font-size:0.92rem'>\"+C+\"</div><button type='button' class='ghost' data-del-vote='\"+we(_.id||\"\")+\"' style='padding:0.35rem 0.65rem; border-color: var(--border); color:#991b1b'>Remove</button></div><div style='margin-top:0.25rem; font-size:0.85rem; color:#52525b'>\"+we(b)+\"</div><div style='margin-top:0.35rem; font-size:0.82rem; color:#71717a; font-style:italic'>Vote picks are private.</div></div>\"",
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
console.log("app.min.js v171 patches applied");
