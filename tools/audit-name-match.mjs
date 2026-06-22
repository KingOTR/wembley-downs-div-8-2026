/**
 * Full name-matching audit: squad roster, ballots, picks, coach votes, Firestore.
 *
 * Usage:
 *   node tools/audit-name-match.mjs
 *   node tools/audit-name-match.mjs --json-only
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  firebaseConfigFromApp,
  fetchFirestoreVotes,
  fetchFirestoreCoachVotes,
} from "./firestore-rest.mjs";
import { canonicalForTally, loadNameMatch } from "./tally-breakdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const jsonOnly = process.argv.includes("--json-only");

const SQUAD = [
  "Erin",
  "Lauren",
  "Sophie",
  "Sarah (tall)",
  "Anna",
  "Ann",
  "Jane",
  "Uli",
  "Johanna",
  "Elke",
  "Freame",
  "Abi",
  "Emma",
  "Erika",
  "Taryn (C)",
  "Rainy",
  "Jess",
  "Sarah Goalkeeper",
  "Kat",
];

const nm = await loadNameMatch();
const {
  NAME_ALIASES,
  DEFAULT_SQUAD_THRESHOLD,
  STRICT_SQUAD_THRESHOLD,
  displayPlayerName,
  normalizeName,
  findSquadMatch,
  classifyBallotNameMatch,
  findAmbiguousByFirstName,
  nameSimilarity,
  explainSquadMismatch,
  voterNameKey,
  ballotPickKey,
  canonicalPlayerName,
  nameParts,
} = nm;

function isPrefixCollision(a, b) {
  const pa = nameParts(a).first;
  const pb = nameParts(b).first;
  if (!pa || !pb || pa === pb) return false;
  const shorter = pa.length <= pb.length ? pa : pb;
  const longer = pa.length > pb.length ? pa : pb;
  return longer.startsWith(shorter) && shorter.length >= 2;
}

function canon(name) {
  return canonicalForTally(name, SQUAD, nm);
}

function resolvePick(name) {
  const raw = displayPlayerName(name);
  if (!raw) return { raw: "", canonical: "", status: "empty" };
  const tally = canon(raw);
  const hit = findSquadMatch(raw, SQUAD, STRICT_SQUAD_THRESHOLD);
  if (hit && hit.match) {
    const matched = displayPlayerName(hit.match);
    const aliased = tally !== raw && tally === matched;
    return {
      raw,
      canonical: matched,
      status: hit.exact && !aliased ? "matched" : aliased ? "aliased" : "fuzzy",
      reason: hit.reason,
      similarity: hit.similarity,
    };
  }
  if (tally && tally !== raw && SQUAD.includes(tally)) {
    return {
      raw,
      canonical: tally,
      status: "aliased",
      reason: "global alias / tally canonical",
    };
  }
  const ambig = findAmbiguousByFirstName(raw, SQUAD);
  if (ambig) {
    return {
      raw,
      canonical: null,
      status: "ambiguous",
      reason: "shared first name: " + ambig.join(" | "),
      candidates: ambig,
    };
  }
  const best = bestSquadSimilarity(raw);
  return {
    raw,
    canonical: null,
    status: "unmatched",
    reason: explainSquadMismatch(raw, SQUAD, STRICT_SQUAD_THRESHOLD),
    nearest: best,
  };
}

function resolveVoter(name, aliases = {}) {
  const cls = classifyBallotNameMatch(name, SQUAD, { aliases });
  const hit = findSquadMatch(name, SQUAD, DEFAULT_SQUAD_THRESHOLD);
  return {
    raw: displayPlayerName(name),
    nameMatchStatus: cls.nameMatchStatus,
    matchedPlayer: cls.matchedPlayer,
    tallyExcluded: cls.tallyExcluded,
    reason: cls.reason,
    similarity: hit ? hit.similarity : null,
    aliased: cls.reason === "global alias" || cls.reason === "admin alias",
  };
}

function bestSquadSimilarity(raw) {
  let best = null;
  let bestSim = 0;
  for (const p of SQUAD) {
    const sim = nameSimilarity(raw, p);
    if (sim > bestSim) {
      bestSim = sim;
      best = p;
    }
  }
  return best ? { player: best, similarity: Math.round(bestSim * 100) / 100 } : null;
}

function findCollisionsForString(raw) {
  const hits = [];
  for (const p of SQUAD) {
    const sim = nameSimilarity(raw, p);
    if (sim >= DEFAULT_SQUAD_THRESHOLD) hits.push({ player: p, similarity: sim });
  }
  hits.sort((a, b) => b.similarity - a.similarity);
  return hits.length > 1 ? hits : null;
}

function globalAliasesForPlayer(player) {
  const out = [];
  const pk = normalizeName(player);
  for (const [key, target] of Object.entries(NAME_ALIASES)) {
    const tk = normalizeName(target);
    if (tk === pk || displayPlayerName(target).toLowerCase() === player.toLowerCase()) {
      out.push(key);
    }
  }
  return out;
}

function prefixCollisionPairs() {
  const pairs = [];
  for (let i = 0; i < SQUAD.length; i++) {
    for (let j = i + 1; j < SQUAD.length; j++) {
      if (isPrefixCollision(SQUAD[i], SQUAD[j])) {
        pairs.push([SQUAD[i], SQUAD[j]]);
      }
    }
  }
  return pairs;
}

function collectNameStrings(votes, coachVotes) {
  const items = [];
  const add = (str, kind, meta) => {
    const raw = displayPlayerName(str);
    if (!raw) return;
    items.push({ raw, kind, ...meta });
  };
  for (const v of votes || []) {
    add(v.voterName, "voterName", {
      source: v._source || "votes",
      round: v.round,
      id: v.id,
      adminApproved: v.adminApproved,
      storedStatus: v.nameMatchStatus,
    });
    for (const p of v.picks || []) add(p, "pick", { source: v._source || "votes", round: v.round, id: v.id });
  }
  for (const cv of coachVotes || []) {
    for (const p of cv.picks || []) {
      add(p, "coachPick", { source: cv._source || "coach", round: cv.round, slot: cv.slot, id: cv.id });
    }
  }
  return items;
}

function uniqueStrings(items) {
  const seen = new Map();
  for (const it of items) {
    const k = it.raw.toLowerCase();
    if (!seen.has(k)) seen.set(k, { raw: it.raw, kinds: new Set(), occurrences: 0, samples: [] });
    const e = seen.get(k);
    e.kinds.add(it.kind);
    e.occurrences++;
    if (e.samples.length < 5) e.samples.push({ kind: it.kind, round: it.round, id: it.id, source: it.source });
  }
  return [...seen.values()].map((e) => ({
    raw: e.raw,
    kinds: [...e.kinds],
    occurrences: e.occurrences,
    samples: e.samples,
  }));
}

// --- load data ---
const restoredPath = join(root, "data/restored-votes.json");
const coachSnapPath = join(root, "data/coach-votes-firestore-snapshot.json");

let restoredVotes = [];
if (existsSync(restoredPath)) {
  restoredVotes = (JSON.parse(readFileSync(restoredPath, "utf8")).votes || []).map((v) => ({
    ...v,
    _source: "restored",
  }));
}

let coachSnapshot = [];
if (existsSync(coachSnapPath)) {
  coachSnapshot = (JSON.parse(readFileSync(coachSnapPath, "utf8")).coachVotes || []).map((v) => ({
    ...v,
    _source: "coach-snapshot",
  }));
}

const cfg = firebaseConfigFromApp();
let firestoreVotes = [];
let firestoreCoach = [];
let firestoreErr = null;
let fsOnlyCoach = [];
try {
  firestoreVotes = (await fetchFirestoreVotes(cfg.projectId, cfg.apiKey)).map((v) => ({
    ...v,
    _source: "firestore",
  }));
  firestoreCoach = (await fetchFirestoreCoachVotes(cfg.projectId, cfg.apiKey)).map((v) => ({
    ...v,
    _source: "firestore-coach",
  }));
} catch (e) {
  firestoreErr = e.message || String(e);
}

fsOnlyCoach = firestoreCoach
  .filter((fc) => !coachSnapshot.some((cs) => cs.id && fc.id && cs.id === fc.id))
  .map((v) => ({ ...v, _source: "firestore-coach-only" }));

const allVotes = [...restoredVotes];
const fsOnlyVotes = firestoreVotes.filter(
  (fv) => !restoredVotes.some((rv) => rv.id && fv.id && rv.id === fv.id)
);
allVotes.push(...fsOnlyVotes.map((v) => ({ ...v, _source: "firestore-only" })));

const allCoach = [];
const coachSeen = new Set();
for (const cv of [...coachSnapshot, ...fsOnlyCoach]) {
  const key = cv.id || JSON.stringify([cv.round, cv.slot, cv.teamId]);
  if (coachSeen.has(key)) continue;
  coachSeen.add(key);
  allCoach.push(cv);
}

const nameItems = collectNameStrings(allVotes, allCoach);
const unique = uniqueStrings(nameItems);

// --- per-string analysis ---
const stringAnalysis = unique.map((u) => {
  const voterRes = u.kinds.includes("voterName") ? resolveVoter(u.raw) : null;
  const pickRes = u.kinds.some((k) => k === "pick" || k === "coachPick") ? resolvePick(u.raw) : null;
  const tallyCanon = canon(u.raw);
  const collisions = findCollisionsForString(u.raw);
  const ambig = findAmbiguousByFirstName(u.raw, SQUAD);
  return {
    string: u.raw,
    kinds: u.kinds,
    occurrences: u.occurrences,
    samples: u.samples,
    tallyCanonical: tallyCanon,
    voterNameKey: voterNameKey(u.raw),
    ballotPickKey: ballotPickKey(u.raw, SQUAD),
    voter: voterRes,
    pick: pickRes,
    ambiguousFirstName: ambig,
    fuzzyCollisions: collisions,
    issues: [],
  };
});

// --- per-player report ---
const perPlayer = SQUAD.map((player) => {
  const globalAliases = globalAliasesForPlayer(player);
  const voterBallots = [];
  const pickRefs = [];
  const aliasStrings = new Set(globalAliases);

  for (const v of allVotes) {
    const vr = resolveVoter(v.voterName);
    if (vr.matchedPlayer === player) {
      voterBallots.push({
        voterName: v.voterName,
        round: v.round,
        id: v.id,
        source: v._source,
        status: vr.nameMatchStatus,
        reason: vr.reason,
        storedStatus: v.nameMatchStatus,
        adminApproved: v.adminApproved,
      });
    }
    (v.picks || []).forEach((p, idx) => {
      const pr = resolvePick(p);
      if (pr.canonical === player) {
        pickRefs.push({
          pick: p,
          slot: ["3", "2", "1"][idx],
          round: v.round,
          voterName: v.voterName,
          id: v.id,
          status: pr.status,
          reason: pr.reason,
        });
      }
    });
  }

  for (const cv of allCoach) {
    (cv.picks || []).forEach((p, idx) => {
      const pr = resolvePick(p);
      if (pr.canonical === player) {
        pickRefs.push({
          pick: p,
          slot: ["3", "2", "1"][idx],
          round: cv.round,
          coachSlot: cv.slot,
          id: cv.id,
          status: pr.status,
          reason: pr.reason,
          coach: true,
        });
      } else if (pr.status === "ambiguous" && (pr.candidates || []).includes(player)) {
        pickRefs.push({
          pick: p,
          slot: ["3", "2", "1"][idx],
          round: cv.round,
          coachSlot: cv.slot,
          id: cv.id,
          status: "ambiguous",
          reason: pr.reason,
          coach: true,
        });
      }
    });
  }

  // strings that resolve to this player via canon but aren't exact roster name
  for (const sa of stringAnalysis) {
    if (sa.tallyCanonical === player && sa.string !== player) aliasStrings.add(sa.string);
    if (sa.voter && sa.voter.matchedPlayer === player && sa.string !== player) aliasStrings.add(sa.string);
    if (sa.pick && sa.pick.canonical === player && sa.string !== player) aliasStrings.add(sa.string);
  }

  const uniqueVoterNames = [...new Set(voterBallots.map((b) => b.voterName))];
  const ambiguousPicks = pickRefs.filter((p) => p.status === "ambiguous");
  const fuzzyPicks = pickRefs.filter((p) => p.status === "fuzzy" || p.status === "aliased");

  return {
    canonicalName: player,
    tallyKey: canon(player),
    voterNameKey: voterNameKey(player),
    ballotPickKey: ballotPickKey(player, SQUAD),
    globalAliases: globalAliases,
    allAliasStrings: [...aliasStrings].sort(),
    voterBallots: voterBallots.length,
    uniqueVoterNames,
    pickReferences: pickRefs.length,
    pickSamples: pickRefs.slice(0, 8),
    ambiguousPicks,
    fuzzyPicks,
  };
});

// --- flag issues ---
const issues = [];
const riskyPairings = prefixCollisionPairs().map(([a, b]) => ({
  type: "prefix-collision",
  players: [a, b],
  note: "First names are strict prefixes (Ann/Anna rule); fuzzy match blocked at 0%",
}));

for (const sa of stringAnalysis) {
  if (sa.voter && sa.voter.nameMatchStatus === "unmatched") {
    issues.push({
      severity: "high",
      type: "unmatched-voter",
      string: sa.string,
      reason: sa.voter.reason,
      occurrences: sa.occurrences,
      samples: sa.samples,
    });
  }
  if (sa.pick && sa.pick.status === "unmatched") {
    issues.push({
      severity: "high",
      type: "unmatched-pick",
      string: sa.string,
      reason: sa.pick.reason,
      occurrences: sa.occurrences,
      samples: sa.samples,
    });
  }
  if (sa.pick && sa.pick.status === "ambiguous") {
    issues.push({
      severity: "high",
      type: "ambiguous-pick",
      string: sa.string,
      candidates: sa.pick.candidates,
      occurrences: sa.occurrences,
      samples: sa.samples,
    });
  }
  if (sa.voter && sa.ambiguousFirstName) {
    issues.push({
      severity: "medium",
      type: "ambiguous-voter",
      string: sa.string,
      candidates: sa.ambiguousFirstName,
      note: "Bare shared first name — requires disambiguator e.g. (tall) or Goalkeeper",
      samples: sa.samples,
    });
  }
  if (sa.fuzzyCollisions) {
    issues.push({
      severity: "medium",
      type: "fuzzy-collision",
      string: sa.string,
      matches: sa.fuzzyCollisions.map((c) => ({
        player: c.player,
        pct: Math.round(c.similarity * 100),
      })),
    });
  }
  if (sa.pick && sa.pick.status === "fuzzy") {
    issues.push({
      severity: "low",
      type: "fuzzy-pick",
      string: sa.string,
      canonical: sa.pick.canonical,
      reason: sa.pick.reason,
      similarity: sa.pick.similarity,
    });
  }
  if (sa.voter && sa.voter.nameMatchStatus === "fuzzy") {
    issues.push({
      severity: "low",
      type: "fuzzy-voter",
      string: sa.string,
      matchedPlayer: sa.voter.matchedPlayer,
      reason: sa.voter.reason,
    });
  }
}

// pending approval / wrong-name from firestore
const pendingApproval = allVotes.filter(
  (v) =>
    v.nameMatchStatus === "unmatched" ||
    v.tallyExcluded === true ||
    (v.adminApproved === false && v.nameMatchStatus === "unmatched")
);
const adminApprovedUnmatched = allVotes.filter(
  (v) => v.nameMatchStatus === "unmatched" && v.adminApproved === true
);

// near-misses: similarity 60-71% (below threshold)
const nearMisses = [];
for (const u of unique) {
  const best = bestSquadSimilarity(u.raw);
  if (!best) continue;
  const pickOk = resolvePick(u.raw).canonical;
  const voterOk = resolveVoter(u.raw).matchedPlayer;
  if (pickOk || voterOk) continue;
  if (best.similarity >= 0.6 && best.similarity < DEFAULT_SQUAD_THRESHOLD) {
    nearMisses.push({ string: u.raw, nearest: best.player, similarity: best.similarity });
  }
}

// coach bare Sarah check
for (const cv of allCoach) {
  (cv.picks || []).forEach((p) => {
    if (/^sarah$/i.test(displayPlayerName(p))) {
      issues.push({
        severity: "high",
        type: "coach-ambiguous-sarah",
        string: p,
        round: cv.round,
        slot: cv.slot,
        id: cv.id,
        candidates: findAmbiguousByFirstName(p, SQUAD),
      });
    }
  });
}

const HYPOTHETICAL_STRINGS = [
  "Jay",
  "johanna frolinghaus",
  "Johanna Frolinghaus",
  "Ulrika",
  "Ulrika Delarve",
  "Rainey",
  "Sarah",
  "Sarah (tall)",
  "Sarah Goalkeeper",
  "Sarah GK",
  "Ann",
  "Anna",
  "Ash",
  "Olivia Freame",
  "Freame",
];

const aliasProbes = HYPOTHETICAL_STRINGS.map((s) => ({
  string: s,
  tallyCanonical: canon(s),
  voter: resolveVoter(s),
  pick: resolvePick(s),
  voterNameKey: voterNameKey(s),
  ballotPickKey: ballotPickKey(s, SQUAD),
  ambiguous: findAmbiguousByFirstName(s, SQUAD),
}));

const report = {
  generatedAt: new Date().toISOString(),
  squad: SQUAD,
  squadSize: SQUAD.length,
  rules: {
    globalAliases: NAME_ALIASES,
    defaultThreshold: DEFAULT_SQUAD_THRESHOLD,
    strictThreshold: STRICT_SQUAD_THRESHOLD,
    prefixCollisionPairs: riskyPairings,
    sarahDisambiguation:
      "Bare 'Sarah' is ambiguous; use 'Sarah (tall)' or 'Sarah Goalkeeper' / 'Sarah GK'",
    johannaNote:
      "jay→Johanna only when Jay not on roster; Johanna Frolinghaus matches Johanna directly",
    annAnnaNote: "Ann and Anna are prefix-collision blocked from cross-matching",
  },
  sources: {
    restoredVotes: restoredVotes.length,
    firestoreVotes: firestoreVotes.length,
    firestoreOnlyVotes: fsOnlyVotes.length,
    coachSnapshot: coachSnapshot.length,
    firestoreCoach: firestoreCoach.length,
    firestoreErr,
  },
  ballotCounts: {
    restored: restoredVotes.length,
    firestore: firestoreVotes.length,
    coach: allCoach.length,
    uniqueNameStrings: unique.length,
  },
  perPlayer,
  stringAnalysis,
  aliasProbes,
  issues,
  nearMisses,
  pendingApproval: pendingApproval.map((v) => ({
    id: v.id,
    voterName: v.voterName,
    round: v.round,
    source: v._source,
    nameMatchStatus: v.nameMatchStatus,
    tallyExcluded: v.tallyExcluded,
    adminApproved: v.adminApproved,
    nameMatchReason: v.nameMatchReason,
  })),
  adminApprovedUnmatched: adminApprovedUnmatched.map((v) => ({
    id: v.id,
    voterName: v.voterName,
    round: v.round,
    source: v._source,
  })),
  summary: {
    issueCount: issues.length,
    highSeverity: issues.filter((i) => i.severity === "high").length,
    unmatchedVoters: issues.filter((i) => i.type === "unmatched-voter").length,
    unmatchedPicks: issues.filter((i) => i.type === "unmatched-pick").length,
    ambiguousPicks: issues.filter((i) => i.type === "ambiguous-pick").length,
    ambiguousVoters: issues.filter((i) => i.type === "ambiguous-voter").length,
    nearMissCount: nearMisses.length,
    allRestoredMatched: restoredVotes.every(
      (v) => classifyBallotNameMatch(v.voterName, SQUAD).nameMatchStatus !== "unmatched"
    ),
    allPickStringsResolved: stringAnalysis
      .filter((s) => s.kinds.some((k) => k === "pick" || k === "coachPick"))
      .every((s) => s.pick && s.pick.status !== "unmatched" && s.pick.status !== "ambiguous"),
  },
};

const outPath = join(root, "data/name-match-audit.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));

if (!jsonOnly) {
  console.log("=== Name Match Audit ===");
  console.log("Squad:", SQUAD.length, "players");
  console.log(
    "Ballots: restored",
    restoredVotes.length,
    "| firestore",
    firestoreVotes.length,
    firestoreErr ? "(" + firestoreErr + ")" : ""
  );
  console.log("Coach votes:", allCoach.length);
  console.log("Unique name strings:", unique.length);
  console.log("");
  console.log("Global aliases:", JSON.stringify(NAME_ALIASES));
  console.log("Prefix collision pairs:", riskyPairings.map((p) => p.players.join(" ↔ ")).join("; "));
  console.log("");
  console.log("--- Alias probes (hypothetical) ---");
  for (const p of aliasProbes) {
    const v = p.voter.matchedPlayer ? "voter→" + p.voter.matchedPlayer : "voter:" + p.voter.nameMatchStatus;
    const pk = p.pick.canonical ? "pick→" + p.pick.canonical : "pick:" + p.pick.status;
    console.log(p.string, "| tally:", p.tallyCanonical, "|", v, "|", pk);
  }
  console.log("");
  console.log("--- Per player ---");
  for (const p of perPlayer) {
    console.log("");
    console.log(p.canonicalName);
    console.log("  tally key:", p.tallyKey, "| voterNameKey:", p.voterNameKey);
    if (p.globalAliases.length) console.log("  global aliases:", p.globalAliases.join(", "));
    if (p.allAliasStrings.length)
      console.log("  strings seen:", p.allAliasStrings.join(", "));
    console.log(
      "  voter ballots:",
      p.voterBallots,
      p.uniqueVoterNames.length ? "(" + p.uniqueVoterNames.join(", ") + ")" : ""
    );
    console.log("  pick refs:", p.pickReferences);
    if (p.ambiguousPicks.length)
      console.log("  ⚠ ambiguous picks:", JSON.stringify(p.ambiguousPicks));
    if (p.fuzzyPicks.length) console.log("  ~ fuzzy picks:", p.fuzzyPicks.length);
  }
  console.log("");
  console.log("--- Issues (" + issues.length + ", high=" + report.summary.highSeverity + ") ---");
  for (const i of issues) {
    console.log("[" + i.severity + "] " + i.type + ": " + (i.string || i.players?.join("/") || ""));
    if (i.reason) console.log("  " + i.reason);
    if (i.candidates) console.log("  candidates: " + (Array.isArray(i.candidates) ? i.candidates.join(" | ") : i.candidates));
    if (i.matches) console.log("  matches: " + i.matches.map((m) => m.player + " " + m.pct + "%").join(", "));
    if (i.round) console.log("  round:", i.round, "slot:", i.slot);
  }
  if (nearMisses.length) {
    console.log("");
    console.log("--- Near misses ---");
    for (const n of nearMisses) {
      console.log(n.string, "→", n.nearest, "(" + Math.round(n.similarity * 100) + "%)");
    }
  }
  if (pendingApproval.length) {
    console.log("");
    console.log("--- Pending / excluded ballots ---");
    for (const v of pendingApproval) {
      console.log(v.voterName, v.round, v.nameMatchStatus, v._source);
    }
  }
  console.log("");
  console.log("Summary:", JSON.stringify(report.summary));
  console.log("Written:", outPath);
}

process.exitCode = report.summary.highSeverity > 0 ? 1 : 0;
