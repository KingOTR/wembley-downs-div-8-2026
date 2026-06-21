/**
 * Smoke test Squadi public API (no credentials).
 */
import {
  fetchWembleyFixtures,
  normalizeSquadiConfig,
  parseRoundNumber,
  isCompetitiveRound,
  mergeFixturesIntoMatchesByRound,
} from "./squadi-lib.mjs";

if (parseRoundNumber("Round 7") !== 7) throw new Error("parseRoundNumber Round 7");
if (parseRoundNumber("Round 8") !== 8) throw new Error("parseRoundNumber Round 8");
if (isCompetitiveRound("Round 7", 8)) throw new Error("Round 7 should be grading");
if (!isCompetitiveRound("Round 8", 8)) throw new Error("Round 8 should be competitive");
if (!isCompetitiveRound("Semi Final", 8)) throw new Error("named finals should pass through");

if (isCompetitiveRound("Round 1", 8) || isCompetitiveRound("Round 7", 8)) {
  throw new Error("rounds 1-7 must be excluded");
}

var merged = mergeFixturesIntoMatchesByRound(
  {
    "Round 9": {
      lat: -31.96,
      lng: 115.82,
      locationLabel: "Rosalie Park, Subiaco",
      suburb: "Subiaco",
      groundName: "Rosalie Park",
      kickoff: "2026-06-21T10:00",
    },
  },
  [
    {
      round: "Round 9",
      opponent: "Test FC",
      kickoff: "2026-06-21T11:00",
      suburb: "",
      groundName: "Wrong Ground",
      venue: "Wrong Ground-Field 1",
      lat: null,
      lng: null,
      squadiMatchId: 1,
      squadiSyncedAt: new Date().toISOString(),
    },
  ]
);
if (merged["Round 9"].lat !== -31.96 || merged["Round 9"].lng !== 115.82) {
  throw new Error("Squadi merge must preserve user lat/lng pin");
}
if (merged["Round 9"].groundName !== "Rosalie Park") {
  throw new Error("Squadi merge must preserve user ground when pinned");
}
if (merged["Round 9"].kickoff !== "2026-06-21T11:00") {
  throw new Error("Squadi merge should update kickoff");
}

var manualMerge = mergeFixturesIntoMatchesByRound(
  {
    "Round 9": {
      scorers: ["Jay", "Sarah Goalkeeper"],
      goalscorersManual: true,
      ourScore: 2,
      oppScore: 1,
    },
  },
  [
    {
      round: "Round 9",
      opponent: "Test FC",
      ourScore: 3,
      oppScore: 0,
      scorers: ["Johanna", "Ulrika"],
      squadiMatchId: 2,
      squadiSyncedAt: new Date().toISOString(),
    },
  ]
);
if (manualMerge["Round 9"].scorers.join() !== "Jay,Sarah Goalkeeper") {
  throw new Error("Squadi merge must not overwrite manual goalscorers");
}
if (!manualMerge["Round 9"].goalscorersManual) {
  throw new Error("goalscorersManual flag must be preserved");
}

var cfgMin1 = normalizeSquadiConfig({
  fixtureUrl:
    "https://registration.squadi.com/competitions?yearId=8&organisationKey=062d9386-ac59-4dd3-8692-7ff894465aa0&competitionUniqueKey=018c199d-a0b6-4e0a-be23-a7be9b68c0b0&divisionId=11766&teamId=107247",
  teamId: 107247,
  minRound: 1,
});
var allOut = await fetchWembleyFixtures(cfgMin1, { skipScorers: true });
if (allOut.fixtures.length < 14) throw new Error("minRound 1 should include all team fixtures");

var cfg = normalizeSquadiConfig({
  fixtureUrl:
    "https://registration.squadi.com/competitions?yearId=8&organisationKey=062d9386-ac59-4dd3-8692-7ff894465aa0&competitionUniqueKey=018c199d-a0b6-4e0a-be23-a7be9b68c0b0&divisionId=11766&teamId=107247",
  teamId: 107247,
  teamNameFilter: "Wembley Downs",
  minRound: 8,
});

if (cfg.minRound !== 8) throw new Error("expected minRound 8");

var out = await fetchWembleyFixtures(cfg, { skipScorers: true });
var fixtures = out.fixtures;
if (!fixtures.length) throw new Error("expected Wembley fixtures");

fixtures.forEach(function (f) {
  var n = parseRoundNumber(f.round);
  if (n != null && n < 8) throw new Error("grading round imported: " + f.round);
});

if (fixtures.length !== 14) {
  throw new Error("expected 14 competitive fixtures (Round 8+), got " + fixtures.length);
}

console.log("squadi test OK —", fixtures.length, "imported,", out.skippedGradingRounds, "grading rounds skipped");
fixtures.slice(0, 4).forEach(function (f) {
  console.log(" ", f.round, "vs", f.opponent, f.kickoff, f.groundName, f.ourScore != null ? f.ourScore + "-" + f.oppScore : "scheduled");
});
