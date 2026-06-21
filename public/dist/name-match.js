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

/**
 * Manual alias map: lowercase stripped name → canonical display name.
 * Add entries here when the same person appears under different spellings.
 */
export const NAME_ALIASES = {
  rainey: "Rainy",
  ulrika: "Uli",
  johanna: "Jay",
};

/** Resolve alias → canonical display name (unchanged if no alias). */
export function canonicalPlayerName(name) {
  var base = displayPlayerName(name);
  if (!base) return "";
  var key = stripNameQualifiers(base).toLowerCase();
  return NAME_ALIASES[key] || base;
}

export function normalizeName(c) {
  var stripped = stripNameQualifiers(c).toLowerCase();
  if (NAME_ALIASES[stripped]) return NAME_ALIASES[stripped].toLowerCase();
  return stripped;
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

/**
 * When voter enters a lone first name shared by multiple squad players (e.g. two Sarahs).
 * Returns squad display names to choose from, or null if unambiguous.
 */
export function findAmbiguousByFirstName(inputName, squad) {
  var raw = displayPlayerName(inputName);
  if (!raw) return null;
  var stripped = stripNameQualifiers(raw);
  var parts = nameParts(stripped);
  if (!parts.first) return null;
  if (parts.last && parts.last.length > 1) return null;

  var first = parts.first;
  var hits = (squad || []).filter(function (p) {
    var pp = nameParts(stripNameQualifiers(p));
    return pp.first === first;
  });
  if (hits.length <= 1) return null;

  var canon = hits.map(function (p) {
    return canonicalPlayerName(displayPlayerName(p));
  });
  var unique = [];
  var seen = Object.create(null);
  canon.forEach(function (n) {
    if (!n || seen[n.toLowerCase()]) return;
    seen[n.toLowerCase()] = true;
    unique.push(n);
  });
  return unique.length > 1 ? unique : null;
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

/** Resolve admin-confirmed ballot alias (normalized ballot name → squad display name). */
export function resolveBallotAlias(voterName, aliases) {
  var vn = displayPlayerName(voterName);
  if (!vn || !aliases) return { ballot: vn, matchAs: vn, aliased: false };
  var key = normalizeName(vn);
  var target = aliases[key];
  if (target) return { ballot: vn, matchAs: displayPlayerName(target), aliased: true };
  return { ballot: vn, matchAs: vn, aliased: false };
}

/** Filter squad to players expected to vote (exclude didn't play / didn't watch). */
export function eligibleSquadPlayers(squad, excluded) {
  var skip = Object.create(null);
  (excluded || []).forEach(function (p) {
    var k = normalizeName(p);
    if (k) skip[k] = true;
  });
  return (squad || []).filter(function (p) {
    return p && !skip[normalizeName(p)];
  });
}

/** Map squad player → voter ballot for this round (exact, fuzzy, or admin alias). */
export function matchSquadToVoters(squad, votes, teamId, roundLabel, voteRoundLabelFn, threshold, opts) {
  var th = threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold;
  var options = opts || {};
  var aliases = options.aliases || {};
  var excluded = options.excluded || [];
  var eligible = eligibleSquadPlayers(squad, excluded);
  var voted = [];
  var votedSquad = [];
  var missing = [];
  var possible = [];
  var extraVoters = [];
  var extraDetails = [];
  var usedBallots = Object.create(null);
  var roundKey = voteRoundLabelFn({ round: roundLabel });

  var roundVotes = (votes || []).filter(function (v) {
    return v && String(v.teamId) === String(teamId) && voteRoundLabelFn(v) === roundKey;
  });
  var ballotCount = roundVotes.length;

  function ballotKey(v) {
    return v.id || "t" + v.teamId + "|" + normalizeName(v.voterName) + "|" + roundKey;
  }

  function tryMatchBallot(v, player) {
    var raw = displayPlayerName(v.voterName || "");
    if (!raw) return null;
    var alias = resolveBallotAlias(raw, aliases);
    var m = findSquadMatch(alias.matchAs, [player], th);
    if (!m && alias.matchAs !== raw) m = findSquadMatch(raw, [player], th);
    if (!m) return null;
    return {
      ballot: raw,
      squadName: displayPlayerName(player),
      exact: m.exact && !alias.aliased,
      similarity: m.similarity,
      aliased: alias.aliased,
    };
  }

  eligible.forEach(function (player) {
    var hit = null;
    roundVotes.forEach(function (v) {
      var bk = ballotKey(v);
      if (usedBallots[bk]) return;
      var m = tryMatchBallot(v, player);
      if (m) hit = m;
    });
    if (hit) {
      roundVotes.forEach(function (v) {
        if (displayPlayerName(v.voterName || "") === hit.ballot) usedBallots[ballotKey(v)] = true;
      });
      votedSquad.push(hit.squadName);
      voted.push(hit.squadName);
      if (!hit.exact || hit.aliased) {
        possible.push(hit.ballot + " → " + hit.squadName);
      }
    } else {
      missing.push(displayPlayerName(player));
    }
  });

  roundVotes.forEach(function (v) {
    var bk = ballotKey(v);
    if (usedBallots[bk]) return;
    var raw = displayPlayerName(v.voterName || "");
    if (!raw) return;
    var alias = resolveBallotAlias(raw, aliases);
    var onSquad = findSquadMatch(alias.matchAs, eligible, th);
    if (!onSquad && alias.matchAs !== raw) onSquad = findSquadMatch(raw, squad, th);
    if (onSquad) {
      usedBallots[bk] = true;
      var squadName = displayPlayerName(onSquad.match);
      if (votedSquad.indexOf(squadName) === -1) {
        votedSquad.push(squadName);
        voted.push(squadName);
      }
      if (!onSquad.exact || alias.aliased) possible.push(raw + " → " + squadName);
    } else {
      extraVoters.push(raw);
      extraDetails.push({
        voterName: raw,
        reason: explainSquadMismatch(raw, squad, th),
        suggestion: findSquadMatch(raw, squad, th * 0.85),
      });
    }
  });

  return {
    voted: voted,
    votedSquad: votedSquad,
    missing: missing,
    possible: possible,
    extraVoters: extraVoters,
    extraDetails: extraDetails,
    ballotCount: ballotCount,
    eligibleCount: eligible.length,
    excluded: excluded.slice(),
    squadCount: (squad || []).length,
  };
}
