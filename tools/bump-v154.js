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
      t = t.replace(/\?tag=v153/g, "?tag=v154");
      t = t.replace(/CACHE_VERSION = "v153"/, 'CACHE_VERSION = "v154"');
      t = t.replace(/sw\.js\?v=153/g, "sw.js?v=154");
      t = t.replace(/content="153"/g, 'content="154"');
      t = t.replace(/v153: /g, "v154: ");
      if (t !== o) {
        fs.writeFileSync(p, t);
        console.log("bumped", path.relative(root, p));
      }
    }
  }
}

walk(root);
