/**
 * Audit player vote breakdowns (3/2/1 picks) vs CSV column totals, rounds 1–9.
 *
 * Usage: node tools/audit-tally-breakdown.mjs [csv-path]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  formatVoteBreakdown,
  tallyBreakdownForRound,
  loadNameMatch,
} from "./tally-breakdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const DEFAULT_CSV =
  process.env.VOTES_CSV || "C:/Users/sydne/OneDrive/Desktop/Div_8_all_rounds.csv";
const csvPath = process.argv.find((a) => a.endsWith(".csv")) || DEFAULT_CSV;
const restoredPath = join(root, "data/restored-votes.json");
const teamId = 1;

if (!existsSync(csvPath)) {
  console.error("CSV not found:", csvPath);
  process.exit(1);
}

const lib = await import(pathToFileURL(join(root, "public/dist/import-votes-csv.js")).href);
const { parseSeasonCsv } = lib;
const nm = await loadNameMatch();

const csvRaw = readFileSync(csvPath, "utf8");
const parsed = parseSeasonCsv(csvRaw);
const players = parsed.players;
const rounds = parsed.rounds.map((r) => r.round);

let restoredVotes = [];
if (existsSync(restoredPath)) {
  restoredVotes = JSON.parse(readFileSync(restoredPath, "utf8")).votes || [];
}

const csvByRound = Object.fromEntries(
  parsed.rounds.map((r) => [r.round, r.totals])
);

const season = Object.create(null);
players.forEach((p) => {
  season[p] = { pts: 0, n3: 0, n2: 0, n1: 0 };
});

let allOk = true;
const mismatches = [];

console.log("Tally breakdown audit — ballots vs CSV (team " + teamId + ")");
console.log("CSV:", csvPath);
console.log("Ballots:", restoredPath);
console.log("");

const roundHdr = rounds.map((r) => r.replace(/^Round\s*/i, "R"));
const hdr =
  "Player".padEnd(14) +
  roundHdr.map((r) => r.padStart(16)).join("") +
  "  Season".padStart(8) +
  "  CSV?";
console.log(hdr);
console.log("-".repeat(hdr.length));

for (const player of players) {
  const cells = [];
  let seasonOk = true;

  for (const round of rounds) {
    const { breakdown } = tallyBreakdownForRound(
      restoredVotes,
      players,
      teamId,
      round,
      nm
    );
    const row = breakdown[player] || { pts: 0, n3: 0, n2: 0, n1: 0 };
    const csvPts = (csvByRound[round] && csvByRound[round][player]) || 0;
    const ok = row.pts === csvPts;
    if (!ok) {
      allOk = false;
      seasonOk = false;
      mismatches.push({
        player,
        round,
        ballotPts: row.pts,
        csvPts,
        breakdown: formatVoteBreakdown(row),
      });
    }
    season[player].pts += row.pts;
    season[player].n3 += row.n3;
    season[player].n2 += row.n2;
    season[player].n1 += row.n1;
    const cell = row.pts + " (" + formatVoteBreakdown(row) + ")";
    cells.push((ok ? cell : cell + "!").padStart(16));
  }

  const csvSeason = rounds.reduce(
    (sum, r) => sum + ((csvByRound[r] && csvByRound[r][player]) || 0),
    0
  );
  const s = season[player];
  const seasonCell =
    s.pts + " (" + formatVoteBreakdown(s) + ")" + (s.pts === csvSeason ? "" : "!");
  if (s.pts !== csvSeason) {
    allOk = false;
    seasonOk = false;
  }

  console.log(
    player.padEnd(14) + cells.join("") + seasonCell.padStart(8) + (seasonOk ? "  ✓" : "  ✗")
  );
}

console.log("");
if (mismatches.length) {
  console.log("MISMATCHES (" + mismatches.length + "):");
  mismatches.forEach((m) => {
    console.log(
      "  " +
        m.player +
        " " +
        m.round +
        ": ballots=" +
        m.ballotPts +
        " (" +
        m.breakdown +
        ") csv=" +
        m.csvPts
    );
  });
} else {
  console.log("All player round totals match CSV.");
}

// Johanna example
const johanna = "Johanna";
if (players.includes(johanna)) {
  console.log("");
  console.log("Johanna season: " + formatVoteBreakdown(season[johanna]) + " = " + season[johanna].pts + " pts");
  rounds.forEach((round) => {
    const { breakdown } = tallyBreakdownForRound(restoredVotes, players, teamId, round, nm);
    const row = breakdown[johanna] || { pts: 0, n3: 0, n2: 0, n1: 0 };
    if (row.pts) {
      console.log("  " + round + ": " + row.pts + " pts — " + formatVoteBreakdown(row));
    }
  });
}

process.exitCode = allOk ? 0 : 1;
