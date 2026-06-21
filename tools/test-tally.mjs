/**
 * Regression test: results tally must not double-count duplicate ballots.
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nm = await import(pathToFileURL(join(here, "../public/dist/name-match.js")).href);
const { dedupeVotesOnePerSquad, displayPlayerName, isVoteExcludedFromTally } = nm;

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

var unmatchedBallot = [
  {
    id: "b-unmatched",
    teamId: 1,
    round: "Round 9",
    voterName: "Wrong Name",
    submittedAt: "2026-06-01T10:00:00.000Z",
    picks: ["Bob", "Carol", "Dave"],
    nameMatchStatus: "unmatched",
    tallyExcluded: true,
    adminApproved: false,
  },
];
var unmatchedPts = simulateUo(unmatchedBallot, dedupeForTally);
if (unmatchedPts.Bob || unmatchedPts.Carol || unmatchedPts.Dave) {
  throw new Error("unmatched ballot should not tally, got " + JSON.stringify(unmatchedPts));
}
var approvedUnmatched = [
  Object.assign({}, unmatchedBallot[0], { adminApproved: true, tallyExcluded: true }),
];
var approvedPts = simulateUo(approvedUnmatched, dedupeForTally);
if (approvedPts.Bob !== 3) {
  throw new Error("admin-approved unmatched ballot should tally, got " + JSON.stringify(approvedPts));
}
if (!isVoteExcludedFromTally(unmatchedBallot[0])) {
  throw new Error("isVoteExcludedFromTally should exclude unmatched");
}

var oldFallbackPts = tallyPoints(dedupeForTally(1, "Round 9", dupSameName) || dupSameName);
if (oldFallbackPts.Carol === 6) {
  throw new Error("dedupe returned empty and old || fallback would double-count");
}

var dupNoId = [
  {
    teamId: 1,
    round: "Round 9",
    voterName: "Bob",
    submittedAt: "2026-06-01T10:00:00.000Z",
    picks: ["Carol", "Dave", "Alice"],
  },
  {
    teamId: 1,
    round: "Round 9",
    voterName: "Bob",
    submittedAt: "2026-06-01T12:00:00.000Z",
    picks: ["Carol", "Dave", "Alice"],
  },
];
var noIdDeduped = dedupeForTally(1, "Round 9", dupNoId);
if (noIdDeduped.length !== 1) {
  throw new Error("id-less duplicate ballots should dedupe to 1, got " + noIdDeduped.length);
}
var noIdPts = simulateUo(dupNoId, dedupeForTally);
if (noIdPts.Carol !== 3) {
  throw new Error("id-less duplicate Bob should tally once, got " + JSON.stringify(noIdPts));
}

var {
  dedupeBallotPicks,
  ballotPicksHaveDuplicates,
  findDuplicateBallotPickNames,
} = nm;

var bobTriple = dedupeBallotPicks(["Bob", "Bob", "Bob"]);
if (bobTriple[0] !== "Bob" || bobTriple[1] || bobTriple[2]) {
  throw new Error("Bob,Bob,Bob should dedupe to Bob only in 3pt slot, got " + JSON.stringify(bobTriple));
}

var bobMixed = dedupeBallotPicks(["Alice", "Bob", "Bob"]);
if (bobMixed[0] !== "Alice" || bobMixed[1] !== "Bob" || bobMixed[2]) {
  throw new Error("Alice,Bob,Bob should keep Alice@3 Bob@2, got " + JSON.stringify(bobMixed));
}

var dupPickBallot = [
  {
    id: "b-dup-picks",
    teamId: 1,
    round: "Round 9",
    voterName: "Alice",
    submittedAt: "2026-06-01T10:00:00.000Z",
    picks: ["Bob", "Bob", "Bob"],
  },
];
function dedupeForTallySanitized(teamId, round, votes) {
  var sanitized = votes.map(function (v) {
    if (!ballotPicksHaveDuplicates(v.picks)) return v;
    return Object.assign({}, v, { picks: dedupeBallotPicks(v.picks) });
  });
  return dedupeForTally(teamId, round, sanitized);
}
var dupPickPts = simulateUo(dupPickBallot, dedupeForTallySanitized);
if (dupPickPts.Bob !== 3 || dupPickPts.Alice) {
  throw new Error("Bob,Bob,Bob ballot should tally Bob:3 only, got " + JSON.stringify(dupPickPts));
}

if (ballotPicksHaveDuplicates(["Bob", "Carol", "Dave"])) {
  throw new Error("expected no duplicate picks on valid ballot");
}
if (ballotPicksHaveDuplicates(["Bob", "Bob", "Carol"]) !== true) {
  throw new Error("expected duplicate picks detected on Bob,Bob,Carol");
}
if (!findDuplicateBallotPickNames(["Bob", "Bob", "Carol"]).includes("Bob")) {
  throw new Error("findDuplicateBallotPickNames should list Bob");
}

var { fixBallotsWithDuplicatePicks } = nm;
var migrationSample = [
  {
    id: "m1",
    teamId: 1,
    round: "Round 3",
    voterName: "Alice",
    picks: ["Bob", "Bob", "Bob"],
  },
  {
    id: "m2",
    teamId: 1,
    round: "Round 5",
    voterName: "Carol",
    picks: ["Dave", "Eve", "Frank"],
  },
  {
    id: "m3",
    teamId: 2,
    round: "Round 3",
    voterName: "Bob",
    picks: ["Alice", "Alice", "Dave"],
  },
];
var migrationResult = fixBallotsWithDuplicatePicks(migrationSample, function (v) {
  return String(v.round || "");
});
if (migrationResult.fixed !== 2) {
  throw new Error("migration should fix 2 ballots, got " + migrationResult.fixed);
}
if (migrationResult.byRound["1|Round 3"] !== 1 || migrationResult.byRound["2|Round 3"] !== 1) {
  throw new Error("migration byRound counts wrong: " + JSON.stringify(migrationResult.byRound));
}
if (migrationResult.votes[0].picks[0] !== "Bob" || migrationResult.votes[0].picks[1]) {
  throw new Error("migration should dedupe Bob triple to 3pt slot");
}

console.log("tally regression OK");
