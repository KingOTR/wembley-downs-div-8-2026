const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "qo hook",
    from: 'function qo(c){return String(c||"").trim().toLowerCase().replace(/\\s+/g," ")}',
    to: 'function qo(c){var n=window.__svNormalizeName;return n?n(c):String(c||"").trim().toLowerCase().replace(/\\s+/g," ")}',
  },
  {
    name: "svCanon + Uo",
    from: "function Uo(c,l,h){var m={};return h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){b&&(m[b]=(m[b]||0)+(E[C]||0))})}})",
    to: 'function svCanon(n){var c=window.__svCanonicalPlayerName;return c?c(n):n}function Uo(c,l,h){var m={};return h.forEach(function(f){if(!(T(f.teamId)!==T(c)||We(f)!==l)){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}})',
  },
  {
    name: "GI tally",
    from: "function GI(c,l,h){var m={};return(h||[]).forEach(function(f){if(f&&T(f.teamId)===T(c)&&We(f)===l){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){b&&(m[b]=(m[b]||0)+(E[C]||0))})}})",
    to: "function GI(c,l,h){var m={};return(h||[]).forEach(function(f){if(f&&T(f.teamId)===T(c)&&We(f)===l){var _=f.picks||[],E=[3,2,1];_.forEach(function(b,C){if(!b)return;var P=svCanon(b);m[P]=(m[P]||0)+(E[C]||0)})}})",
  },
  {
    name: "RA trend pick match",
    from: "C.forEach(function(L,B){L===l&&(_[b]+=f[B]||0)})",
    to: "C.forEach(function(L,B){(L===l||svCanon(L)===svCanon(l))&&(_[b]+=f[B]||0)})",
  },
  {
    name: "CSV season export picks",
    from: "x.forEach(function(q,K){C[q]!=null&&(C[q]+=[3,2,1][K]||0)})",
    to: "x.forEach(function(q,K){var P=svCanon(q);C[P]!=null&&(C[P]+=[3,2,1][K]||0)})",
  },
];

let failed = false;
patches.forEach(function (p) {
  if (!s.includes(p.from)) {
    console.error("MISSING patch target:", p.name);
    failed = true;
    return;
  }
  if (s.includes(p.to)) {
    console.log("SKIP (already applied):", p.name);
    return;
  }
  s = s.replace(p.from, p.to);
  console.log("OK:", p.name);
});

if (failed) process.exit(1);
fs.writeFileSync(appPath, s);
console.log("app.min.js alias patches applied");
