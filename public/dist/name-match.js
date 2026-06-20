/**
 * Fuzzy name matching for squad / voter names (shared by voter-enhancements + admin-merge-rounds).
 */
export function normalizeName(c) {
  return String(c || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function nameParts(name) {
  var parts = normalizeName(name).split(" ").filter(Boolean);
  if (!parts.length) return { first: "", last: "", initial: "" };
  var first = parts[0];
  var last = parts.length > 1 ? parts[parts.length - 1] : "";
  return { first: first, last: last, initial: last ? last.charAt(0) : "" };
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  var row = [];
  for (var i = 0; i <= b.length; i++) row[i] = i;
  for (var j = 1; j <= a.length; j++) {
    var prev = row[0];
    row[0] = j;
    for (var k = 1; k <= b.length; k++) {
      var tmp = row[k];
      row[k] = Math.min(row[k] + 1, row[k - 1] + 1, prev + (a.charAt(j - 1) === b.charAt(k - 1) ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

export function nameSimilarity(a, b) {
  var na = normalizeName(a);
  var nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  var pa = nameParts(a);
  var pb = nameParts(b);

  if (pa.first && pb.first && pa.first === pb.first) {
    if (pa.last && pb.last && pa.last === pb.last) return 1;
    if (pa.initial && pb.initial && pa.initial === pb.initial) return 0.93;
    if (!pa.last || !pb.last) {
      if (pa.initial && pb.initial && pa.initial === pb.initial) return 0.9;
    }
  }

  if (pa.first.length === 1 && pb.first.startsWith(pa.first) && pa.initial === pb.initial) return 0.88;
  if (pb.first.length === 1 && pa.first.startsWith(pb.first) && pa.initial === pb.initial) return 0.88;

  var dist = levenshtein(na, nb);
  var maxLen = Math.max(na.length, nb.length);
  return maxLen ? 1 - dist / maxLen : 0;
}

export function namesMatch(a, b, threshold) {
  return nameSimilarity(a, b) >= (threshold == null ? 0.82 : threshold);
}

export function findSquadMatch(voterName, players, threshold) {
  var th = threshold == null ? 0.82 : threshold;
  var exact = (players || []).find(function (p) {
    return normalizeName(p) === normalizeName(voterName);
  });
  if (exact) return { match: exact, exact: true, similarity: 1 };

  var best = null;
  var bestSim = 0;
  (players || []).forEach(function (p) {
    var sim = nameSimilarity(voterName, p);
    if (sim >= th && sim > bestSim) {
      bestSim = sim;
      best = p;
    }
  });
  if (best) return { match: best, exact: false, similarity: bestSim };
  return null;
}

/** Map squad player -> voter ballot name for this round (exact or fuzzy). */
export function matchSquadToVoters(squad, votes, teamId, roundLabel, voteRoundLabelFn) {
  var voted = [];
  var missing = [];
  var possible = [];
  var usedVoters = Object.create(null);

  (squad || []).forEach(function (player) {
    var hit = null;
    (votes || []).forEach(function (v) {
      if (!v || String(v.teamId) !== String(teamId)) return;
      if (voteRoundLabelFn(v) !== voteRoundLabelFn({ round: roundLabel })) return;
      var vn = v.voterName || "";
      if (usedVoters[normalizeName(vn)]) return;
      var m = findSquadMatch(vn, [player]);
      if (m) hit = { voterName: vn, squadName: player, exact: m.exact, similarity: m.similarity };
    });
    if (hit) {
      usedVoters[normalizeName(hit.voterName)] = true;
      if (hit.exact) voted.push(hit.voterName);
      else {
        voted.push(hit.voterName);
        possible.push(hit.voterName + " ≈ " + hit.squadName);
      }
    } else {
      missing.push(player);
    }
  });

  var extraVoters = [];
  (votes || []).forEach(function (v) {
    if (!v || String(v.teamId) !== String(teamId)) return;
    if (voteRoundLabelFn(v) !== voteRoundLabelFn({ round: roundLabel })) return;
    var vn = v.voterName || "";
    if (usedVoters[normalizeName(vn)]) return;
    var onSquad = findSquadMatch(vn, squad);
    if (onSquad) {
      if (!onSquad.exact) possible.push(vn + " ≈ " + onSquad.match);
      voted.push(vn);
      usedVoters[normalizeName(vn)] = true;
    } else {
      extraVoters.push(vn);
    }
  });

  return { voted: voted, missing: missing, possible: possible, extraVoters: extraVoters };
}
