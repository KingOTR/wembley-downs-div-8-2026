/**
 * Rebuild app.min.js from v136 + v137/v138 patches with safe replacements.
 */
const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "../public/dist/app.min.js");

const PATCHES = [
  {
    name: "pI focus guard",
    from: 'function pI(){var c=document.getElementById("voterNameSuggestPanel");if(!(!c||!et)){if(wp()){xo();return}',
    to: 'function pI(){var c=document.getElementById("voterNameSuggestPanel");if(!(!c||!et)){if(document.activeElement!==et){xo();return}if(wp()){xo();return}',
  },
  {
    name: "bp only attach datalist when focused",
    from: 'function bp(){et&&(wp()?(et.setAttribute("list","voterNameSuggest"),xo()):et.removeAttribute("list"))}',
    to: 'function bp(){if(!et)return;document.activeElement===et&&wp()?et.setAttribute("list","voterNameSuggest"):et.removeAttribute("list")}',
  },
  {
    name: "resize defer eu unless focused",
    from: 'window.addEventListener("resize",function(){bp(),eu(),!(Xt!=="trend"',
    to: 'window.addEventListener("resize",function(){bp(),document.activeElement===et&&eu(),!(Xt!=="trend"',
  },
  {
    name: "admin DOM refs for game metadata",
    from: 'ds=document.getElementById("matchDateInput"),fs=document.getElementById("matchVenueInput"),ms=document.getElementById("matchOpponentInput")',
    to: 'ds=document.getElementById("matchDateInput"),gs=document.getElementById("matchSuburbInput"),bs=document.getElementById("matchKickoffInput"),ys=document.getElementById("matchGroundInput"),vs=document.getElementById("matchPitchInput"),fs=document.getElementById("matchVenueInput"),ms=document.getElementById("matchOpponentInput")',
    once: true,
  },
  {
    name: "Op load game metadata",
    from: 'ds&&(ds.value=h.date||""),fs&&(fs.value=h.venue||""),ms&&(ms.value=h.opponent||"")',
    to: 'ds&&(ds.value=h.date||""),gs&&(gs.value=h.suburb||""),bs&&(bs.value=h.kickoff||""),ys&&(ys.value=h.groundName||""),vs&&(vs.value=h.pitchNumber||""),fs&&(fs.value=h.venue||h.groundName||""),ms&&(ms.value=h.opponent||"")',
  },
  {
    name: "XI save game metadata",
    from: 'c.matchesByRound[l]={date:ds?ds.value:"",venue:fs?fs.value.trim():"",opponent:ms?ms.value.trim():""',
    to: 'c.matchesByRound[l]={date:ds?ds.value:"",suburb:gs?gs.value.trim():"",kickoff:bs?bs.value:"",groundName:ys?ys.value.trim():"",pitchNumber:vs?vs.value.trim():"",venue:fs?fs.value.trim():"",opponent:ms?ms.value.trim():""',
  },
  {
    name: "PI AI context game metadata",
    from: 'return{team:c?c.name||"Team "+c.id:"",round:l,date:h.date||"",venue:h.venue||"",opponent:h.opponent||""',
    to: 'return{team:c?c.name||"Team "+c.id:"",round:l,date:h.date||"",suburb:h.suburb||"",kickoff:h.kickoff||"",groundName:h.groundName||"",pitchNumber:h.pitchNumber||"",venue:h.venue||"",opponent:h.opponent||""',
  },
  {
    name: "Ns venue display ground + pitch",
    from: 'if(m.venue){tn.style.display="block",nn.textContent=m.venue;',
    to: 'var _gv=m.groundName||m.venue||"";if(m.pitchNumber&&String(m.pitchNumber).trim())_gv=_gv?(_gv+", Pitch "+String(m.pitchNumber).trim()):("Pitch "+String(m.pitchNumber).trim());if(_gv){tn.style.display="block",nn.textContent=_gv;',
  },
  {
    name: "Ns round line kickoff",
    from: 'hr.textContent=[h,m.date?xp(m.date):""].filter(Boolean).join(" · ")||h)',
    to: 'hr.textContent=[h,m.kickoff?xp(String(m.kickoff).slice(0,10))+(String(m.kickoff).length>10?" "+new Date(m.kickoff).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):""):m.date?xp(m.date):"",m.suburb||""].filter(Boolean).join(" · ")||h)',
  },
  {
    name: "lineup export snapshot helper",
    from: 'Dh&&Dh.addEventListener("click",function(){try{F&&Pn&&',
    to: 'window.__svLineupExportSnapshot=function(){try{if(F&&Pn)F.subs=String(Pn.value||"").split("\\n").map(function(h){return h.trim()}).filter(Boolean)}catch{}try{Wh()}catch{}var c=ie(ue),l=Lo(c);return{team:c,round:l,entry:Va(c,l)}},Dh&&Dh.addEventListener("click",function(){try{F&&Pn&&',
  },
];

function checkSyntax(code) {
  const tmp = path.join(__dirname, "../.tmp-rebuild.mjs");
  fs.writeFileSync(tmp, code);
  execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
}

function replaceOnce(s, from, to) {
  const i = s.indexOf(from);
  if (i === -1) return null;
  return s.slice(0, i) + to + s.slice(i + from.length);
}

let s = execSync("git show b055f7c:public/dist/app.min.js", {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});

PATCHES.forEach((p) => {
  if (!s.includes(p.from)) {
    console.error("MISSING:", p.name);
    process.exit(1);
  }
  s = p.once ? replaceOnce(s, p.from, p.to) : s.replace(p.from, p.to);
  try {
    checkSyntax(s);
    console.log("OK:", p.name);
  } catch (e) {
    console.error("SYNTAX FAIL after:", p.name);
    console.error((e.stderr || e.stdout || "").toString().split("\n").slice(0, 3).join(" "));
    process.exit(1);
  }
});

fs.writeFileSync(appPath, s);
console.log("Wrote", appPath, "bytes", s.length);
