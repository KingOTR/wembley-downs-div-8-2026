const fs = require("fs");
const p = "public/dist/app.min.js";
let s = fs.readFileSync(p, "utf8");
if (s.includes("__svLineupExportSnapshot")) {
  console.log("already applied");
  process.exit(0);
}
const from = 'Dh&&Dh.addEventListener("click",function(){try{F&&Pn&&';
const to =
  'window.__svLineupExportSnapshot=function(){try{if(F&&Pn)F.subs=String(Pn.value||"").split(/\\r?\\n/).map(function(h){return h.trim()}).filter(Boolean)}catch{}try{Wh()}catch{}var c=ie(ue),l=Lo(c);return{team:c,round:l,entry:Va(c,l)}};Dh&&Dh.addEventListener("click",function(){try{F&&Pn&&';
if (!s.includes(from)) {
  console.error("patch target not found");
  process.exit(1);
}
s = s.replace(from, to);
fs.writeFileSync(p, s);
console.log("snapshot helper applied");
