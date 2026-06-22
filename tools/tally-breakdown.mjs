/**
 * Shared tally + 3/2/1 breakdown — mirrors app Uo() / __svDedupeVotesForTally pipeline.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

export function voteRoundLabel(v) {
  const r = String((v && v.round) || "").trim();
  const m = r.match(/round\s*(\d+)/i);
  return m ? "round-" + m[1] : r.toLowerCase().replace(/\s+/g, "-");
}

export function formatVoteBreakdown(row) {
  if (!row) return "—";
  const parts = [];
  if (row.n3) parts.push(row.n3 + "×3");
  if (row.n2) parts.push(row.n2 + "×2");
  if (row.n1) parts.push(row.n1 + "×1");
  return parts.length ? parts.join(", ") : "—";
}

export function canonicalForTally(name, squad, nm) {
  const base = nm.canonicalPlayerName(name, squad && squad.length ? squad : undefined);
  if (squad && squad.length) {
    let hit = nm.findSquadMatch(base, squad, nm.STRICT_SQUAD_THRESHOLD);
    if (!hit) hit = nm.findSquadMatch(name, squad, nm.STRICT_SQUAD_THRESHOLD);
    if (hit && hit.match) return nm.displayPlayerName(hit.match);
  }
  return base;
}

/** Count 3/2/1 picks per squad player from deduped ballots. */
export function tallyBreakdownFromBallots(ballots, squad, canonFn) {
  const m = Object.create(null);
  const weights = [3, 2, 1];
  const slotKey = ["n3", "n2", "n1"];

  (ballots || []).forEach((vote) => {
    (vote.picks || []).forEach((pick, i) => {
      if (!pick) return;
      const key = canonFn(pick);
      if (!key) return;
      if (!m[key]) m[key] = { pts: 0, n3: 0, n2: 0, n1: 0 };
      m[key].pts += weights[i] || 0;
      m[key][slotKey[i]]++;
    });
  });

  (squad || []).forEach((p) => {
    const key = canonFn(p);
    if (key && !m[key]) m[key] = { pts: 0, n3: 0, n2: 0, n1: 0 };
  });

  return m;
}

/** Full pipeline: voter-doc dedupe → squad dedupe → breakdown. */
export function tallyBreakdownForRound(votes, squad, teamId, round, nm) {
  const canon = (name) => canonicalForTally(name, squad, nm);
  const voterDeduped = nm.dedupeBallotDocsOnePerVoter(
    votes || [],
    teamId,
    round,
    voteRoundLabel
  );
  let merged = voterDeduped.votesForTally || [];
  if (squad && squad.length) {
    const squadDeduped = nm.dedupeVotesOnePerSquad(
      squad,
      merged,
      teamId,
      round,
      voteRoundLabel
    );
    merged = squadDeduped.votesForTally || [];
  }
  return {
    breakdown: tallyBreakdownFromBallots(merged, squad, canon),
    ballots: merged,
    ballotCount: merged.length,
  };
}

export async function loadNameMatch() {
  return import(pathToFileURL(join(root, "public/dist/name-match.js")).href);
}
