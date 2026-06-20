/**
 * v140 patches for app.min.js:
 * - Fix gs/bs DOM ref collision (suburb/kickoff wiped by coach/lineup refs)
 * - Merge match save, persist lat/lng
 * - Goal-scorer ball in vote player list
 * - Trend graph readability
 * - Squad badges on team save
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "chunk import tag v140",
    from: 'import("./chunk-HQEVIJDY.js?tag=v139")',
    to: 'import("./chunk-HQEVIJDY.js?tag=v140")',
  },
  {
    name: "rename suburb ref Sb (avoid gs collision)",
    from: 'ds=document.getElementById("matchDateInput"),gs=document.getElementById("matchSuburbInput"),bs=document.getElementById("matchKickoffInput")',
    to: 'ds=document.getElementById("matchDateInput"),Sb=document.getElementById("matchSuburbInput"),Kf=document.getElementById("matchKickoffInput")',
    once: true,
  },
  {
    name: "lat/lng dom refs",
    from: 'vs=document.getElementById("matchPitchInput"),fs=document.getElementById("matchVenueInput")',
    to: 'vs=document.getElementById("matchPitchInput"),La=document.getElementById("matchLatInput"),Lg=document.getElementById("matchLngInput"),fs=document.getElementById("matchVenueInput")',
    once: true,
  },
  {
    name: "Op load suburb/kickoff/lat",
    from: 'ds&&(ds.value=h.date||""),gs&&(gs.value=h.suburb||""),bs&&(bs.value=h.kickoff||""),ys&&(ys.value=h.groundName||""),vs&&(vs.value=h.pitchNumber||"")',
    to: 'ds&&(ds.value=h.date||""),Sb&&(Sb.value=h.suburb||""),Kf&&(Kf.value=h.kickoff||""),ys&&(ys.value=h.groundName||""),vs&&(vs.value=h.pitchNumber||""),La&&(La.value=h.lat!=null?String(h.lat):""),Lg&&(Lg.value=h.lng!=null?String(h.lng):"")',
  },
  {
    name: "XI merge match save + lat/lng",
    from: 'Cs=l,c.matchesByRound[l]={date:ds?ds.value:"",suburb:gs?gs.value.trim():"",kickoff:bs?bs.value:"",groundName:ys?ys.value.trim():"",pitchNumber:vs?vs.value.trim():"",venue:fs?fs.value.trim():"",opponent:ms?ms.value.trim():"",ourScore:Ti&&Ti.value!==""?parseInt(Ti.value,10):null,oppScore:Bn&&Bn.value!==""?parseInt(Bn.value,10):null,scorers:kp(bn?bn.value:""),oppScorers:kp(wi?wi.value:""),lineup:F?JSON.parse(JSON.stringify(F)):h&&h.lineup?h.lineup:null,review:dn?dn.value.trim():""}',
    to: 'Cs=l,c.matchesByRound[l]=Object.assign({},h||{},{date:ds?ds.value:"",suburb:Sb?Sb.value.trim():"",kickoff:Kf?Kf.value:"",groundName:ys?ys.value.trim():"",pitchNumber:vs?vs.value.trim():"",venue:fs?fs.value.trim():"",opponent:ms?ms.value.trim():"",ourScore:Ti&&Ti.value!==""?parseInt(Ti.value,10):null,oppScore:Bn&&Bn.value!==""?parseInt(Bn.value,10):null,scorers:kp(bn?bn.value:""),oppScorers:kp(wi?wi.value:""),lineup:F?JSON.parse(JSON.stringify(F)):h&&h.lineup?h.lineup:null,review:dn?dn.value.trim():"",lat:La&&La.value!==""?parseFloat(La.value):h&&h.lat!=null?h.lat:null,lng:Lg&&Lg.value!==""?parseFloat(Lg.value):h&&h.lng!=null?h.lng:null})',
  },
  {
    name: "scorer ball in player list",
    from: 'var oe=document.createElement("span");oe.textContent=L;var ee=document.createElement("span");ee.className="rank-badge"',
    to: 'var oe=document.createElement("span");oe.textContent=L;var _sc=false;try{var _t=ie(ne),_r=Gi(_t),_m=Va(_t,_r);if(_m&&_m.scorers){var _cn=window.__svCanonicalPlayerName||function(n){return n};_sc=(_m.scorers||[]).some(function(s){return _cn(s)===_cn(L)})}}catch{}if(_sc){var _ib=document.createElement("span");_ib.className="scorer-ball";_ib.textContent="⚽";_ib.setAttribute("aria-label","Goal scorer");q.appendChild(_ib)}var ee=document.createElement("span");ee.className="rank-badge"',
  },
  {
    name: "trend graph thicker lines + brand colors",
    from: 'function Kp(c){var l=["#b91c1c","#0f766e","#1d4ed8","#7c3aed","#c2410c","#047857","#0ea5e9","#a21caf","#334155","#16a34a","#dc2626","#2563eb","#f59e0b","#14b8a6","#9333ea"];return l[c%l.length]}',
    to: 'function Kp(c){var l=["#EE2B33","#0f766e","#1d4ed8","#7c3aed","#c2410c","#047857","#0ea5e9","#a21caf","#334155","#16a34a","#dc2626","#2563eb","#f59e0b","#14b8a6","#9333ea"];return l[c%l.length]}',
  },
  {
    name: "trend graph line width",
    from: 'var dt=Kp(Le);f.strokeStyle=dt,f.lineWidth=2,f.beginPath(),ve.forEach(function(_e,te){',
    to: 'var dt=Kp(Le);f.strokeStyle=dt,f.lineWidth=3,f.beginPath(),ve.forEach(function(_e,te){',
  },
  {
    name: "trend graph point radius",
    from: 'f.beginPath(),f.arc(ae,Pe,3,0,Math.PI*2),f.fill(),It.push({player:Ee,round:h[te],pts:_e,x:ae,y:Pe,r:6})',
    to: 'f.beginPath(),f.arc(ae,Pe,4.5,0,Math.PI*2),f.fill(),It.push({player:Ee,round:h[te],pts:_e,x:ae,y:Pe,r:8})',
  },
  {
    name: "trend graph axis labels",
    from: 'f.fillStyle="#52525b",f.font="12px Segoe UI, system-ui, -apple-system, sans-serif";for(var xe=0;xe<=pe;xe++)',
    to: 'f.fillStyle="#52525b",f.font="600 11px Segoe UI, system-ui, -apple-system, sans-serif";for(var xe=0;xe<=pe;xe++)',
  },
  {
    name: "trend round labels font",
    from: 'f.fillText(nt,Math.max(C,an-14),B+K+20)}var It=[];',
    to: 'f.font="700 10px Segoe UI, system-ui, -apple-system, sans-serif";f.fillText(nt,Math.max(C,an-18),B+K+22)}var It=[];',
  },
  {
    name: "save squad badges on team",
    from: 'async function ZI(){Y.textContent="";var c=Mh(fn.value),l=ie(ue);l.players=c;',
    to: 'async function ZI(){Y.textContent="";var c=Mh(fn.value),l=ie(ue);l.players=c;try{var _sb=window.__svGetSquadBadges&&window.__svGetSquadBadges();if(_sb)l.squadBadges=_sb}catch{}',
  },
  {
    name: "load squad badges on team select",
    from: 'xa||(fn.value=(c.players||[]).join(`\n`)),mn&&(mn.value="")',
    to: 'xa||(fn.value=(c.players||[]).join(`\n`)),function(){try{window.__svSetSquadBadges&&window.__svSetSquadBadges(c.squadBadges||{})}catch{}}(),mn&&(mn.value="")',
  },
  {
    name: "remove lineup badge load",
    from: 'ka&&(ka.value=m?String(m.name||""):""),Na&&(Na.value=m?String(m.number||""):""),Ba&&(Ba.value=m&&m.badge?String(m.badge):""),Da&&(Da.disabled=!m)',
    to: 'ka&&(ka.value=m?String(m.name||""):""),Na&&(Na.value=m?String(m.number||""):""),Da&&(Da.disabled=!m)',
  },
  {
    name: "remove lineup badge save",
    from: 'm&&(h.name=m),h.number=f||"",h.badge=Ba?String(Ba.value||"").trim().toUpperCase():"",gn("starter"),Qt()',
    to: 'm&&(h.name=m),h.number=f||"",gn("starter"),Qt()',
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
    console.error("MISSING patch target:", p.name);
    failed = true;
    return;
  }
  if (p.to && s.includes(p.to) && p.from !== p.to) {
    console.log("SKIP (already applied):", p.name);
    return;
  }
  if (p.once) {
    var next = replaceOnce(s, p.from, p.to);
    if (next == null) {
      console.error("replaceOnce failed:", p.name);
      failed = true;
      return;
    }
    s = next;
  } else {
    s = s.replace(p.from, p.to);
  }
  console.log("OK:", p.name);
});

if (failed) process.exit(1);
fs.writeFileSync(appPath, s);
console.log("app.min.js v140 patches applied");
