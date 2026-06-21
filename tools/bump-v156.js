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
      t = t.replace(/\?tag=v155/g, "?tag=v156");
      t = t.replace(/CACHE_VERSION = "v155"/, 'CACHE_VERSION = "v156"');
      t = t.replace(/sw\.js\?v=155/g, "sw.js?v=156");
      t = t.replace(/content="155"/g, 'content="156"');
      t = t.replace(/v155: /g, "v156: ");
      if (t !== o) {
        fs.writeFileSync(p, t);
        console.log("bumped", path.relative(root, p));
      }
    }
  }
}

walk(root);
