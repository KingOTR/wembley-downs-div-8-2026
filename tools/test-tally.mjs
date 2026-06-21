/**
 * Regression test: results tally must not double-count duplicate ballots.
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nm = await import(pathToFileURL(join(here, "../public/dist/name-match.js")).href);
const { dedupeVotesOnePerSquad, displayPlayerName } = nm;

function voteRoundLabel(v) {
  return String(v.round || "").trim();
}

function tallyPoints(votes) {
  var m = {};
  votes.forEach(function (f) {
    var _ = f.picks || [];
    var E = [3, 2, 1];
    _.forEach(function (b, C) {
      if (!b) return;
      m[b] = (m[b] || 0) + (E[C] || 0);
    });
  });
  return m;
}

function simulateUo(votes, dedupeFn) {
  var h = votes;
  var _h = h;
  var _svT = dedupeFn(1, "Round 9", h);
  if (Array.isArray(_svT)) _h = _svT;
  return tallyPoints(_h);
}

function dedupeForTally(teamId, round, votes) {
  var out = dedupeVotesOnePerSquad(["Bob", "Carol", "Dave"], votes, teamId, round, voteRoundLabel);
  return out.votesForTally || [];
}

var single = [
  {
    id: "b1",
    teamId: 1,
    round: "Round 9",
    voterName: "Alice",
    submittedAt: "2026-06-01T10:00:00.000Z",
    picks: ["Bob", "Carol", "Dave"],
  },
];

var singlePts = simulateUo(single, dedupeForTally);
if (singlePts.Bob !== 3 || singlePts.Carol !== 2 || singlePts.Dave !== 1) {
  throw new Error("single ballot expected Bob:3 Carol:2 Dave:1 got " + JSON.stringify(singlePts));
}

var dupSameName = [
  {
    id: "b1",
    teamId: 1,
    round: "Round 9",
    voterName: "Bob",
    submittedAt: "2026-06-01T10:00:00.000Z",
    picks: ["Carol", "Dave", "Alice"],
  },
  {
    id: "b2",
    teamId: 1,
    round: "Round 9",
    voterName: "Bob",
    submittedAt: "2026-06-01T12:00:00.000Z",
    picks: ["Carol", "Dave", "Alice"],
  },
];

var deduped = dedupeForTally(1, "Round 9", dupSameName);
if (deduped.length !== 1) {
  throw new Error("expected 1 ballot after dedupe, got " + deduped.length);
}

var dupPts = simulateUo(dupSameName, dedupeForTally);
if (dupPts.Carol !== 3 || dupPts.Dave !== 2) {
  throw new Error("duplicate Bob ballots should tally once, got " + JSON.stringify(dupPts));
}

var oldFallbackPts = tallyPoints(dedupeForTally(1, "Round 9", dupSameName) || dupSameName);
if (oldFallbackPts.Carol === 6) {
  throw new Error("dedupe returned empty and old || fallback would double-count");
}

console.log("tally regression OK");
