/**
 * v178: Merge local coach votes when cloud listener syncs; expose hydrate helper.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");
let s = fs.readFileSync(appPath, "utf8");

const patches = [
  {
    name: "Mp() merge cloud coach votes with local instead of replace",
    from:
      'mi=Lc($n(he,"coachVotes"),function(c){var l=c.docs.map(function(m){var f=m.data();return{id:m.id,teamId:f.teamId!=null?f.teamId:1,slot:f.slot!=null?f.slot:1,round:f.round,picks:f.picks||[],submittedAt:Bp(f.submittedAt)}}),h=U.coachVotes&&U.coachVotes.length;U.coachVotes=l,!h||!l.length?(_r&&(clearTimeout(_r),_r=0),ht()):vI()},function(c){console.error(c)}))',
    to:
      'mi=Lc($n(he,"coachVotes"),function(c){var l=c.docs.map(function(m){var f=m.data();return{id:m.id,teamId:f.teamId!=null?f.teamId:1,slot:f.slot!=null?f.slot:1,round:f.round,picks:f.picks||[],submittedAt:Bp(f.submittedAt)}}),h=U.coachVotes&&U.coachVotes.length,byId=Object.create(null);function mcv(v){if(!v||!v.id)return;byId[v.id]=v}(U.coachVotes||[]).forEach(mcv);l.forEach(mcv);try{var raw=localStorage.getItem(i);if(raw){var data=JSON.parse(raw);(data.coachVotes||[]).forEach(mcv)}}catch(e){}U.coachVotes=Object.keys(byId).map(function(k){return byId[k]}),!h||!U.coachVotes.length?(_r&&(clearTimeout(_r),_r=0),ht()):vI()},function(c){console.error(c)}))',
    once: true,
  },
  {
    name: "expose __svHydrateVotesFromLocal for recovery",
    from:
      'function A(){localStorage.setItem(i,JSON.stringify({teams:U.teams,votes:U.votes,coachVotes:U.coachVotes}));try{localStorage.setItem(i+"_local_w",String(Date.now()))}catch{}}function N(c){',
    to:
      'function A(){localStorage.setItem(i,JSON.stringify({teams:U.teams,votes:U.votes,coachVotes:U.coachVotes}));try{localStorage.setItem(i+"_local_w",String(Date.now()))}catch{}}window.__svHydrateVotesFromLocal=function(){try{var raw=localStorage.getItem(i);if(!raw)return{player:0,coach:0};var data=JSON.parse(raw),added=0,cadded=0,byId=Object.create(null);(U.votes||[]).forEach(function(v){if(v&&v.id)byId[v.id]=v});(data.votes||[]).forEach(function(v){if(v&&v.id&&!byId[v.id]){byId[v.id]=v;added++}});U.votes=Object.keys(byId).map(function(k){return byId[k]});var cby=Object.create(null);(U.coachVotes||[]).forEach(function(v){if(v&&v.id)cby[v.id]=v});(data.coachVotes||[]).forEach(function(v){if(v&&v.id&&!cby[v.id]){cby[v.id]=v;cadded++}});U.coachVotes=Object.keys(cby).map(function(k){return cby[k]});if(added||cadded)try{A()}catch(e){}return{player:added,coach:cadded}}catch(e){return{player:0,coach:0,error:String(e)}}};function N(c){',
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
console.log("app.min.js v178 patches applied");
