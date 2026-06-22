/**
 * Reconstruct player vote ballots from season CSV tally export (Export all rounds).
 *
 * Usage:
 *   node tools/import-votes-csv.mjs [path-to.csv]
 *   node tools/import-votes-csv.mjs --upload
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dataDir = join(root, "data");
const PROJECT = "wembley-downs-div-8-2026";
const DEFAULT_CSV =
  process.env.VOTES_CSV ||
  "C:/Users/sydne/OneDrive/Desktop/Div_8_all_rounds.csv";
const doUpload = process.argv.includes("--upload");
const doUpsert = process.argv.includes("--upsert") || doUpload;
const doSync = process.argv.includes("--sync");
const csvPath = process.argv.find((a) => a.endsWith(".csv")) || DEFAULT_CSV;

const lib = await import(
  pathToFileURL(join(root, "public/dist/import-votes-csv.js")).href
);
const { parseSeasonCsv, reconstructVotesFromCsv } = lib;

if (!existsSync(csvPath)) {
  console.error("CSV not found:", csvPath);
  process.exit(1);
}

const raw = readFileSync(csvPath, "utf8");
const parsed = parseSeasonCsv(raw);
const { votes, report } = reconstructVotesFromCsv(parsed, {
  source: "csv:" + csvPath.split(/[/\\]/).pop(),
});

const archive = {
  exportVersion: 1,
  exportedAt: new Date().toISOString(),
  source: "tools/import-votes-csv.mjs",
  recoveryNote:
    "Reconstructed player ballots from season CSV tally export (" +
    csvPath +
    "). Picks per voter are inferred; totals per round match the CSV.",
  csvMeta: parsed.meta,
  importReport: report,
  votes,
  coachVotes: [],
};

mkdirSync(dataDir, { recursive: true });
mkdirSync(join(root, "public/data"), { recursive: true });
const outPath = join(dataDir, "restored-votes.json");
const pubPath = join(root, "public/data/restored-votes.json");
writeFileSync(outPath, JSON.stringify(archive, null, 2) + "\n");
writeFileSync(pubPath, JSON.stringify(archive, null, 2) + "\n");

console.log("CSV structure:");
console.log("  meta:", parsed.meta);
console.log("  players:", parsed.players.length, parsed.players.join(", "));
console.log("  rounds:", parsed.rounds.length);
console.log("\nVotes per round:");
Object.keys(report.rounds)
  .sort(
    (a, b) =>
      parseFloat(a.replace(/\D/g, "")) - parseFloat(b.replace(/\D/g, ""))
  )
  .forEach((r) => {
    const x = report.rounds[r];
    console.log(
      " ",
      r + ":",
      x.ballots,
      "ballots",
      "(" + x.status + ", csv sum " + x.sum + ")"
    );
  });
console.log("\nTotal player ballots:", votes.length);
if (report.warnings.length) {
  console.log("\nWarnings:");
  report.warnings.forEach((w) => console.log(" -", w));
}

async function uploadVotes(list, opts) {
  const options = opts || {};
  const sync = options.sync === true;
  let admin;
  try {
    const mod = await import("firebase-admin");
    admin = mod.default;
    if (!admin.getApps().length) admin.initializeApp({ projectId: PROJECT });
  } catch (e) {
    throw new Error(
      "firebase-admin init failed — run: gcloud auth application-default login"
    );
  }
  const db = admin.firestore();
  let uploaded = 0;
  let updated = 0;
  let skipped = 0;
  const wantIds = new Set(list.map((v) => v.id));
  for (const v of list) {
    const ref = db.collection("votes").doc(v.id);
    const snap = await ref.get();
    const payload = {
      teamId: v.teamId,
      voterName: v.voterName,
      voterNameKey: v.voterNameKey,
      round: v.round,
      picks: v.picks,
      submittedAt: v.submittedAt,
      nameMatchStatus: v.nameMatchStatus,
      tallyExcluded: v.tallyExcluded,
      recoveredFrom: v.recoveredFrom,
    };
    if (!snap.exists) {
      await ref.set(payload);
      uploaded++;
    } else if (sync) {
      await ref.set(payload);
      updated++;
    } else {
      skipped++;
    }
  }
  let deleted = 0;
  if (sync) {
    const snap = await db.collection("votes").where("teamId", "==", 1).get();
    for (const doc of snap.docs) {
      if (!wantIds.has(doc.id)) {
        await doc.ref.delete();
        deleted++;
      }
    }
  }
  return { uploaded, updated, skipped, deleted };
}

if (doUpload || doSync) {
  const up = await uploadVotes(votes, { sync: doSync });
  console.log("\nFirestore upload:", up);
} else {
  console.log("\nWrote", outPath);
  console.log("Import via Admin → Import votes (JSON), or run with --upload");
}
