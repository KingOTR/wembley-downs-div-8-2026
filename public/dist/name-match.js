/**
 * Fuzzy name matching for squad / voter names (shared by voter-enhancements + admin-merge-rounds).
 */
export const DEFAULT_SQUAD_THRESHOLD = 0.72;
export const STRICT_SQUAD_THRESHOLD = 0.82;

/** Collapse whitespace and trim for display. */
export function displayPlayerName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip (C), (tall), Goalkeeper suffixes etc. before fuzzy matching. */
export function stripNameQualifiers(name) {
  return displayPlayerName(name)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+(goalkeeper|gk|captain|capt|c)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeName(c) {
  return stripNameQualifiers(c).toLowerCase();
}

export function nameParts(name) {
  var parts = normalizeName(name).split(" ").filter(Boolean);
  if (!parts.length) return { first: "", last: "", initial: "", parts: [] };
  var first = parts[0];
  var last = parts.length > 1 ? parts[parts.length - 1] : "";
  return { first: first, last: last, initial: last ? last.charAt(0) : "", parts: parts };
}

/** Common nicknames → canonical first name fragment */
var NICKNAME_ALIASES = {
  alex: ["alexander", "alexandra", "alexis"],
  al: ["alan", "albert", "alfred", "alexander"],
  ben: ["benjamin", "benedict"],
  bill: ["william", "willy", "will"],
  bob: ["robert", "bobby"],
  chris: ["christopher", "christian", "christine", "christina"],
  dan: ["daniel", "danny"],
  dave: ["david", "davey"],
  ed: ["edward", "edwin", "eddie"],
  harry: ["harold", "henry", "harrison"],
  jack: ["john", "jackson", "jacob"],
  jim: ["james", "jimmy"],
  joe: ["joseph", "joey"],
  jon: ["jonathan", "john"],
  josh: ["joshua"],
  kate: ["katherine", "kathryn", "catherine"],
  liz: ["elizabeth", "lizzy"],
  matt: ["matthew", "matty"],
  mike: ["michael", "mikey"],
  nick: ["nicholas", "nicolas"],
  pat: ["patrick", "patricia"],
  sam: ["samuel", "samantha"],
  steve: ["stephen", "steven"],
  tom: ["thomas", "tommy"],
  will: ["william", "willy"],
  uli: ["ulrika"],
  ulrika: ["uli"],
  jane: ["janet"],
};

function nicknameMatch(a, b) {
  var pa = nameParts(a);
  var pb = nameParts(b);
  if (!pa.first || !pb.first) return 0;
  if (pa.first === pb.first) return 0.92;
  var aliasesA = NICKNAME_ALIASES[pa.first] || [];
  var aliasesB = NICKNAME_ALIASES[pb.first] || [];
  if (aliasesA.indexOf(pb.first) !== -1 || aliasesB.indexOf(pa.first) !== -1) return 0.9;
  if (pa.first.length >= 3 && pb.first.startsWith(pa.first)) return 0.86;
  if (pb.first.length >= 3 && pa.first.startsWith(pb.first)) return 0.86;
  return 0;
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
    if (!pa.last || !pb.last) return 0.88;
    if (pa.last && pb.last && pa.last.charAt(0) === pb.last.charAt(0)) return 0.86;
  }

  if (pa.last && pb.last && pa.last === pb.last) {
    if (pa.initial && pb.initial && pa.initial === pb.initial) return 0.91;
    if (pa.first && pb.first && pa.first.charAt(0) === pb.first.charAt(0)) return 0.87;
  }

  if (pa.first.length === 1 && pb.first.startsWith(pa.first) && pa.initial === pb.initial) return 0.88;
  if (pb.first.length === 1 && pa.first.startsWith(pb.first) && pa.initial === pb.initial) return 0.88;

  var nick = nicknameMatch(a, b);
  if (nick >= 0.86 && pa.initial && pb.initial && pa.initial === pb.initial) return nick;
  if (nick >= 0.9 && (!pa.last || !pb.last || pa.initial === pb.initial)) return nick;
  if (nick >= 0.86 && (!pa.last || !pb.last)) return nick;

  var dist = levenshtein(na, nb);
  var maxLen = Math.max(na.length, nb.length);
  return maxLen ? 1 - dist / maxLen : 0;
}

export function namesMatch(a, b, threshold) {
  return nameSimilarity(a, b) >= (threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold);
}

export function findSquadMatch(voterName, players, threshold) {
  var th = threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold;
  var exact = (players || []).find(function (p) {
    return normalizeName(p) === normalizeName(voterName);
  });
  if (exact) return { match: exact, exact: true, similarity: 1, reason: "exact match" };

  var best = null;
  var bestSim = 0;
  (players || []).forEach(function (p) {
    var sim = nameSimilarity(voterName, p);
    if (sim >= th && sim > bestSim) {
      bestSim = sim;
      best = p;
    }
  });

  if (!best) {
    var pa = nameParts(voterName);
    if (pa.first && pa.first.length >= 2) {
      var firstHits = (players || []).filter(function (p) {
        return nameParts(p).first === pa.first;
      });
      if (firstHits.length === 1) {
        return {
          match: firstHits[0],
          exact: false,
          similarity: 0.85,
          reason: "unique first name on squad",
        };
      }
    }
  }

  if (best) {
    return {
      match: best,
      exact: false,
      similarity: bestSim,
      reason: bestSim >= 0.95 ? "near-exact" : "fuzzy (" + Math.round(bestSim * 100) + "%)",
    };
  }
  return null;
}

/** Human-readable reason when a voter name does not match any squad player. */
export function explainSquadMismatch(voterName, players, threshold) {
  var th = threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold;
  var vn = displayPlayerName(voterName);
  if (!vn) return "empty name";
  if (!players || !players.length) return "squad list is empty";

  var best = null;
  var bestSim = 0;
  (players || []).forEach(function (p) {
    var sim = nameSimilarity(vn, p);
    if (sim > bestSim) {
      bestSim = sim;
      best = p;
    }
  });

  if (best && bestSim >= th * 0.85) {
    return (
      "closest: " +
      displayPlayerName(best) +
      " (" +
      Math.round(bestSim * 100) +
      "%, need " +
      Math.round(th * 100) +
      "%)"
    );
  }
  if (best) {
    return "no match — nearest " + displayPlayerName(best) + " (" + Math.round(bestSim * 100) + "%)";
  }
  return "no similar names on squad";
}

/** Map squad player -> voter ballot name for this round (exact or fuzzy). */
export function matchSquadToVoters(squad, votes, teamId, roundLabel, voteRoundLabelFn, threshold) {
  var th = threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold;
  var voted = [];
  var missing = [];
  var possible = [];
  var extraVoters = [];
  var extraDetails = [];
  var usedVoters = Object.create(null);

  (squad || []).forEach(function (player) {
    var hit = null;
    (votes || []).forEach(function (v) {
      if (!v || String(v.teamId) !== String(teamId)) return;
      if (voteRoundLabelFn(v) !== voteRoundLabelFn({ round: roundLabel })) return;
      var vn = displayPlayerName(v.voterName || "");
      if (!vn || usedVoters[normalizeName(vn)]) return;
      var m = findSquadMatch(vn, [player], th);
      if (m) hit = { voterName: vn, squadName: player, exact: m.exact, similarity: m.similarity };
    });
    if (hit) {
      usedVoters[normalizeName(hit.voterName)] = true;
      voted.push(hit.voterName);
      if (!hit.exact) possible.push(hit.voterName + " ≈ " + hit.squadName);
    } else {
      missing.push(player);
    }
  });

  (votes || []).forEach(function (v) {
    if (!v || String(v.teamId) !== String(teamId)) return;
    if (voteRoundLabelFn(v) !== voteRoundLabelFn({ round: roundLabel })) return;
    var vn = displayPlayerName(v.voterName || "");
    if (!vn) return;
    if (usedVoters[normalizeName(vn)]) return;
    var onSquad = findSquadMatch(vn, squad, th);
    if (onSquad) {
      if (!onSquad.exact) possible.push(vn + " ≈ " + onSquad.match);
      voted.push(vn);
      usedVoters[normalizeName(vn)] = true;
    } else {
      extraVoters.push(vn);
      extraDetails.push({
        voterName: vn,
        reason: explainSquadMismatch(vn, squad, th),
      });
    }
  });

  return {
    voted: voted,
    missing: missing,
    possible: possible,
    extraVoters: extraVoters,
    extraDetails: extraDetails,
  };
}
