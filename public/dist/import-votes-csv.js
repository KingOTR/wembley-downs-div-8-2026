/**
 * Shared CSV season tally → ballot reconstruction (Node + browser).
 */
import { canonicalPlayerName, displayPlayerName, voterNameKey } from "./name-match.js";

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

function normalizePick(name, players) {
  const c = canonicalPlayerName(displayPlayerName(name));
  const hit = players.find(
    (p) =>
      voterNameKey(p) === voterNameKey(c) ||
      displayPlayerName(p).toLowerCase() === c.toLowerCase()
  );
  return hit || c;
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

function repairTotals(players, totals) {
  const rem = Object.fromEntries(players.map((p) => [p, totals[p] || 0]));
  let sum = Object.values(rem).reduce((a, b) => a + b, 0);
  const notes = [];
  while (sum % 6 !== 0 && sum > 0) {
    const mod = sum % 6;
    const need = mod <= 3 ? 6 - mod : -(mod - 6);
    const target = players.slice().sort((a, b) => (rem[b] || 0) - (rem[a] || 0))[0];
    rem[target] = Math.max(0, (rem[target] || 0) + need);
    sum += need;
    notes.push("adjusted " + target + " by " + need);
  }
  return { totals: rem, notes, numBallots: sum / 6 };
}

function pickVoters(ballots, squad, totals) {
  const used = new Set();
  const out = [];
  const zeroReceivers = squad.filter((p) => !(totals[p] || 0));
  let zIdx = 0;

  for (const picks of ballots) {
    const pickKeys = new Set(picks.map((p) => voterNameKey(p)));
    const prefer = squad.filter((s) => !used.has(s) && !pickKeys.has(voterNameKey(s)));
    const pool = prefer.length ? prefer : squad.filter((s) => !used.has(s));
    let voter = null;
    while (zIdx < zeroReceivers.length && !used.has(zeroReceivers[zIdx])) {
      const z = zeroReceivers[zIdx++];
      if (!pickKeys.has(voterNameKey(z))) {
        voter = z;
        break;
      }
    }
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

export function reconstructVotesFromCsv(parsed, opts) {
  const options = opts || {};
  const teamId = options.teamId != null ? options.teamId : 1;
  const source = options.source || "csv-import";
  const { players, rounds, meta } = parsed;
  const votes = [];
  const report = { rounds: {}, warnings: [] };

  for (const row of rounds) {
    const { round, totals: rawTotals, sum } = row;
    const repaired = repairTotals(players, rawTotals);
    const numBallots = repaired.numBallots;
    if (!numBallots || numBallots < 1) {
      report.warnings.push(round + ": no ballots (sum=" + sum + ")");
      report.rounds[round] = { ballots: 0, sum, status: "empty" };
      continue;
    }
    if (repaired.notes.length) {
      report.warnings.push(round + ": " + repaired.notes.join("; "));
    }
    const ballots = decomposeToBallots(players, repaired.totals, numBallots);
    if (!ballots) {
      report.warnings.push(round + ": decomposition failed (sum=" + sum + ")");
      report.rounds[round] = { ballots: 0, sum, status: "failed" };
      continue;
    }
    const assigned = pickVoters(ballots, players, repaired.totals);
    const exportedAt = meta.exportedAt || new Date().toISOString();
    assigned.forEach((b) => {
      const voterName = displayPlayerName(b.voterName);
      const vote = {
        teamId,
        round,
        voterName,
        voterNameKey: voterNameKey(voterName),
        picks: b.picks.map((p) => displayPlayerName(p)),
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
      status: "ok",
    };
  }
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
