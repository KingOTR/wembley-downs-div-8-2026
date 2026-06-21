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
      t = t.replace(/\?tag=v152/g, "?tag=v153");
      t = t.replace(/CACHE_VERSION = "v152"/, 'CACHE_VERSION = "v153"');
      t = t.replace(/sw\.js\?v=152/g, "sw.js?v=153");
      t = t.replace(/v152: kickoff save/, "v153: resilient SW + save fix");
      if (t !== o) {
        fs.writeFileSync(p, t);
        console.log("bumped", path.relative(root, p));
      }
    }
  }
}

walk(root);
