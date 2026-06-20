const fs = require("fs");
const s = fs.readFileSync("public/dist/app.min.js", "utf8");
const re = /([a-zA-Z_$][\w$]*)=document\.getElementById\("([^"]+)"\)/g;
const m = new Map();
let x;
while ((x = re.exec(s)) !== null) {
  const v = x[1];
  const id = x[2];
  if (!m.has(v)) m.set(v, []);
  m.get(v).push(id);
}
for (const [v, ids] of m) {
  if (ids.length > 1) console.log(v + ":", ids.join(" -> "));
}
