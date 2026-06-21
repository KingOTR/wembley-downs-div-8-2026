/**
 * Copy tools/squadi-lib.mjs → public/dist/squadi-client.js (browser ES module).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = fs.readFileSync(path.join(root, "tools/squadi-lib.mjs"), "utf8");
const body = lib.replace(/^\/\*\*[\s\S]*?\*\/\s*\n*/, "");
const out =
  "/**\n * Browser copy of tools/squadi-lib.mjs — keep in sync.\n */\n\n" + body;
fs.writeFileSync(path.join(root, "public/dist/squadi-client.js"), out);
console.log("synced public/dist/squadi-client.js");
