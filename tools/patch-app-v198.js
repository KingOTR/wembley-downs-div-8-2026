/**
 * v198: Over-rounds trend uses Uo() per round (dedupe + svCanon) so cumulative
 * season lines match per-round Results table totals.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const old$p =
  "function $p(c,l,h,m){var f={};if(!l||!l.length||!h||!h.length)return f;var _={};h.forEach(function(b,C){_[b]=C}),l.forEach(function(b){for(var C=new Array(h.length),L=0;L<C.length;L++)C[L]=0;f[b]=C});var E=[3,2,1];return m.forEach(function(b){if(!(!b||b.teamId!==c)){var C=b.round||\"Round 1\",L=_[C];if(L!=null)for(var B=b.picks||[],x=0;x<B.length&&x<3;x++){var q=B[x];if(q){var K=f[q];K&&(K[L]+=E[x]||0)}}}}),l.forEach(function(b){var C=f[b];if(!(!C||!C.length))for(var L=0,B=0;B<C.length;B++)L+=C[B],C[B]=L}),l.forEach(function(b){var C=f[b];if(!(!C||!C.length))for(var L=1;L<C.length;L++)C[L]<C[L-1]&&(C[L]=C[L-1])}),f}";

const new$p =
  'function $p(c,l,h,m,_coach){var f={};if(!l||!l.length||!h||!h.length)return f;l.forEach(function(b){for(var C=new Array(h.length),L=0;L<C.length;L++)C[L]=0;f[b]=C});h.forEach(function(roundLabel,roundIdx){var tally=Uo(c,roundLabel,m,_coach);tally.forEach(function(row){var arr=f[row.name];if(arr)arr[roundIdx]=row.pts})});l.forEach(function(b){var C=f[b];if(!C||!C.length)return;for(var L=0,B=0;B<C.length;B++)L+=C[B],C[B]=L});return f}';

const patches = [
  {
    name: "$p() trend cumulative via Uo() per round",
    from: old$p,
    to: new$p,
  },
  {
    name: "coach trend passes _coach to $p()",
    from: "pe=$p(c,oe,ee,U.coachVotes);",
    to: "pe=$p(c,oe,ee,U.coachVotes,!0);",
  },
];

function replaceOnce(str, from, to) {
  const i = str.indexOf(from);
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
  const next = replaceOnce(s, p.from, p.to);
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
console.log("app.min.js v198 patches applied");
