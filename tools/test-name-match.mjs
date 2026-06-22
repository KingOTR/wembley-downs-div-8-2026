/**
 * Quick smoke test for matchSquadToVoters (v156 participation logic).
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nm = await import(pathToFileURL(join(here, "../public/dist/name-match.js")).href);
const { matchSquadToVoters, normalizeName, findDuplicateBallotsPerSquad, dedupeVotesOnePerSquad, resolveCoachSlotForVoterName, classifyBallotNameMatch, isVoteExcludedFromTally, formatGoalScorerDisplayName, formatGoalScorerList, voterNameKey, findSquadMatch, displayPlayerName, ballotPickKey, canonicalPlayerName, STRICT_SQUAD_THRESHOLD } = nm;

const squad = ["Jay", "Uli", "Sarah (tall)", "Sarah Goalkeeper", "Anna", "Erin", "Lauren", "Olivia Freame"];
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

var unmatched = classifyBallotNameMatch("Totally Unknown", squad);
if (unmatched.nameMatchStatus !== "unmatched" || !unmatched.tallyExcluded) {
  throw new Error("unknown name should be unmatched and tallyExcluded");
}
var matched = classifyBallotNameMatch("Anna", squad);
if (matched.nameMatchStatus !== "matched" || matched.tallyExcluded) {
  throw new Error("Anna should match squad and count in tally");
}
var excludedVote = { nameMatchStatus: "unmatched", tallyExcluded: true, adminApproved: false };
if (!isVoteExcludedFromTally(excludedVote)) throw new Error("unmatched vote should be excluded");
var approvedVote = { nameMatchStatus: "unmatched", tallyExcluded: true, adminApproved: true };
if (isVoteExcludedFromTally(approvedVote)) throw new Error("admin-approved vote should count");

if (formatGoalScorerDisplayName("Olivia Freame", squad) !== "Freame") {
  throw new Error("Olivia Freame should display as Freame");
}
if (formatGoalScorerDisplayName("Anna Smith", squad) !== "Anna") {
  throw new Error("Anna should display as first name");
}
if (formatGoalScorerDisplayName("Sarah (tall)", squad) !== "Sarah (tall)") {
  throw new Error("ambiguous Sarah (tall) should use full squad name");
}
var sarahGk = formatGoalScorerDisplayName("Sarah Goalkeeper", squad);
if (sarahGk !== "Sarah Goalkeeper") {
  throw new Error("ambiguous Sarah should use full squad name, got " + sarahGk);
}
var formatted = formatGoalScorerList(["Olivia Freame", "Ulrika Delarve"], squad);
if (formatted[0] !== "Freame" || formatted[1] !== "Uli") {
  throw new Error("formatGoalScorerList failed: " + formatted.join(", "));
}

var tallSarah = findSquadMatch("Sarah (tall)", squad);
if (!tallSarah || displayPlayerName(tallSarah.match) !== "Sarah (tall)") {
  throw new Error("Sarah (tall) should match field Sarah, not goalkeeper");
}
var gkSarah = findSquadMatch("Sarah Goalkeeper", squad);
if (!gkSarah || displayPlayerName(gkSarah.match) !== "Sarah Goalkeeper") {
  throw new Error("Sarah Goalkeeper should match goalkeeper");
}
if (voterNameKey("Sarah (tall)") === voterNameKey("Sarah Goalkeeper")) {
  throw new Error("voterNameKey must distinguish tall Sarah from goalkeeper");
}
if (voterNameKey("Sarah Goalkeeper") !== "sarah-gk") {
  throw new Error("Sarah Goalkeeper voterNameKey should be sarah-gk, got " + voterNameKey("Sarah Goalkeeper"));
}
if (voterNameKey("Sarah") === voterNameKey("Sarah Goalkeeper")) {
  throw new Error("bare Sarah voterNameKey must not equal Sarah Goalkeeper");
}

var bareSarah = findSquadMatch("Sarah", squad);
if (bareSarah) {
  throw new Error("bare Sarah must not auto-match a squad player, got " + displayPlayerName(bareSarah.match));
}
var bareClass = classifyBallotNameMatch("Sarah", squad);
if (bareClass.nameMatchStatus !== "unmatched" || !bareClass.tallyExcluded) {
  throw new Error("bare Sarah should be unmatched and tallyExcluded");
}
if (ballotPickKey("Sarah (tall)", squad) === ballotPickKey("Sarah Goalkeeper", squad)) {
  throw new Error("ballot pick keys must distinguish Sarah (tall) from Sarah Goalkeeper");
}
var gkPick = findSquadMatch("Sarah GK", squad);
if (!gkPick || displayPlayerName(gkPick.match) !== "Sarah Goalkeeper") {
  throw new Error("Sarah GK should match Sarah Goalkeeper");
}
var tallVotes = [
  { id: "t1", teamId: 1, round: "Round 9", voterName: "Sarah (tall)", picks: ["Jay", "Anna", "Uli"] },
];
var tallMatch = matchSquadToVoters(squad, tallVotes, 1, "Round 9", voteRoundLabel);
if (tallMatch.votedSquad.indexOf("Sarah (tall)") === -1 || tallMatch.votedSquad.indexOf("Sarah Goalkeeper") !== -1) {
  throw new Error("Sarah (tall) ballot should map to Sarah (tall) only");
}

var { ballotPicksHaveDuplicates, validateBallotPicks, findDuplicateBallotPickNames } = nm;
var roster = ["Robert Smith", "Jay", "Anna"];
if (!ballotPicksHaveDuplicates(["Bob", "Robert Smith", "Jay"], roster)) {
  throw new Error("nickname Bob vs Robert Smith should be duplicate on ballot");
}
if (!validateBallotPicks(["bob", "BOB", "Anna"], roster)) {
  throw new Error("case-only duplicate should fail validation");
}
var guestDups = findDuplicateBallotPickNames(["Guest", "guest", "Anna"], roster);
if (guestDups.length !== 1) {
  throw new Error("guest case duplicate should list one dup, got " + JSON.stringify(guestDups));
}

var annAnnaSquad = ["Jay", "Ann", "Anna", "Uli"];
var annHit = findSquadMatch("Ann", annAnnaSquad);
if (!annHit || displayPlayerName(annHit.match) !== "Ann") {
  throw new Error("Ann ballot must match Ann only, got " + (annHit && annHit.match));
}
var annaHit = findSquadMatch("Anna", annAnnaSquad);
if (!annaHit || displayPlayerName(annaHit.match) !== "Anna") {
  throw new Error("Anna ballot must match Anna only, got " + (annaHit && annaHit.match));
}
if (findSquadMatch("Ann", ["Anna"])) {
  throw new Error("Ann must not fuzzy-match lone squad Anna");
}
if (findSquadMatch("Anna", ["Ann"])) {
  throw new Error("Anna must not fuzzy-match lone squad Ann");
}
if (voterNameKey("Ann") === voterNameKey("Anna")) {
  throw new Error("voterNameKey must distinguish Ann from Anna");
}
if (ballotPickKey("Ann", annAnnaSquad) === ballotPickKey("Anna", annAnnaSquad)) {
  throw new Error("ballotPickKey must distinguish Ann from Anna");
}
var annAnnaVotes = [
  { id: "a1", teamId: 1, round: "Round 9", voterName: "Ann" },
  { id: "a2", teamId: 1, round: "Round 9", voterName: "Anna" },
];
var annAnnaMatch = matchSquadToVoters(annAnnaSquad, annAnnaVotes, 1, "Round 9", voteRoundLabel);
if (annAnnaMatch.votedSquad.indexOf("Ann") === -1 || annAnnaMatch.votedSquad.indexOf("Anna") === -1) {
  throw new Error("both Ann and Anna must appear in votedSquad: " + annAnnaMatch.votedSquad.join(", "));
}
if (annAnnaMatch.possible.some(function (p) { return p.indexOf("Anna → Ann") !== -1 || p.indexOf("Ann → Anna") !== -1; })) {
  throw new Error("Ann/Anna must not cross-map in who-voted: " + annAnnaMatch.possible.join("; "));
}

var sarahDupVotes = [
  { id: "sg1", teamId: 1, round: "Round 9", voterName: "Sarah Goalkeeper", voterNameKey: "sarah-gk", submittedAt: "2026-06-22T01:49:00Z" },
  { id: "sg2", teamId: 1, round: "Round 9", voterName: "Sarah Goalkeeper", voterNameKey: "sarah-gk", submittedAt: "2026-06-22T01:49:00Z" },
  { id: "st1", teamId: 1, round: "Round 9", voterName: "Sarah (tall)", voterNameKey: "sarah-tall", submittedAt: "2026-06-22T01:49:00Z" },
  { id: "st2", teamId: 1, round: "Round 9", voterName: "Sarah (tall)", voterNameKey: "sarah-tall", submittedAt: "2026-06-22T01:49:00Z" },
];
var sarahSquadDups = findDuplicateBallotsPerSquad(squad, sarahDupVotes);
if (sarahSquadDups.length !== 2) {
  throw new Error("Sarah dup groups must be separate per squad member, got " + sarahSquadDups.length);
}
sarahSquadDups.forEach(function (d) {
  var names = d.ballotNames || [];
  if (d.squadName === "Sarah (tall)" && names.some(function (n) { return /goalkeeper/i.test(n); })) {
    throw new Error("Sarah (tall) group must not include goalkeeper ballots");
  }
  if (d.squadName === "Sarah Goalkeeper" && names.some(function (n) { return /\(tall\)/i.test(n); })) {
    throw new Error("Sarah Goalkeeper group must not include tall ballots");
  }
});
var sarahMatch = matchSquadToVoters(squad, sarahDupVotes, 1, "Round 9", voteRoundLabel);
if (sarahMatch.voterDocDuplicates.length !== 2) {
  throw new Error("expected 2 voter-doc duplicate groups for stacked Sarah imports, got " + sarahMatch.voterDocDuplicates.length);
}
if (sarahMatch.voterDocDuplicates.some(function (d) { return /goalkeeper/i.test(d.voterName) && /tall/i.test(d.voterName); })) {
  throw new Error("voter doc duplicate groups must not merge Sarah (tall) and Sarah Goalkeeper");
}

var div8Squad = [
  "Erin", "Lauren", "Sophie", "Sarah (tall)", "Anna", "Ann", "Jane", "Uli",
  "Johanna", "Elke", "Freame", "Abi", "Emma", "Erika", "Taryn (C)", "Rainy",
  "Jess", "Sarah Goalkeeper", "Kat",
];
var jfClass = classifyBallotNameMatch("Johanna Frolinghaus", div8Squad);
if (jfClass.nameMatchStatus === "unmatched" || jfClass.tallyExcluded) {
  throw new Error("Johanna Frolinghaus must match squad Johanna (not Jay alias)");
}
if (jfClass.matchedPlayer !== "Johanna") {
  throw new Error("Johanna Frolinghaus should match Johanna, got " + jfClass.matchedPlayer);
}
var jfWho = matchSquadToVoters(div8Squad, [
  { id: "jf1", teamId: 1, round: "Round 9", voterName: "Johanna Frolinghaus" },
], 1, "Round 9", voteRoundLabel);
if (jfWho.votedSquad.indexOf("Johanna") === -1) {
  throw new Error("Johanna Frolinghaus ballot should count in who-voted for Johanna");
}

// Guard: admin alias must not override a real squad member ballot (prevents hiding votes).
var johannaOverride = matchSquadToVoters(div8Squad, [
  { id: "jf2", teamId: 1, round: "Round 9", voterName: "Johanna" },
], 1, "Round 9", voteRoundLabel, undefined, {
  aliases: { [normalizeName("Johanna")]: "Jay" },
});
if (johannaOverride.votedSquad.indexOf("Johanna") === -1 || johannaOverride.votedSquad.indexOf("Jay") !== -1) {
  throw new Error("Johanna ballot must remain Johanna even with alias override");
}

// Guard: alias targets must exist on squad (no mapping to non-roster nicknames).
var ulrikaOnly = ["Ulrika Delarve"];
var ulrikaClass = classifyBallotNameMatch("Ulrika", ulrikaOnly);
if (ulrikaClass.nameMatchStatus === "unmatched" || ulrikaClass.tallyExcluded) {
  throw new Error("Ulrika should match squad Ulrika Delarve even if NAME_ALIASES has ulrika->Uli");
}
if (ulrikaClass.matchedPlayer !== "Ulrika Delarve") {
  throw new Error("Ulrika should match Ulrika Delarve, got " + ulrikaClass.matchedPlayer);
}

// Guard: ambiguous admin alias target must not auto-map (needs disambiguator).
var ambigSarah = ["Sarah (tall)", "Sarah Goalkeeper"];
var ambigClass = classifyBallotNameMatch("Unknown", ambigSarah, {
  aliases: { [normalizeName("Unknown")]: "Sarah" },
});
if (ambigClass.nameMatchStatus !== "unmatched" || !ambigClass.tallyExcluded) {
  throw new Error("ambiguous alias target Sarah must not auto-map; should remain unmatched");
}

function canonicalForTally(name, squad) {
  var base = canonicalPlayerName(name, squad && squad.length ? squad : undefined);
  if (squad && squad.length) {
    var hit = findSquadMatch(base, squad, STRICT_SQUAD_THRESHOLD);
    if (!hit) hit = findSquadMatch(name, squad, STRICT_SQUAD_THRESHOLD);
    if (hit && hit.match) return displayPlayerName(hit.match);
  }
  return base;
}
if (canonicalForTally("Ulrika", ["Jay", "Uli", "Anna"]) !== "Uli") {
  throw new Error("canonicalForTally should resolve Ulrika → Uli with squad context");
}
if (canonicalForTally("Rainey", div8Squad) !== "Rainy") {
  throw new Error("canonicalForTally should resolve Rainey → Rainy on div8 squad");
}
if (canonicalForTally("Johanna Frolinghaus", div8Squad) !== "Johanna") {
  throw new Error("canonicalForTally Johanna Frolinghaus should stay Johanna, not alias to Jay");
}
if (canonicalForTally("Jay", div8Squad) !== "Johanna") {
  throw new Error("canonicalForTally Jay should resolve to Johanna when Jay is not on squad");
}

console.log("name-match smoke test OK");
