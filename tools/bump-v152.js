const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../public");

function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|json)$/.test(f)) {
      let t = fs.readFileSync(p, "utf8");
      const o = t;
      t = t.replace(/\?tag=v151/g, "?tag=v152");
      t = t.replace(/CACHE_VERSION = "v151"/, 'CACHE_VERSION = "v152"');
      t = t.replace(/sw\.js\?v=151/g, "sw.js?v=152");
      t = t.replace(/v151: Iwanoff/, "v152: kickoff save + theme/lineup polish");
      if (t !== o) {
        fs.writeFileSync(p, t);
        console.log("bumped", path.relative(root, p));
      }
    }
  }
}

walk(root);
