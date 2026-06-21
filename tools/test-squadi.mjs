/**
 * Smoke test Squadi public API (no credentials).
 */
import { fetchWembleyFixtures, normalizeSquadiConfig } from "./squadi-lib.mjs";

var cfg = normalizeSquadiConfig({
  organisationKey: "27a1f3ab-90c1-4412-853f-d85c9b27967c",
  yearId: 7,
  competitionUniqueKey: "aab7d734-373a-4104-afac-7c816cf39b53",
  divisionId: 6300,
  teamNameFilter: "Wembley Downs",
});

var fixtures = await fetchWembleyFixtures(cfg, { skipScorers: true });
if (!fixtures.length) throw new Error("expected Wembley fixtures");
var withOpp = fixtures.filter(function (f) {
  return f.opponent && f.round;
});
if (!withOpp.length) throw new Error("expected mapped opponents");
console.log("squadi test OK —", fixtures.length, "fixtures,", withOpp[0].round, "vs", withOpp[0].opponent);
