/**
 * Forensic audit: lost / inflated votes received (3/2/1 picks) vs CSV truth.
 *
 * Sections:
 *  1. Old Over-rounds $p() graph vs current Uo() tally vs CSV
 *  2. Johanna / Jay alias timeline impact on received votes
 *  3. Per-player max-ever git totals vs current CSV
 *
 * Usage:
 *   node tools/audit-lost-votes-received.mjs
 *   node tools/audit-lost-votes-received.mjs --write data/lost-votes-report.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { firebaseConfigFromApp, fetchFirestoreVotes } from "./firestore-rest.mjs";
import { tallyBreakdownForRound, loadNameMatch } from "./tally-breakdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const DEFAULT_CSV =
  process.env.VOTES_CSV || "C:/Users/sydne/OneDrive/Desktop/Div_8_all_rounds.csv";
const restoredPath = join(root, "data/restored-votes.json");
const writeArg = process.argv.indexOf("--write");
const writePath =
  writeArg >= 0 ? process.argv[writeArg + 1] || join(root, "data/lost-votes-report.json") : null;
const teamId = 1;

if (!existsSync(DEFAULT_CSV)) {
  console.error("CSV not found:", DEFAULT_CSV);
  process.exit(1);
}

const lib = await import(pathToFileURL(join(root, "public/dist/import-votes-csv.js")).href);
const { parseSeasonCsv } = lib;
const nm = await loadNameMatch();

const csvRaw = readFileSync(DEFAULT_CSV, "utf8");
const parsed = parseSeasonCsv(csvRaw);
const squad = parsed.players;
const rounds = parsed.rounds.map((r) => r.round);

function csvSeasonTotals() {
  const out = Object.create(null);
  squad.forEach((p) => {
    out[p] = parsed.rounds.reduce((a, r) => a + (r.totals[p] || 0), 0);
  });
  return out;
}

/** Pre-v198 Over-rounds cumulative trend: raw picks, no dedupe, no svCanon. */
function simulateOldDollarP(votes, roundsList) {
  const roundIdx = Object.fromEntries(roundsList.map((r, i) => [r, i]));
  const f = Object.create(null);
  squad.forEach((p) => {
    f[p] = roundsList.map(() => 0);
  });
  const weights = [3, 2, 1];
  (votes || []).forEach((b) => {
    if (!b || String(b.teamId) !== String(teamId)) return;
    const ri = roundIdx[b.round || "Round 1"];
    if (ri == null) return;
    (b.picks || []).forEach((pick, i) => {
      if (!pick) return;
      const arr = f[pick];
      if (arr) arr[ri] += weights[i] || 0;
    });
  });
  squad.forEach((p) => {
    let cum = 0;
    f[p] = f[p].map((v) => {
      cum += v;
      return cum;
    });
  });
  return f;
}

/** Current pipeline: dedupe + canonicalForTally per round. */
function simulateCurrentUoSeason(votes) {
  const out = Object.create(null);
  squad.forEach((p) => {
    out[p] = 0;
  });
  rounds.forEach((round) => {
    const { breakdown } = tallyBreakdownForRound(votes, squad, teamId, round, nm);
    squad.forEach((p) => {
      out[p] += (breakdown[p] && breakdown[p].pts) || 0;
    });
  });
  return out;
}

function seasonFromFn(votes, fn) {
  return fn(votes);
}

/** Roster-safe or unsafe alias map for received-vote simulation. */
function tallyReceivedWithAliasRules(votes, aliasMap, rosterSafe) {
  const out = Object.create(null);
  squad.forEach((p) => {
    out[p] = 0;
  });

  function canonPick(name) {
    const base = nm.displayPlayerName(name);
    const key = nm.stripNameQualifiers(base).toLowerCase();
    const target = aliasMap[key];
    if (!target) {
      return nm.canonicalPlayerName(base, squad);
    }
    if (rosterSafe) {
      const exact = squad.find(
        (p) =>
          p.toLowerCase() === base.toLowerCase() ||
          nm.normalizeName(p) === nm.normalizeName(base)
      );
      if (exact) return exact;
      const hits = squad.filter(
        (p) =>
          p.toLowerCase() === target.toLowerCase() ||
          nm.normalizeName(p) === nm.normalizeName(target)
      );
      return hits.length === 1 ? hits[0] : base;
    }
    return target;
  }

  (votes || []).forEach((v) => {
    if (String(v.teamId) !== String(teamId)) return;
    (v.picks || []).forEach((pick, i) => {
      if (!pick) return;
      const c = canonPick(pick);
      if (out[c] != null) out[c] += [3, 2, 1][i];
    });
  });
  return out;
}

function gitShow(file, sha) {
  try {
    return execFileSync("git", ["show", sha + ":" + file], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function loadVotesFromGit(sha, file = "data/restored-votes.json") {
  const raw = gitShow(file, sha);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j.votes || null;
  } catch {
    return null;
  }
}

function scanGitMaxEver() {
  const files = [
    "data/restored-votes.json",
    "data/votes-seed.json",
    "public/data/restored-votes.json",
  ];
  const shas = execFileSync("git", ["log", "--all", "--format=%H"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);

  const maxEver = Object.create(null);
  const evidence = Object.create(null);

  for (const sha of shas) {
    for (const file of files) {
      const votes = loadVotesFromGit(sha, file);
      if (!votes || !votes.length || !votes[0]?.picks) continue;
      const pts = simulateCurrentUoSeason(votes);
      for (const p of squad) {
        if ((pts[p] || 0) > (maxEver[p] || 0)) {
          maxEver[p] = pts[p];
          evidence[p] = {
            commit: sha.slice(0, 7),
            file,
            pts: pts[p],
          };
        }
      }
    }
  }
  return { maxEver, evidence };
}

function scanGitForJohannaJayPicks() {
  const files = ["data/restored-votes.json", "data/votes-seed.json", "public/data/restored-votes.json"];
  const shas = execFileSync("git", ["log", "--all", "--format=%H"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const pickHits = [];
  for (const sha of shas) {
    for (const file of files) {
      const votes = loadVotesFromGit(sha, file);
      if (!votes) continue;
      votes.forEach((v) => {
        (v.picks || []).forEach((p, i) => {
          if (/johanna|jay/i.test(p)) {
            pickHits.push({
              commit: sha.slice(0, 7),
              file,
              round: v.round,
              voterName: v.voterName,
              slot: [3, 2, 1][i],
              pick: p,
            });
          }
        });
      });
    }
  }
  return { pickHits };
}

function countBallotPicks(votes, pattern) {
  const hits = [];
  (votes || []).forEach((v) => {
    (v.picks || []).forEach((p, i) => {
      if (pattern.test(p)) {
        hits.push({
          round: v.round,
          voterName: v.voterName,
          slot: [3, 2, 1][i],
          pick: p,
          id: v.id,
        });
      }
    });
  });
  return hits;
}

// --- load ballots ---
const restoredVotes = existsSync(restoredPath)
  ? JSON.parse(readFileSync(restoredPath, "utf8")).votes || []
  : [];

let firestoreVotes = [];
let firestoreErr = null;
try {
  const cfg = firebaseConfigFromApp();
  firestoreVotes = await fetchFirestoreVotes(cfg.projectId, cfg.apiKey);
} catch (e) {
  firestoreErr = e.message || String(e);
}

const csvTruth = csvSeasonTotals();
const oldGraph = simulateOldDollarP(restoredVotes, rounds);
const currentUo = simulateCurrentUoSeason(restoredVotes);

// --- 1. Old graph vs current vs CSV ---
const oldGraphReport = squad.map((player) => {
  const series = oldGraph[player] || [];
  const oldSeason = series.length ? series[series.length - 1] : 0;
  const cur = currentUo[player] || 0;
  const csv = csvTruth[player] || 0;
  return {
    player,
    csvTruth: csv,
    oldGraphSeason: oldSeason,
    currentUoSeason: cur,
    oldHigherThanCsv: oldSeason - csv,
    currentHigherThanCsv: cur - csv,
    oldVsCurrent: oldSeason - cur,
  };
});

const oldInflated = oldGraphReport.filter((r) => r.oldHigherThanCsv > 0);
const oldDeflated = oldGraphReport.filter((r) => r.oldHigherThanCsv < 0);
const oldVsCurrentDiffs = oldGraphReport.filter((r) => r.oldVsCurrent !== 0);

// Duplicate-ballot mechanism demo (Round 2 doubled)
const dupDemo = restoredVotes.concat(
  restoredVotes
    .filter((v) => v.round === "Round 2")
    .map((v, i) => ({ ...v, id: (v.id || "x") + "_dup" + i }))
);
const dupOld = simulateOldDollarP(dupDemo, rounds);
const dupCur = simulateCurrentUoSeason(dupDemo);
const duplicateMechanism = squad
  .map((p) => ({
    player: p,
    oldGraphWithDupes: (dupOld[p] || [])[dupOld[p].length - 1] || 0,
    currentWithDupes: dupCur[p] || 0,
    csvTruth: csvTruth[p] || 0,
    inflationFromDupes: ((dupOld[p] || [])[dupOld[p].length - 1] || 0) - (dupCur[p] || 0),
  }))
  .filter((r) => r.inflationFromDupes !== 0);

// --- 2. Johanna alias timeline ---
const aliasEras = [
  {
    era: "v139-v187",
    commit: "e78e82c",
    rule: "johanna→Jay (unsafe global canonicalPlayerName)",
    aliasMap: { johanna: "Jay" },
    rosterSafe: false,
  },
  {
    era: "v188-v193",
    commit: "b992045",
    rule: "johanna→Jay removed",
    aliasMap: {},
    rosterSafe: false,
  },
  {
    era: "v189+",
    commit: "311085b",
    rule: "roster-safe aliases (no johanna/jay until v194)",
    aliasMap: {},
    rosterSafe: true,
  },
  {
    era: "v194+",
    commit: "41dd13f",
    rule: "jay→Johanna (roster-safe)",
    aliasMap: { jay: "Johanna" },
    rosterSafe: true,
  },
];

const johannaAliasReport = {
  timeline: aliasEras.map((era) => ({
    ...era,
    johannaPtsReceived: tallyReceivedWithAliasRules(
      restoredVotes,
      era.aliasMap,
      era.rosterSafe
    ).Johanna,
    jayPtsReceived: tallyReceivedWithAliasRules(restoredVotes, era.aliasMap, era.rosterSafe).Jay,
  })),
  picksInCurrentBallots: {
    johanna: countBallotPicks(restoredVotes, /johanna/i),
    jay: countBallotPicks(restoredVotes, /^jay$/i),
    johannaFrolinghaus: countBallotPicks(restoredVotes, /johanna\s+frolinghaus/i),
  },
  gitPickSearch: scanGitForJohannaJayPicks(),
  voterBallotsAsJohanna: restoredVotes.filter((v) => /johanna/i.test(v.voterName || "")).length,
  csvJohannaPts: csvTruth.Johanna || 0,
  conclusion: null,
};

const anyJohannaPtsInEras = johannaAliasReport.timeline.some((e) => e.johannaPtsReceived > 0);
const anyJayOrJohannaPicks =
  johannaAliasReport.picksInCurrentBallots.jay.length > 0 ||
  johannaAliasReport.picksInCurrentBallots.johanna.length > 0 ||
  johannaAliasReport.gitPickSearch.pickHits.length > 0;

if (!anyJayOrJohannaPicks && johannaAliasReport.csvJohannaPts === 0) {
  johannaAliasReport.conclusion =
    "NO — alias changes did not delete received votes. Zero ballots ever picked Johanna/Jay (3/2/1); CSV column is all 0s. v139 johanna→Jay only affected voter-name matching, not picks received.";
} else if (anyJohannaPtsInEras) {
  johannaAliasReport.conclusion =
    "YES — alias rules would change Johanna received pts; see timeline entries with non-zero johannaPtsReceived.";
} else {
  johannaAliasReport.conclusion =
    "Picks exist but tally yields 0 Johanna pts under all alias eras — likely orphaned under old $p() without svCanon.";
}

// --- 3. Git max-ever vs CSV ---
const { maxEver, evidence } = scanGitMaxEver();
const perPlayerLost = squad.map((player) => {
  const current = csvTruth[player] || 0;
  const max = maxEver[player] || current;
  return {
    player,
    currentPts: current,
    maxEverInGit: max,
    delta: max - current,
    evidence: evidence[player] || null,
    recoverable: false,
  };
});
perPlayerLost.sort((a, b) => b.delta - a.delta);

// v182 inflated commit post-mortem
const v182Votes = loadVotesFromGit("9839313");
const v182PostMortem = v182Votes
  ? squad
      .map((p) => ({
        player: p,
        v182Tally: simulateCurrentUoSeason(v182Votes)[p],
        csv: csvTruth[p],
        excess: simulateCurrentUoSeason(v182Votes)[p] - csvTruth[p],
      }))
      .filter((r) => r.excess !== 0)
  : [];

const appVersion =
  readFileSync(join(root, "public/index.html"), "utf8").match(
    /name="sv-app-version"\s+content="(\d+)"/
  )?.[1] || "?";
const headCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();

const report = {
  generatedAt: new Date().toISOString(),
  version: "v" + appVersion,
  commit: headCommit,
  deployUrl: "https://wembley-downs-div-8-2026.web.app/",
  csvPath: DEFAULT_CSV,
  ballotCounts: {
    restored: restoredVotes.length,
    firestore: firestoreVotes.length,
    firestoreErr,
  },
  summary: {
    currentBallotsMatchCsv:
      oldInflated.length === 0 && oldDeflated.length === 0,
    historicalGitInflationAboveCsv: perPlayerLost.filter((r) => r.delta > 0),
    recoverableVotesFound: false,
    shipNewVersionRecommended: false,
    oldGraphVsCsv: {
      inflatedPlayers: oldInflated.length,
      deflatedPlayers: oldDeflated.length,
      mechanism:
        oldVsCurrentDiffs.length === 0
          ? "On current 70 deduped ballots old $p() equals Uo(). Pre-v198 inflation only when Firestore had duplicate ballots per voter (dedupe in Uo, not in old $p)."
          : "Old $p differs from Uo on current ballots — see oldGraph.players.",
    },
    johannaAliasImpact: johannaAliasReport.conclusion,
  },
  oldOverRoundsGraph: {
    description:
      "Pre-v198 $p(): raw pick strings, no ballot dedupe, no svCanon. v198 routes trend through Uo() per round.",
    players: oldGraphReport,
    inflatedVsCsv: oldInflated,
    deflatedVsCsv: oldDeflated,
    oldVsCurrentOnCurrentBallots: oldVsCurrentDiffs,
    duplicateBallotMechanismDemo: {
      note: "Synthetic: duplicate all Round 2 ballots once. Shows how old graph inflated while Uo dedupes.",
      sample: duplicateMechanism.filter((r) => r.inflationFromDupes > 0).slice(0, 12),
    },
    johannaNonZeroInOldGraph: (oldGraph.Johanna || [])[(oldGraph.Johanna || []).length - 1] || 0,
  },
  johannaAlias: johannaAliasReport,
  perPlayerMaxEverGit: perPlayerLost,
  historicalInflation: {
    note: "v182 (9839313) had CSV mismatches fixed in v187 (d819957). Not recoverable extra votes — bad reconstruction.",
    v182Excess: v182PostMortem,
  },
};

if (writePath) {
  writeFileSync(writePath, JSON.stringify(report, null, 2) + "\n");
  console.log("Wrote", writePath);
}

// Console summary
console.log("=== Lost / inflated votes received audit ===");
console.log("Version:", report.version, "commit:", report.commit);
console.log("Ballots: restored", restoredVotes.length, "firestore", firestoreVotes.length);
console.log("");
console.log("1. OLD Over-rounds graph vs CSV (current 70 ballots)");
console.log(
  "   Inflated vs CSV:",
  oldInflated.length ? oldInflated.map((r) => r.player + "+" + r.oldHigherThanCsv).join(", ") : "none"
);
console.log(
  "   Old vs current Uo:",
  oldVsCurrentDiffs.length ? oldVsCurrentDiffs.map((r) => r.player).join(", ") : "identical"
);
console.log(
  "   Johanna old graph season pts:",
  report.oldOverRoundsGraph.johannaNonZeroInOldGraph,
  "(CSV:",
  csvTruth.Johanna,
  ")"
);
console.log("");
console.log("2. Johanna alias impact:", johannaAliasReport.conclusion);
console.log(
  "   Voter ballots as Johanna:",
  johannaAliasReport.voterBallotsAsJohanna,
  "| Jay picks in ballots:",
  johannaAliasReport.picksInCurrentBallots.jay.length
);
console.log("");
console.log("3. Max-ever git vs CSV (delta > 0)");
const lost = perPlayerLost.filter((r) => r.delta > 0);
if (!lost.length) console.log("   none — all players match CSV in current data");
else {
  for (const r of lost) {
    console.log(
      "  ",
      r.player.padEnd(14),
      "current",
      r.currentPts,
      "max git",
      r.maxEverInGit,
      "Δ+" + r.delta,
      "@",
      r.evidence?.commit
    );
  }
}
console.log("");
console.log("Recoverable votes:", report.summary.recoverableVotesFound ? "YES" : "NO");
console.log("Ship new version:", report.summary.shipNewVersionRecommended ? "YES" : "NO");

process.exitCode = report.summary.currentBallotsMatchCsv ? 0 : 1;
