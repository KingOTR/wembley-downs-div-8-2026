/**
 * v194: vote breakdown (3/2/1) in Uo(), results tables, deduped stats/export.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "svBrk() format 3/2/1 breakdown",
    from: "function Uo(c,l,h,_coach){var m={},_h=h;",
    to:
      'function svBrk(r){if(!r)return"—";var p=[];if(r.n3)p.push(r.n3+"×3");if(r.n2)p.push(r.n2+"×2");if(r.n1)p.push(r.n1+"×1");return p.length?p.join(", "):"—"}function Uo(c,l,h,_coach){var m={},_h=h;',
    once: true,
  },
  {
    name: "Uo() track n3/n2/n1 per player",
    from: '_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}});var _rows=Object.entries(m).sort(function(f,_){return _[1]-f[1]||f[0].localeCompare(_[0])}).map(function(f){return{name:f[0],pts:f[1]}});',
    to:
      '_.forEach(function(b,C){if(!b)return;var P=svCanon(b);if(!m[P])m[P]={pts:0,n3:0,n2:0,n1:0};m[P].pts+=(E[C]||0);if(C===0)m[P].n3++;else if(C===1)m[P].n2++;else m[P].n1++})}});var _rows=Object.entries(m).sort(function(f,_){return _[1].pts-f[1].pts||f[0].localeCompare(_[0])}).map(function(f){return{name:f[0],pts:f[1].pts,n3:f[1].n3,n2:f[1].n2,n1:f[1].n1}});',
    once: true,
  },
  {
    name: "Uo() zero-pt squad rows include breakdown fields",
    from: '_rows.forEach(function(r){_seen[svCanon(r.name)]=!0});_pls.forEach(function(p){var _n=svCanon(p);if(_n&&!_seen[_n]){_rows.push({name:_n,pts:0});_seen[_n]=!0}});',
    to:
      '_rows.forEach(function(r){_seen[svCanon(r.name)]=!0});_pls.forEach(function(p){var _n=svCanon(p);if(_n&&!_seen[_n]){_rows.push({name:_n,pts:0,n3:0,n2:0,n1:0});_seen[_n]=!0}});',
    once: true,
  },
  {
    name: "player results table shows breakdown column",
    from: 'var C="<table class=\'results\'><thead><tr><th>Player</th><th>Points</th></tr></thead><tbody>";b.forEach(function(ee){C+="<tr><td>"+we(ee.name)+"</td><td>"+ee.pts+"</td></tr>"})',
    to:
      'var C="<table class=\'results\'><thead><tr><th>Player</th><th>Pts</th><th>Breakdown</th></tr></thead><tbody>";b.forEach(function(ee){C+="<tr><td>"+we(ee.name)+"</td><td><strong>"+ee.pts+"</strong></td><td style=\'font-size:0.82rem;color:#52525b\' title=\'"+svBrk(ee)+"\'>"+svBrk(ee)+"</td></tr>"})',
    once: true,
  },
  {
    name: "coach results table shows breakdown column",
    from: 'var x="<table class=\'results\'><thead><tr><th>Player</th><th>Points</th></tr></thead><tbody>";B.forEach(function(Ne){x+="<tr><td>"+we(Ne.name)+"</td><td>"+Ne.pts+"</td></tr>"})',
    to:
      'var x="<table class=\'results\'><thead><tr><th>Player</th><th>Pts</th><th>Breakdown</th></tr></thead><tbody>";B.forEach(function(Ne){x+="<tr><td>"+we(Ne.name)+"</td><td><strong>"+Ne.pts+"</strong></td><td style=\'font-size:0.82rem;color:#52525b\' title=\'"+svBrk(Ne)+"\'>"+svBrk(Ne)+"</td></tr>"})',
    once: true,
  },
  {
    name: "GI() stats tally uses dedupe hook",
    from: "function GI(c,l,h){var m={};return(h||[]).forEach(function(f){if(f&&T(f.teamId)===T(c)&&We(f)===l){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}}),m}",
    to:
      'function GI(c,l,h){var m={},_h=h||[];l=We({round:l});try{typeof window.__svDedupeVotesForTally=="function"&&(_svG=window.__svDedupeVotesForTally(c,l,h),_h=Array.isArray(_svG)?_svG:h)}catch(e){console.warn("[dedupe-stats]",e)}_h.forEach(function(f){if(f&&T(f.teamId)===T(c)&&We(f)===l){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}});return m}',
    once: true,
  },
  {
    name: "season CSV export uses Uo() deduped tally",
    from: "m.forEach(function(b){var C={};h.forEach(function(B){C[B]=0}),U.votes.forEach(function(B){if(B.teamId===c&&We(B)===We({round:b})){var x=B.picks||[];x.forEach(function(q,K){var P=svCanon(q);C[P]!=null&&(C[P]+=[3,2,1][K]||0)})}});var L=[b].concat(h.map(function(B){return C[B]||0}));_.push(L.map(ur).join(\",\"))});",
    to:
      'm.forEach(function(b){var C={};h.forEach(function(B){C[B]=0});var _tally=Uo(c,b,U.votes);_tally.forEach(function(row){if(C[row.name]!=null)C[row.name]=row.pts});var L=[b].concat(h.map(function(B){return C[B]||0}));_.push(L.map(ur).join(","))});',
    once: true,
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
console.log("app.min.js v194 patches applied");
