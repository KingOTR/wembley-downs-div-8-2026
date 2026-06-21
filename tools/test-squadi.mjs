/**
 * Smoke test Squadi public API (no credentials).
 */
import { fetchWembleyFixtures, normalizeSquadiConfig } from "./squadi-lib.mjs";

var cfg = normalizeSquadiConfig({
  fixtureUrl:
    "https://registration.squadi.com/competitions?yearId=8&organisationKey=062d9386-ac59-4dd3-8692-7ff894465aa0&competitionUniqueKey=018c199d-a0b6-4e0a-be23-a7be9b68c0b0&divisionId=11766&teamId=107247",
  teamId: 107247,
  teamNameFilter: "Wembley Downs",
});

var fixtures = await fetchWembleyFixtures(cfg, { skipScorers: true });
if (!fixtures.length) throw new Error("expected Wembley fixtures");
if (fixtures.length !== 14) throw new Error("expected 14 fixtures for teamId 107247, got " + fixtures.length);
var withOpp = fixtures.filter(function (f) {
  return f.opponent && f.round;
});
if (!withOpp.length) throw new Error("expected mapped opponents");
console.log("squadi test OK —", fixtures.length, "fixtures");
withOpp.slice(0, 4).forEach(function (f) {
  console.log(" ", f.round, "vs", f.opponent, f.kickoff, f.groundName, f.ourScore != null ? f.ourScore + "-" + f.oppScore : "scheduled");
});
