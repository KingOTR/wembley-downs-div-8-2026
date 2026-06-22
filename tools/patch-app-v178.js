/**
 * v178: Fix Ds() dropping local votes without id; Fa() round list from local storage;
 * hydrate with synthetic doc ids; merge per-team vote cache.
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
      'function A(){localStorage.setItem(i,JSON.stringify({teams:U.teams,votes:U.votes,coachVotes:U.coachVotes}));try{localStorage.setItem(i+"_local_w",String(Date.now()))}catch{}}function svVid(v){if(!v)return null;if(v.id)return v.id;try{return typeof window.__svVoteDocIdForBallot=="function"?window.__svVoteDocIdForBallot(v):null}catch(e){return null}}window.__svHydrateVotesFromLocal=function(){try{var raw=localStorage.getItem(i);if(!raw)return{player:0,coach:0};var data=JSON.parse(raw),added=0,cadded=0,byId=Object.create(null);function hv(v){var id=svVid(v);if(!id||byId[id])return;byId[id]=Object.assign({},v,{id:id});added++}(U.votes||[]).forEach(function(v){var id=svVid(v);if(id)byId[id]=Object.assign({},v,{id:id})});(data.votes||[]).forEach(hv);try{for(var ti=1;ti<=4;ti++){var cr=localStorage.getItem(qh(ti));if(!cr)continue;var cdata=JSON.parse(cr);(cdata.votes||[]).forEach(hv)}}catch(e){}U.votes=Object.keys(byId).map(function(k){return byId[k]});var cby=Object.create(null);(U.coachVotes||[]).forEach(function(v){if(v&&v.id)cby[v.id]=v});(data.coachVotes||[]).forEach(function(v){if(v&&v.id&&!cby[v.id]){cby[v.id]=v;cadded++}});U.coachVotes=Object.keys(cby).map(function(k){return cby[k]});if(added||cadded)try{A()}catch(e){}return{player:added,coach:cadded}}catch(e){return{player:0,coach:0,error:String(e)}}};function N(c){',
    once: true,
  },
  {
    name: "Ds() mv() assign synthetic id + merge per-team cache",
    from:
      'function mv(v){if(!v||!v.id||T(v.teamId)!==T(l))return;byId[v.id]=v}(U.votes||[]).forEach(mv);B.forEach(mv);try{var raw=localStorage.getItem(i);if(raw){var data=JSON.parse(raw);(data.votes||[]).forEach(mv)}}catch(e){}U.votes=Object.keys(byId).map(function(k){return byId[k]}),jh(l),!x||!U.votes.length?(vr&&(clearTimeout(vr),vr=0),Pt(),bt(le.teamId,le.slot)&&Vs(),Vo()):yI()}',
    to:
      'function mv(v){if(!v||T(v.teamId)!==T(l))return;var id=v.id;if(!id){try{id=typeof window.__svVoteDocIdForBallot=="function"?window.__svVoteDocIdForBallot(v):null}catch(e){}if(!id)return}byId[id]=Object.assign({},v,{id:id})}(U.votes||[]).forEach(mv);B.forEach(mv);try{var raw=localStorage.getItem(i);if(raw){var data=JSON.parse(raw);(data.votes||[]).forEach(mv)}}catch(e){}try{var cr=localStorage.getItem(qh(l));if(cr){var cdata=JSON.parse(cr);(cdata.votes||[]).forEach(mv)}}catch(e){}U.votes=Object.keys(byId).map(function(k){return byId[k]}),jh(l),!x||!U.votes.length?(vr&&(clearTimeout(vr),vr=0),Pt(),bt(le.teamId,le.slot)&&Vs(),Vo()):yI()}',
    once: true,
  },
  {
    name: "Fa() include local vote rounds via __svExtraResultRounds",
    from:
      'function Fa(c,l,h){var m=Jh(c,l),f=h||"Round 1";return m.indexOf(f)===-1&&m.unshift(f),m}',
    to:
      'function Fa(c,l,h){var m=Jh(c,l);try{if(typeof window.__svExtraResultRounds=="function"){(window.__svExtraResultRounds(c)||[]).forEach(function(r){r&&m.indexOf(r)===-1&&m.push(r)})}}catch(e){}var f=h||"Round 1";return m.indexOf(f)===-1&&m.unshift(f),m}',
    once: true,
  },
  {
    name: "hydrate: synthetic doc ids + per-team cache (upgrade existing)",
    from:
      'window.__svHydrateVotesFromLocal=function(){try{var raw=localStorage.getItem(i);if(!raw)return{player:0,coach:0};var data=JSON.parse(raw),added=0,cadded=0,byId=Object.create(null);(U.votes||[]).forEach(function(v){if(v&&v.id)byId[v.id]=v});(data.votes||[]).forEach(function(v){if(v&&v.id&&!byId[v.id]){byId[v.id]=v;added++}});U.votes=Object.keys(byId).map(function(k){return byId[k]});var cby=Object.create(null);(U.coachVotes||[]).forEach(function(v){if(v&&v.id)cby[v.id]=v});(data.coachVotes||[]).forEach(function(v){if(v&&v.id&&!cby[v.id]){cby[v.id]=v;cadded++}});U.coachVotes=Object.keys(cby).map(function(k){return cby[k]});if(added||cadded)try{A()}catch(e){}return{player:added,coach:cadded}}catch(e){return{player:0,coach:0,error:String(e)}}};',
    to:
      'window.__svHydrateVotesFromLocal=function(){try{var raw=localStorage.getItem(i);if(!raw)return{player:0,coach:0};var data=JSON.parse(raw),added=0,cadded=0,byId=Object.create(null);function hv(v){var id=svVid(v);if(!id||byId[id])return;byId[id]=Object.assign({},v,{id:id});added++}(U.votes||[]).forEach(function(v){var id=svVid(v);if(id)byId[id]=Object.assign({},v,{id:id})});(data.votes||[]).forEach(hv);try{for(var ti=1;ti<=4;ti++){var cr=localStorage.getItem(qh(ti));if(!cr)continue;var cdata=JSON.parse(cr);(cdata.votes||[]).forEach(hv)}}catch(e){}U.votes=Object.keys(byId).map(function(k){return byId[k]});var cby=Object.create(null);(U.coachVotes||[]).forEach(function(v){if(v&&v.id)cby[v.id]=v});(data.coachVotes||[]).forEach(function(v){if(v&&v.id&&!cby[v.id]){cby[v.id]=v;cadded++}});U.coachVotes=Object.keys(cby).map(function(k){return cby[k]});if(added||cadded)try{A()}catch(e){}return{player:added,coach:cadded}}catch(e){return{player:0,coach:0,error:String(e)}}};',
    once: true,
  },
  {
    name: "add svVid helper before hydrate",
    from: "window.__svHydrateVotesFromLocal=function(){try{var raw=localStorage.getItem(i);",
    to: 'function svVid(v){if(!v)return null;if(v.id)return v.id;try{return typeof window.__svVoteDocIdForBallot=="function"?window.__svVoteDocIdForBallot(v):null}catch(e){return null}}window.__svHydrateVotesFromLocal=function(){try{var raw=localStorage.getItem(i);',
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
