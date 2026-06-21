/**
 * Copy tools/squadi-lib.mjs → public/dist/squadi-client.js (browser ES module).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = fs.readFileSync(path.join(root, "tools/squadi-lib.mjs"), "utf8");
let body = lib.replace(/^\/\*\*[\s\S]*?\*\/\s*\n*/, "");
body = body.replace(
  /^import[\s\S]*?from "node:url";\s*\n\s*const __squadiDir[\s\S]*?\.href\s*\);\s*\n/m,
  'import { formatGoalScorerList } from "./name-match.js?tag=v167";\n\n'
);
const out =
  "/**\n * Browser copy of tools/squadi-lib.mjs — keep in sync.\n */\n\n" + body;
fs.writeFileSync(path.join(root, "public/dist/squadi-client.js"), out);
console.log("synced public/dist/squadi-client.js");
