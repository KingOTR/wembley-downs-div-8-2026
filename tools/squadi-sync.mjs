#!/usr/bin/env node
/**
 * Sync Wembley Downs fixtures/results from Squadi → config/main matchesByRound.
 *
 * Usage:
 *   node tools/squadi-sync.mjs --config squadi-config.json --dry-run
 *   node tools/squadi-sync.mjs --config squadi-config.json --print
 *   node tools/squadi-sync.mjs --config squadi-config.json --write
 *
 * --write requires GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON
 * pointing at a Firebase service account with Firestore write access.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  fetchWembleyFixtures,
  mergeFixturesIntoMatchesByRound,
  normalizeSquadiConfig,
} from "./squadi-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name) {
  var i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function loadConfig() {
  var configPath = arg("--config") || path.join(root, "squadi-config.json");
  if (!existsSync(configPath)) {
    console.error("Missing config:", configPath);
    console.error("Copy squadi-config.example.json → squadi-config.json");
    process.exit(1);
  }
  var raw = JSON.parse(readFileSync(configPath, "utf8"));
  return {
    teamId: raw.teamId != null ? raw.teamId : 1,
    squadi: normalizeSquadiConfig(raw.squadi || raw),
  };
}

async function writeFirestore(teamId, squadi) {
  var saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  var credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  var admin;
  try {
    admin = await import("firebase-admin");
  } catch {
    console.error("firebase-admin not installed. Run: npm install firebase-admin --save-dev");
    process.exit(1);
  }

  if (!admin.apps.length) {
    if (saJson) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
    } else if (credPath && existsSync(credPath)) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS for --write");
      process.exit(1);
    }
  }

  var db = admin.firestore();
  var ref = db.doc("config/main");
  var snap = await ref.get();
  if (!snap.exists) throw new Error("config/main not found");
  var data = snap.data();
  if (!Array.isArray(data.teams)) throw new Error("config/main teams missing");

  var idx = data.teams.findIndex(function (t) {
    return String(t.id) === String(teamId);
  });
  if (idx < 0) throw new Error("team id " + teamId + " not in config/main");

  var team = data.teams[idx];
  var fixtures = (await fetchWembleyFixtures(squadi, { squad: team.players || [] })).fixtures;
  team.squadi = squadi;
  team.matchesByRound = mergeFixturesIntoMatchesByRound(team.matchesByRound, fixtures);
  data.teams[idx] = team;
  data.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  data.version = 2;

  await ref.set(data, { merge: true });
  console.log("Wrote", fixtures.length, "fixture(s) to config/main team", teamId);
}

async function main() {
  var cfg = loadConfig();
  console.log("Squadi sync — team", cfg.teamId, cfg.squadi.teamNameFilter);
  console.log("Competition:", cfg.squadi.competitionUniqueKey, "division", cfg.squadi.divisionId);

  var syncOut = await fetchWembleyFixtures(cfg.squadi);
  var fixtures = syncOut.fixtures;
  console.log("Found", fixtures.length, "Wembley fixture(s) (Round", syncOut.minRound, "+)");
  if (syncOut.skippedGradingRounds) {
    console.log(
      "Skipped",
      syncOut.skippedGradingRounds,
      "grading round(s) before Round",
      syncOut.minRound
    );
  }

  var matchesByRound = mergeFixturesIntoMatchesByRound({}, fixtures);

  if (hasFlag("--print") || hasFlag("--dry-run")) {
    console.log(JSON.stringify({ teamId: cfg.teamId, squadi: cfg.squadi, matchesByRound: matchesByRound }, null, 2));
  }

  fixtures.slice(0, 8).forEach(function (fx) {
    console.log(
      " ",
      fx.round,
      "vs",
      fx.opponent,
      fx.ourScore != null ? fx.ourScore + "-" + fx.oppScore : "(scheduled)",
      fx.kickoff,
      fx.groundName,
      fx.scorers && fx.scorers.length ? "scorers:" + fx.scorers.join(", ") : ""
    );
  });

  if (hasFlag("--write")) {
    await writeFirestore(cfg.teamId, cfg.squadi);
  } else if (!hasFlag("--dry-run") && !hasFlag("--print")) {
    console.log("\nDry run (use --write to push to Firestore).");
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
