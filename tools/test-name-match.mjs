/**
 * Quick smoke test for matchSquadToVoters (v156 participation logic).
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nm = await import(pathToFileURL(join(here, "../public/dist/name-match.js")).href);
const { matchSquadToVoters, normalizeName, findDuplicateBallotsPerSquad, dedupeVotesOnePerSquad, resolveCoachSlotForVoterName } = nm;

const squad = ["Jay", "Uli", "Sarah", "Sarah Goalkeeper", "Anna", "Erin", "Lauren"];
const votes = [
  { id: "1", teamId: 1, round: "Round 9", voterName: "Ulrika Delarve" },
  { id: "2", teamId: 1, round: "Round 9", voterName: "Johanna Frolinghaus" },
  { id: "3", teamId: 1, round: "Round 9", voterName: "Sarah" },
  { id: "4", teamId: 1, round: "Round 9", voterName: "Jay" },
  { id: "5", teamId: 1, round: "Round 9", voterName: "Coach" },
  { id: "6", teamId: 1, round: "Round 9", voterName: "Extra Person" },
  { id: "7", teamId: 1, round: "Round 9", voterName: "Anna" },
  { id: "8", teamId: 1, round: "Round 9", voterName: "Someone" },
  { id: "9", teamId: 1, round: "Round 9", voterName: "Another" },
];

function voteRoundLabel(v) {
  return String(v.round || "").trim();
}

var base = matchSquadToVoters(squad, votes, 1, "Round 9", voteRoundLabel);
console.log("base ballotCount", base.ballotCount, "votedSquad", base.votedSquad.length, "missing", base.missing.length);
if (base.ballotCount !== 9) throw new Error("expected 9 ballots");
if (base.votedSquad.indexOf("Uli") === -1) throw new Error("Ulrika should match Uli");

var withAlias = matchSquadToVoters(squad, votes, 1, "Round 9", voteRoundLabel, undefined, {
  aliases: { [normalizeName("Johanna Frolinghaus")]: "Jay" },
  excluded: ["Erin", "Lauren"],
});
if (withAlias.votedSquad.indexOf("Jay") === -1) throw new Error("alias should link Johanna to Jay");
if (withAlias.eligibleCount !== squad.length - 2) throw new Error("eligible should exclude Erin+Lauren");
if (withAlias.missing.indexOf("Erin") !== -1) throw new Error("Erin should not be in missing");

var dupVotes = [
  {
    id: "t1_rround-9_vuli",
    teamId: 1,
    round: "Round 9",
    voterName: "Uli",
    submittedAt: "2026-06-01T10:00:00.000Z",
    picks: ["Jay", "Anna", "Sarah"],
  },
  {
    id: "t1_rround-9_vulrika-delarve",
    teamId: 1,
    round: "Round 9",
    voterName: "Ulrika Delarve",
    submittedAt: "2026-06-01T12:00:00.000Z",
    picks: ["Jay", "Sarah", "Anna"],
  },
];
var dups = findDuplicateBallotsPerSquad(["Uli", "Jay"], dupVotes);
if (!dups.length || dups[0].squadName !== "Uli") throw new Error("expected Uli duplicate group");
if (dups[0].kept.ballot !== "Ulrika Delarve") throw new Error("latest ballot should win");
var deduped = dedupeVotesOnePerSquad(["Uli", "Jay"], dupVotes, 1, "Round 9", voteRoundLabel);
if (deduped.votesForTally.length !== 1) throw new Error("dedupe should keep one ballot for Uli");
var matchedDup = matchSquadToVoters(["Uli", "Jay"], dupVotes, 1, "Round 9", voteRoundLabel);
if (!matchedDup.duplicates || matchedDup.duplicates.length !== 1) throw new Error("match should report duplicates");
if (matchedDup.countedBallots !== 1) throw new Error("countedBallots should be 1");

var sameNameDup = [
  {
    id: "b1",
    teamId: 1,
    round: "Round 9",
    voterName: "Jay",
    submittedAt: "2026-06-01T10:00:00.000Z",
    picks: ["Anna", "Sarah", "Uli"],
  },
  {
    id: "b2",
    teamId: 1,
    round: "Round 9",
    voterName: "Jay",
    submittedAt: "2026-06-01T12:00:00.000Z",
    picks: ["Anna", "Sarah", "Uli"],
  },
];
var sameNameDeduped = dedupeVotesOnePerSquad(["Jay", "Anna"], sameNameDup, 1, "Round 9", voteRoundLabel);
if (sameNameDeduped.votesForTally.length !== 1) {
  throw new Error("voter matching squad name: expected 1 ballot for tally, got " + sameNameDeduped.votesForTally.length);
}

var team = { coach1Name: "Will", coach2Name: "Chris" };
var willSlot = resolveCoachSlotForVoterName("Will", team);
var chrisSlot = resolveCoachSlotForVoterName("Chris", team);
if (!willSlot || willSlot.slot !== 1) throw new Error("Will should be coach slot 1");
if (!chrisSlot || chrisSlot.slot !== 2) throw new Error("Chris should be coach slot 2");

console.log("name-match smoke test OK");
