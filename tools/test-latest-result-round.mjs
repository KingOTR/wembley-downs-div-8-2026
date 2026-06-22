/**
 * Tests SvLatestResultRound (latest "round with a saved result").
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const appPath = join(here, "../public/dist/app.min.js");
const app = fs.readFileSync(appPath, "utf8");

function extractFn(name) {
  const start = app.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  let depth = 0;
  let i = app.indexOf("{", start);
  for (; i < app.length; i++) {
    if (app[i] === "{") depth++;
    else if (app[i] === "}") {
      depth--;
      if (depth === 0) return app.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

const ctx = {
  Ct: function (l) {
    var h = String(l || "").trim(),
      m = h.match(/^round\s*(\d+(?:\.\d+)?)$/i);
    if (m) return parseFloat(m[1]);
    m = h.match(/^(\d+(?:\.\d+)?)$/);
    return m ? parseFloat(m[1]) : null;
  },
};

const { SvLatestResultRound } = new Function(
  "Ct",
  extractFn("SvLatestResultRound") + "; return { SvLatestResultRound };"
)(ctx.Ct);

// Highest round with an actual result should win.
const team = {
  matchesByRound: {
    "Round 8": { kickoff: "2026-06-15T10:30", ourScore: 2, oppScore: 1 },
    "Round 9": { kickoff: "2026-06-22T10:30", ourScore: 0, oppScore: 0 },
    "Round 10": { kickoff: "2026-06-29T10:30" }, // no score yet
  },
};

if (SvLatestResultRound(team) !== "Round 9") {
  throw new Error("Expected latest result round = Round 9");
}

// If no round has scores, it should return null.
const noResults = {
  matchesByRound: {
    "Round 1": { kickoff: "2026-06-01T10:30" },
    "Round 2": { kickoff: "2026-06-08T10:30" },
  },
};

if (SvLatestResultRound(noResults) !== null) {
  throw new Error("Expected null when no result exists yet");
}

console.log("latest-result-round test OK");

