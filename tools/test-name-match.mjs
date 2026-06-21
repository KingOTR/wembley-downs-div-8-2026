/**
 * Quick smoke test for matchSquadToVoters (v156 participation logic).
 */
const nm = await import("../public/dist/name-match.js");
const { matchSquadToVoters, normalizeName } = nm;

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

console.log("name-match smoke test OK");
