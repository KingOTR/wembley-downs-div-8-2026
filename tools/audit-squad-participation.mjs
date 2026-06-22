/**
 * Per-squad-member audit: ballots submitted vs points received.
 */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const DEFAULT_CSV =
  process.env.VOTES_CSV || "C:/Users/sydne/OneDrive/Desktop/Div_8_all_rounds.csv";
const csvPath = process.argv.find((a) => a.endsWith(".csv")) || DEFAULT_CSV;

const lib = await import(pathToFileURL(join(root, "public/dist/import-votes-csv.js")).href);
const { parseSeasonCsv, tallyLikeSeasonExport, roundKey } = lib;

const restored = JSON.parse(readFileSync(join(root, "data/restored-votes.json"), "utf8"));
const votes = restored.votes || [];
const csv = parseSeasonCsv(readFileSync(csvPath, "utf8"));
const players = csv.players;
const rounds = csv.rounds.map((r) => r.round);

let v181 = [];
try {
  v181 = JSON.parse(
    execSync("git show 9eb02bb:data/restored-votes.json", { cwd: root, encoding: "utf8" })
  ).votes || [];
} catch {}

let snapshot = [];
const snapPath = join(root, "data/coach-votes-firestore-snapshot.json");
// player votes from votes-seed or snapshot
const seedPath = join(root, "data/votes-seed.json");
if (existsSync(seedPath)) {
  snapshot = JSON.parse(readFileSync(seedPath, "utf8")).votes || [];
}

function matchPlayer(name) {
  const n = String(name || "").trim();
  return players.find(
    (p) => p.toLowerCase() === n.toLowerCase() || p === n
  );
}

function voterStats(vlist) {
  const m = Object.fromEntries(players.map((p) => [p, { count: 0, rounds: [] }]));
  vlist.forEach((v) => {
    const hit = matchPlayer(v.voterName);
    if (hit) {
      m[hit].count++;
      m[hit].rounds.push(roundKey(v.round));
    }
  });
  return m;
}

function csvSeasonPts() {
  const m = Object.fromEntries(players.map((p) => [p, 0]));
  csv.rounds.forEach((r) => {
    players.forEach((p) => {
      m[p] += r.totals[p] || 0;
    });
  });
  return m;
}

function ballotSeasonPts(vlist) {
  const m = Object.fromEntries(players.map((p) => [p, 0]));
  const byRound = {};
  vlist.forEach((v) => {
    const rk = roundKey(v.round);
    if (!byRound[rk]) byRound[rk] = [];
    byRound[rk].push(v.picks);
  });
  Object.values(byRound).forEach((ballots) => {
    const t = tallyLikeSeasonExport(ballots, players);
    players.forEach((p) => {
      m[p] += t[p] || 0;
    });
  });
  return m;
}

const vr = voterStats(votes);
const v181vr = voterStats(v181);
const fsVr = voterStats(snapshot);
const csvPts = csvSeasonPts();
const ballotPts = ballotSeasonPts(votes);

const rows = players.map((p) => ({
  player: p,
  ballots: vr[p].count,
  ballotRounds: vr[p].rounds,
  v181Ballots: v181vr[p].count,
  firestoreBallots: fsVr[p].count,
  csvPts: csvPts[p],
  ballotPts: ballotPts[p],
  ptsMatch: csvPts[p] === ballotPts[p],
}));

console.log(JSON.stringify({ players: rows.length, totalBallots: votes.length, snapshotBallots: snapshot.length, rounds, rows }, null, 2));
