/**
 * esbuild: compile src/ → public/dist-built/ (not yet loaded by index.html).
 * Live bundles remain in public/dist/ until migration wires dist-built.
 */
import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const outDir = path.join(root, "public", "dist-built");

const entries = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith(".js") && f !== "README.md")
  .map((f) => path.join(srcDir, f));

if (!entries.length) {
  console.log("No src/*.js entry files");
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const base = path.basename(entry, ".js");
  await esbuild.build({
    entryPoints: [entry],
    outfile: path.join(outDir, base + ".js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    sourcemap: true,
    logLevel: "info",
  });
  console.log("built", path.relative(root, path.join(outDir, base + ".js")));
}

console.log("Build complete → public/dist-built/ (not wired to index.html yet)");
