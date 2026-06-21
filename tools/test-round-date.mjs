/**
 * Sunday rule: before game day → previous round; on game day → current round (Perth).
 */
import { pathToFileURL } from "node:url";
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
  Yr: function (c, l) {
    var h = null;
    (c || []).forEach(function (m) {
      if (!m) return;
      if (h == null) {
        h = m;
        return;
      }
      var f = ctx.Ct(h),
        _ = ctx.Ct(m);
      (_ > f || (_ === f && String(m).localeCompare(String(h)) > 0)) && (h = m);
    });
    return h || l || "Round 1";
  },
};

const fns = new Function(
  "Ct",
  "Yr",
  extractFn("SvPerthTodayYmd") +
    ";" +
    extractFn("SvMatchGameYmd") +
    ";" +
    extractFn("SvRoundByDate") +
    ";" +
    extractFn("SvDefaultRound") +
    "; return { SvRoundByDate: SvRoundByDate, SvDefaultRound: SvDefaultRound };"
)(ctx.Ct, ctx.Yr);

const { SvRoundByDate } = fns;

const team = {
  round: "Round 9",
  matchesByRound: {
    "Round 8": { kickoff: "2026-06-15T10:30", ourScore: 2, oppScore: 1 },
    "Round 9": { kickoff: "2026-06-22T10:30" },
    "Round 10": { kickoff: "2026-06-29T10:30" },
  },
};
const rounds = ["Round 8", "Round 9", "Round 10"];

function mockToday(ymd) {
  const Real = Intl.DateTimeFormat;
  global.Intl.DateTimeFormat = function (loc, opts) {
    if (opts && opts.timeZone === "Australia/Perth") {
      return { format: () => ymd };
    }
    return new Real(loc, opts);
  };
}

mockToday("2026-06-20");
if (SvRoundByDate(team, rounds) !== "Round 8") {
  throw new Error("Saturday before R9 Sunday should be Round 8");
}

mockToday("2026-06-22");
if (SvRoundByDate(team, rounds) !== "Round 9") {
  throw new Error("Sunday of R9 game should be Round 9");
}

mockToday("2026-06-23");
if (SvRoundByDate(team, rounds) !== "Round 9") {
  throw new Error("Monday after R9 Sunday should stay Round 9 until R10 Sunday");
}

mockToday("2026-06-28");
if (SvRoundByDate(team, rounds) !== "Round 9") {
  throw new Error("Saturday before R10 should be Round 9");
}

mockToday("2026-06-29");
if (SvRoundByDate(team, rounds) !== "Round 10") {
  throw new Error("Sunday of R10 should be Round 10");
}

console.log("round-date test OK");
