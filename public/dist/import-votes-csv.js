/**
 * Shared CSV season tally → ballot reconstruction (Node + browser).
 */
import { canonicalPlayerName, displayPlayerName, voterNameKey } from "./name-match.js";

export const VOID_PICK = "";

export function roundKey(round) {
  const h = String(round || "").trim();
  const m = h.match(/^round\s*(\d+(?:\.\d+)?)$/i) || h.match(/^(\d+(?:\.\d+)?)$/);
  return m ? "Round " + m[1] : h;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseSeasonCsv(text) {
  const lines = String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  const headerIdx = lines.findIndex((l) => /^Round,/i.test(l));
  if (headerIdx < 0) throw new Error("CSV missing Round header row");
  const header = parseCsvLine(lines[headerIdx]);
  const players = header.slice(1).map((p) => displayPlayerName(p));
  const meta = { exportedAt: null, teamName: null };
  for (let i = 0; i < headerIdx; i++) {
    const parts = parseCsvLine(lines[i]);
    if (/^exported at$/i.test(parts[0]) && parts[1]) meta.exportedAt = parts[1].trim();
    if (/^team$/i.test(parts[0]) && parts[1]) meta.teamName = parts[1].trim();
  }
  const rounds = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (!parts[0]) continue;
    const round = roundKey(parts[0]);
    const totals = {};
    players.forEach((p, j) => {
      totals[p] = parseInt(parts[j + 1], 10) || 0;
    });
    rounds.push({
      round,
      totals,
      sum: Object.values(totals).reduce((a, b) => a + b, 0),
    });
  }
  return { meta, players, rounds };
}

/** Match app season CSV export: only squad-canonical picks count. */
export function squadKeyForExportPick(name, players) {
  if (!name) return null;
  const c = canonicalPlayerName(displayPlayerName(name));
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (
      voterNameKey(p) === voterNameKey(c) ||
      canonicalPlayerName(displayPlayerName(p)) === c ||
      displayPlayerName(p).toLowerCase() === c.toLowerCase()
    ) {
      return displayPlayerName(p);
    }
  }
  return null;
}

export function tallyLikeSeasonExport(ballots, players) {
  const m = Object.fromEntries(players.map((p) => [p, 0]));
  ballots.forEach((picks) => {
    (picks || []).forEach((pick, i) => {
      const key = squadKeyForExportPick(pick, players);
      if (key) m[key] = (m[key] || 0) + [3, 2, 1][i];
    });
  });
  return m;
}

function normalizePick(name, players) {
  if (!name) return VOID_PICK;
  const hit = squadKeyForExportPick(name, players);
  return hit || displayPlayerName(name);
}

function decomposeToBallots(players, totals, numBallots) {
  const rem = Object.fromEntries(players.map((p) => [p, totals[p] || 0]));
  const ballots = [];

  function search() {
    if (ballots.length === numBallots) {
      return players.every((p) => rem[p] === 0) ? ballots.slice() : null;
    }
    const order = players
      .slice()
      .sort((a, b) => (rem[b] || 0) - (rem[a] || 0) || a.localeCompare(b));
    for (const p3 of order) {
      if ((rem[p3] || 0) < 3) continue;
      for (const p2 of order) {
        if (p2 === p3 || (rem[p2] || 0) < 2) continue;
        for (const p1 of order) {
          if (p1 === p3 || p1 === p2 || (rem[p1] || 0) < 1) continue;
          rem[p3] -= 3;
          rem[p2] -= 2;
          rem[p1] -= 1;
          ballots.push([p3, p2, p1]);
          const r = search();
          if (r) return r;
          ballots.pop();
          rem[p3] += 3;
          rem[p2] += 2;
          rem[p1] += 1;
        }
      }
    }
    return null;
  }

  return search();
}

function lostPointsInBallot(picks, players) {
  let lost = 0;
  (picks || []).forEach((pick, i) => {
    if (!squadKeyForExportPick(pick, players)) lost += [3, 2, 1][i];
  });
  return lost;
}

/**
 * When CSV sum is not divisible by 6, the export likely dropped non-squad picks.
 * Use void (empty) pick slots so export-style tally matches CSV exactly.
 */
function solveBallotsForCsv(players, csvTotals, numBallots, lostPoints) {
  const rem = Object.fromEntries(players.map((p) => [p, csvTotals[p] || 0]));
  const ballots = [];
  const options = players.concat([VOID_PICK]);

  function search() {
    if (ballots.length === numBallots) {
      let lost = 0;
      ballots.forEach((b) => {
        lost += lostPointsInBallot(b, players);
      });
      if (lost !== lostPoints) return null;
      return players.every((p) => rem[p] === 0) ? ballots.map((b) => b.slice()) : null;
    }

    for (const p3 of options) {
      const k3 = squadKeyForExportPick(p3, players);
      if (k3 && (rem[k3] || 0) < 3) continue;
      for (const p2 of options) {
        if (p2 === p3 && p3 !== VOID_PICK) continue;
        const k2 = squadKeyForExportPick(p2, players);
        if (k2 && (rem[k2] || 0) < 2) continue;
        for (const p1 of options) {
          if ((p1 === p3 || p1 === p2) && p1 !== VOID_PICK) continue;
          const k1 = squadKeyForExportPick(p1, players);
          if (k1 && (rem[k1] || 0) < 1) continue;
          if (k3) rem[k3] -= 3;
          if (k2) rem[k2] -= 2;
          if (k1) rem[k1] -= 1;
          ballots.push([
            p3 === VOID_PICK ? VOID_PICK : displayPlayerName(p3),
            p2 === VOID_PICK ? VOID_PICK : displayPlayerName(p2),
            p1 === VOID_PICK ? VOID_PICK : displayPlayerName(p1),
          ]);
          const r = search();
          if (r) return r;
          ballots.pop();
          if (k3) rem[k3] += 3;
          if (k2) rem[k2] += 2;
          if (k1) rem[k1] += 1;
        }
      }
    }
    return null;
  }

  return search();
}

function planRoundBallots(players, csvTotals, sum) {
  if (!sum || sum < 1) {
    return { ballots: null, numBallots: 0, lostPoints: 0, notes: ["empty round"] };
  }
  const mod = sum % 6;
  const numBallots = mod === 0 ? sum / 6 : Math.ceil(sum / 6);
  const lostPoints = numBallots * 6 - sum;
  const notes = [];

  if (mod === 0) {
    const ballots = decomposeToBallots(players, csvTotals, numBallots);
    if (!ballots) notes.push("exact decomposition failed");
    return { ballots, numBallots, lostPoints: 0, notes };
  }

  notes.push(
    "csv sum " + sum + " uses " + numBallots + " ballot(s) with " + lostPoints + " void point(s)"
  );
  const ballots = solveBallotsForCsv(players, csvTotals, numBallots, lostPoints);
  if (!ballots) notes.push("void-slot solve failed");
  return { ballots, numBallots, lostPoints, notes };
}

function pickVoters(ballots, squad, totals, assignmentCount) {
  const used = new Set();
  const out = [];
  const counts = assignmentCount || Object.create(null);
  const zeroReceivers = squad.filter((p) => !(totals[p] || 0));

  function orderedZeroReceivers(pickKeys) {
    return zeroReceivers
      .filter((z) => !used.has(z) && !pickKeys.has(voterNameKey(z)))
      .sort((a, b) => {
        const ca = counts[a] || 0;
        const cb = counts[b] || 0;
        if (ca !== cb) return ca - cb;
        // Prefer Johanna for synthetic voter slots — CSV export drops her received points.
        if (a === "Johanna" && b !== "Johanna") return -1;
        if (b === "Johanna" && a !== "Johanna") return 1;
        return a.localeCompare(b);
      });
  }

  for (const picks of ballots) {
    const pickKeys = new Set(
      picks
        .filter(Boolean)
        .map((p) => voterNameKey(p))
        .filter(Boolean)
    );
    const prefer = squad.filter((s) => !used.has(s) && !pickKeys.has(voterNameKey(s)));
    const pool = prefer.length ? prefer : squad.filter((s) => !used.has(s));
    let voter = orderedZeroReceivers(pickKeys)[0] || null;
    if (!voter) voter = pool.sort((a, b) => a.localeCompare(b))[0];
    if (!voter) throw new Error("Not enough squad members for voter assignment");
    used.add(voter);
    out.push({
      voterName: voter,
      picks: picks.map((p) => normalizePick(p, squad)),
    });
  }
  return out;
}

export function voteDocIdFromBallot(v, teamId) {
  const tid = teamId != null ? teamId : v.teamId != null ? v.teamId : 1;
  const rk = voterNameKey(roundKey(v.round));
  const vk = v.voterNameKey || voterNameKey(v.voterName);
  return "t" + tid + "_r" + rk + "_v" + vk;
}

/** CSV tally export does not record voter identity — correct known mis-assignments. */
const VOTER_CORRECTIONS = [
  { round: "Round 9", to: "Elke", from: "Uli" },
];

export function applyVoterCorrections(votes, players) {
  const squad = players || [];
  VOTER_CORRECTIONS.forEach((fix) => {
    const rk = roundKey(fix.round);
    const toName = displayPlayerName(fix.to);
    const fromName = displayPlayerName(fix.from);
    if (!squad.some((p) => displayPlayerName(p) === toName)) return;
    const existing = votes.find(
      (v) => roundKey(v.round) === rk && voterNameKey(v.voterName) === voterNameKey(toName)
    );
    if (existing) return;
    const src = votes.find(
      (v) => roundKey(v.round) === rk && voterNameKey(v.voterName) === voterNameKey(fromName)
    );
    if (!src) return;
    src.voterName = toName;
    src.voterNameKey = voterNameKey(toName);
    src.id = voteDocIdFromBallot(src, src.teamId);
    src.recoveredFrom = (src.recoveredFrom || "csv-import") + "+voter-correction";
  });
  return votes;
}

export function reconstructVotesFromCsv(parsed, opts) {
  const options = opts || {};
  const teamId = options.teamId != null ? options.teamId : 1;
  const source = options.source || "csv-import";
  const { players, rounds, meta } = parsed;
  const votes = [];
  const report = { rounds: {}, warnings: [] };
  const assignmentCount = Object.create(null);

  for (const row of rounds) {
    const { round, totals: csvTotals, sum } = row;
    const plan = planRoundBallots(players, csvTotals, sum);
    if (plan.notes.length) {
      plan.notes.forEach((n) => report.warnings.push(round + ": " + n));
    }
    if (!plan.ballots || !plan.ballots.length) {
      report.rounds[round] = { ballots: 0, sum, status: "failed" };
      continue;
    }

    const tally = tallyLikeSeasonExport(plan.ballots, players);
    const mismatch = players.filter((p) => (tally[p] || 0) !== (csvTotals[p] || 0));
    if (mismatch.length) {
      report.warnings.push(round + ": tally mismatch after solve: " + mismatch.join(", "));
      report.rounds[round] = { ballots: 0, sum, status: "failed" };
      continue;
    }

    const assigned = pickVoters(plan.ballots, players, csvTotals, assignmentCount);
    const exportedAt = meta.exportedAt || new Date().toISOString();
    assigned.forEach((b) => {
      const voterName = displayPlayerName(b.voterName);
      assignmentCount[voterName] = (assignmentCount[voterName] || 0) + 1;
      const vote = {
        teamId,
        round,
        voterName,
        voterNameKey: voterNameKey(voterName),
        picks: b.picks.map((p) => (p ? displayPlayerName(p) : VOID_PICK)),
        submittedAt: exportedAt,
        nameMatchStatus: "matched",
        tallyExcluded: false,
        recoveredFrom: source,
      };
      vote.id = voteDocIdFromBallot(vote, teamId);
      votes.push(vote);
    });
    report.rounds[round] = {
      ballots: assigned.length,
      sum,
      tallySum: Object.values(tally).reduce((a, b) => a + b, 0),
      lostPoints: plan.lostPoints,
      status: "ok",
    };
  }
  applyVoterCorrections(votes, players);
  return { votes, report };
}

export function csvTextToArchive(text, opts) {
  const parsed = parseSeasonCsv(text);
  const { votes, report } = reconstructVotesFromCsv(parsed, opts);
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "csv-import",
    recoveryNote:
      "Reconstructed player ballots from season CSV tally export. Picks per voter are inferred; round totals match the CSV.",
    csvMeta: parsed.meta,
    importReport: report,
    votes,
    coachVotes: [],
  };
}
