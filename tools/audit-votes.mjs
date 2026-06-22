/**
 * Audit player vote totals: CSV source of truth vs restored JSON vs Firestore.
 *
 * Usage:
 *   node tools/audit-votes.mjs [csv-path]
 *   node tools/audit-votes.mjs --json
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { firebaseConfigFromApp, fetchFirestoreVotes } from "./firestore-rest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const DEFAULT_CSV =
  process.env.VOTES_CSV || "C:/Users/sydne/OneDrive/Desktop/Div_8_all_rounds.csv";
const jsonOut = process.argv.includes("--json");
const csvPath = process.argv.find((a) => a.endsWith(".csv")) || DEFAULT_CSV;
const restoredPath = join(root, "data/restored-votes.json");

const lib = await import(pathToFileURL(join(root, "public/dist/import-votes-csv.js")).href);
const { parseSeasonCsv, roundKey } = lib;
const { tallyBreakdownForRound, loadNameMatch } = await import(
  pathToFileURL(join(here, "tally-breakdown.mjs")).href
);
const nm = await loadNameMatch();

function tallyFromBallots(votes, players, teamId, round) {
  const { breakdown } = tallyBreakdownForRound(votes, players, teamId, round, nm);
  const out = {};
  players.forEach((p) => {
    out[p] = (breakdown[p] && breakdown[p].pts) || 0;
  });
  return out;
}

function csvRoundTotals(parsed) {
  const out = {};
  parsed.rounds.forEach((r) => {
    out[r.round] = { sum: r.sum, totals: r.totals };
  });
  return out;
}

if (!existsSync(csvPath)) {
  console.error("CSV not found:", csvPath);
  process.exit(1);
}

const csvRaw = readFileSync(csvPath, "utf8");
const parsed = parseSeasonCsv(csvRaw);
const csvByRound = csvRoundTotals(parsed);

let restoredVotes = [];
if (existsSync(restoredPath)) {
  restoredVotes = JSON.parse(readFileSync(restoredPath, "utf8")).votes || [];
}

const cfg = firebaseConfigFromApp();
let firestoreVotes = [];
let firestoreErr = "";
try {
  firestoreVotes = await fetchFirestoreVotes(cfg.projectId, cfg.apiKey);
} catch (e) {
  firestoreErr = e.message || String(e);
}

function sumPoints(map) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

const players = parsed.players;
const teamId = 1;
const rounds = parsed.rounds.map((r) => r.round);
const rows = [];
let allOk = true;

for (const round of rounds) {
  const csv = csvByRound[round];
  const importedTally = tallyFromBallots(restoredVotes, players, teamId, round);
  const fsTally = tallyFromBallots(firestoreVotes, players, teamId, round);
  const importedBallots = restoredVotes.filter(
    (v) => v && String(v.teamId) === String(teamId) && roundKey(v.round) === round
  ).length;
  const fsBallots = firestoreVotes.filter(
    (v) => v && String(v.teamId) === String(teamId) && roundKey(v.round) === round
  ).length;
  const csvSum = csv.sum;
  const importedSum = sumPoints(importedTally);
  const fsSum = sumPoints(fsTally);
  const ok =
    csvSum === importedSum &&
    csvSum === fsSum &&
    importedBallots === fsBallots;
  if (!ok) allOk = false;
  rows.push({
    round,
    csvPoints: csvSum,
    csvBallots: csvSum / 6,
    importedBallots,
    importedPoints: importedSum,
    firestoreBallots: fsBallots,
    firestorePoints: fsSum,
    match: ok,
  });
}

const report = {
  at: new Date().toISOString(),
  csvPath,
  restoredPath,
  firestoreTotal: firestoreVotes.length,
  firestoreErr: firestoreErr || null,
  allMatch: allOk && !firestoreErr,
  rows,
};

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Vote audit — CSV vs restored JSON vs Firestore (team " + teamId + ")");
  console.log("CSV:", csvPath);
  console.log("Firestore docs:", firestoreVotes.length, firestoreErr ? "(" + firestoreErr + ")" : "");
  console.log("");
  console.log(
    "Round".padEnd(10) +
      "CSV pts".padStart(8) +
      "Import".padStart(8) +
      "FS pts".padStart(8) +
      "Ballots".padStart(10) +
      "  OK"
  );
  console.log("-".repeat(48));
  for (const r of rows) {
    console.log(
      r.round.padEnd(10) +
        String(r.csvPoints).padStart(8) +
        String(r.importedPoints).padStart(8) +
        String(r.firestorePoints).padStart(8) +
        (r.importedBallots + "/" + r.firestoreBallots).padStart(10) +
        (r.match ? "  ✓" : "  ✗")
    );
  }
  console.log("");
  console.log(allOk && !firestoreErr ? "ALL ROUNDS MATCH CSV" : "MISMATCH — review rows marked ✗");
}

// Node 24: avoid hard process.exit() which can trip UV_HANDLE_CLOSING
// when fetch/undici still has handles. Let the event loop drain.
process.exitCode = allOk && !firestoreErr ? 0 : 1;
