/**
 * v172: Fix squad/lineup saves — local-first cloud merge, admin team id, save button binding.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "ng per-element _svBound binding (re-apply v152)",
    from:
      'function ng(){tg||!Ai&&!Ri&&!nr&&!fn||(tg=!0,fn&&fn.addEventListener("input",function(){try{xa=!0,Zc=Mh(fn.value)}catch{}}),Ai&&!Ai._svBound&&(Ai._svBound=!0,Ai.addEventListener("click",XI)),Ri&&!Ri._svBound&&(Ri._svBound=!0,Ri.addEventListener("click",ZI)),nr&&!nr._svBound&&(nr._svBound=!0,nr.addEventListener("click",eE)))}',
    to:
      'function ng(){try{fn&&!fn._svBound&&(fn._svBound=!0,fn.addEventListener("input",function(){try{xa=!0,Zc=Mh(fn.value)}catch{}})),Ai&&!Ai._svBound&&(Ai._svBound=!0,Ai.addEventListener("click",XI)),Ri&&!Ri._svBound&&(Ri._svBound=!0,Ri.addEventListener("click",ZI)),nr&&!nr._svBound&&(nr._svBound=!0,nr.addEventListener("click",eE))}catch{}}',
    once: true,
  },
  {
    name: "qc prefer local squad when local is newer",
    from:
      'players:Array.isArray(l.players)?l.players.slice(0,y).filter(Boolean):[],matchesByRound:_cloudWin?SvMergeMatchesByRound({},l.matchesByRound||{}):SvMergeMatchesByRound(_p[h]&&_p[h].matchesByRound,l.matchesByRound),squadBadges:l.squadBadges||(_p[h]&&_p[h].squadBadges),',
    to:
      'players:!_cloudWin&&_p[h]&&Array.isArray(_p[h].players)&&_p[h].players.length?_p[h].players.slice(0,y).filter(Boolean):Array.isArray(l.players)?l.players.slice(0,y).filter(Boolean):[],matchesByRound:_cloudWin?SvMergeMatchesByRound({},l.matchesByRound||{}):SvMergeMatchesByRound(_p[h]&&_p[h].matchesByRound,l.matchesByRound),squadBadges:!_cloudWin&&_p[h]&&_p[h].squadBadges?_p[h].squadBadges:l.squadBadges||(_p[h]&&_p[h].squadBadges),',
    once: true,
  },
  {
    name: "SvMergeMatchRound prefer local lineup",
    from: "if(b.lineup)o.lineup=b.lineup;return o}function SvMergeMatchesByRound",
    to: "if(a.lineup)o.lineup=a.lineup;else if(b.lineup)o.lineup=b.lineup;return o}function SvMergeMatchesByRound",
    once: true,
  },
  {
    name: "ZI squad save uses admin team ne",
    from: "async function ZI(){Y.textContent=\"\";var c=Mh(fn.value),l=ie(ue);l.players=c;",
    to: "async function ZI(){Y.textContent=\"\";var c=Mh(fn.value),l=ie(ne||ue);l.players=c;",
    once: true,
  },
  {
    name: "eE coach codes save uses admin team ne",
    from: "async function eE(){Y.textContent=\"\";var c=ie(ue),l=mn.value.trim()",
    to: "async function eE(){Y.textContent=\"\";var c=ie(ne||ue),l=mn.value.trim()",
    once: true,
  },
  {
    name: "Wh lineup persist uses admin team ne",
    from: "function Wh(){if(F){var c=ie(ue),l=Lo(c);",
    to: "function Wh(){if(F){var c=ie(ne||ue),l=Lo(c);",
    once: true,
  },
  {
    name: "Hi lineup load uses admin team ne",
    from: "function Hi(){if(!(!_t||!on||!Li||!Pn)){var c=ie(ue),l=Lo(c),",
    to: "function Hi(){if(!(!_t||!on||!Li||!Pn)){var c=ie(ne||ue),l=Lo(c),",
    once: true,
  },
  {
    name: "gn init lineup state and admin team for squad sync",
    from:
      'function gn(c){F&&(Xc&&clearTimeout(Xc),Xc=setTimeout(async function(){Xc=0;try{Wh()}catch{}try{Bo(ne)}catch{}try{if(ye&&he){try{if(ke()&&fn&&xa){var l=ue,h=ie(l),m=Bh(l);',
    to:
      'function gn(c){if(!F)try{Hi()}catch{}F&&(Xc&&clearTimeout(Xc),Xc=setTimeout(async function(){Xc=0;try{Wh()}catch{}try{Bo(ne)}catch{}try{if(ye&&he){try{if(ke()&&fn&&xa){var l=ne||ue,h=ie(l),m=Bh(l);',
    once: true,
  },
  {
    name: "expose __svRefreshLineupEditor",
    from:
      'window.__svTeamPlayers=function(c){var l=ie(c);return l&&l.players?l.players.filter(Boolean):[]})}catch{}',
    to:
      'window.__svTeamPlayers=function(c){var l=ie(c);return l&&l.players?l.players.filter(Boolean):[]},window.__svRefreshLineupEditor=Hi)}catch{}',
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
console.log("app.min.js v172 patches applied");
