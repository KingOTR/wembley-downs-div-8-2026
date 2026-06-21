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

/** Role-only parentheticals stripped for matching; disambiguators like (tall) are kept. */
var ROLE_PAREN_RE = /^\s*\((c|vc|gk|captain|capt)\)\s*$/i;

function disambigTagsFromName(name) {
  var tags = [];
  displayPlayerName(name).replace(/\(([^)]+)\)/g, function (_, inner) {
    var low = String(inner || "")
      .trim()
      .toLowerCase();
    if (low && !ROLE_PAREN_RE.test("(" + low + ")")) tags.push(low);
    return " ";
  });
  return tags;
}

/** Strip role badges/suffixes; keep disambiguation tags (e.g. two Sarahs). */
export function stripNameQualifiers(name) {
  var base = displayPlayerName(name)
    .replace(/\s*\((c|vc|gk|captain|capt)\)\s*/gi, " ")
    .replace(/\s+(goalkeeper|gk|captain|capt|c)\s*$/i, "")
    .replace(/\([^)]+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  var tags = disambigTagsFromName(name);
  if (tags.length) base = (base + " " + tags.join(" ")).replace(/\s+/g, " ").trim();
  return base;
}

/** Stable doc-key fragment for voterNameKey (preserves disambiguation). */
export function voterNameKey(name) {
  var base = stripNameQualifiers(displayPlayerName(name));
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "x"
  );
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

/** Capitalise first letter of a name fragment. */
function titleCaseWord(w) {
  w = String(w || "").trim();
  if (!w) return "";
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * Public match-card label for a goalscorer.
 * First names by default; "Freame" for Olivia Freame; full squad names when first name is ambiguous (e.g. two Sarahs).
 */
export function formatGoalScorerDisplayName(fullName, squad) {
  var raw = displayPlayerName(fullName);
  if (!raw) return "";

  var stripped = stripNameQualifiers(raw);
  if (/\bfreame\b/i.test(stripped)) return "Freame";

  var exact = (squad || []).find(function (p) {
    return displayPlayerName(p).toLowerCase() === raw.toLowerCase();
  });
  var hit = exact ? { match: exact } : findSquadMatch(raw, squad, 0.82);
  var rosterName = hit ? displayPlayerName(hit.match) : raw;
  var parts = nameParts(stripNameQualifiers(rosterName));

  if (parts.first && squad && squad.length) {
    var ambig = findAmbiguousByFirstName(parts.first, squad);
    if (ambig) {
      var canon = canonicalPlayerName(rosterName);
      var inAmbig = ambig.some(function (n) {
        return n.toLowerCase() === canon.toLowerCase();
      });
      if (inAmbig) return rosterName;
      for (var j = 0; j < ambig.length; j++) {
        if (namesMatch(raw, ambig[j], 0.82)) return ambig[j];
      }
    }
  }

  if (parts.first) return titleCaseWord(parts.first);
  return raw;
}

/** Format a list of goalscorer names for display or Squadi import. */
export function formatGoalScorerList(scorers, squad) {
  return (scorers || [])
    .map(function (s) {
      return formatGoalScorerDisplayName(s, squad);
    })
    .filter(Boolean);
}

export function findSquadMatch(voterName, players, threshold) {
  var th = threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold;
  var rawVoter = displayPlayerName(voterName);
  var exactDisplay = (players || []).find(function (p) {
    return displayPlayerName(p).toLowerCase() === rawVoter.toLowerCase();
  });
  if (exactDisplay) {
    return { match: exactDisplay, exact: true, similarity: 1, reason: "exact display match" };
  }
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

/**
 * If voter name matches a configured coach (coach1Name → slot 1, coach2Name → slot 2).
 * Chris / Will convention: coach1=Will slot 1, coach2=Chris slot 2 when set in config.
 */
export function resolveCoachSlotForVoterName(voterName, team) {
  if (!team) return null;
  var base = displayPlayerName(voterName);
  if (!base) return null;
  var coach1 = displayPlayerName(team.coach1Name || "Coach 1");
  var coach2 = displayPlayerName(team.coach2Name || "Coach 2");
  var th = 0.88;
  if (nameSimilarity(base, coach1) >= th) return { slot: 1, label: coach1 };
  if (nameSimilarity(base, coach2) >= th) return { slot: 2, label: coach2 };
  var key = normalizeName(base);
  if (key === "will" || key === "william") return { slot: 1, label: coach1 };
  if (key === "chris" || (key.length >= 5 && key.indexOf("chris") === 0)) return { slot: 2, label: coach2 };
  return null;
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

/** Whether a vote doc should be excluded from results tally. */
export function isVoteExcludedFromTally(vote) {
  if (!vote) return true;
  if (vote.adminApproved === true) return false;
  if (vote.tallyExcluded === true) return true;
  if (vote.nameMatchStatus === "unmatched") return true;
  return false;
}

/**
 * Classify ballot name vs squad at submit time.
 * Unmatched names: tallyExcluded by default; admin can set adminApproved later.
 */
export function classifyBallotNameMatch(voterName, squad, opts) {
  var options = opts || {};
  var aliases = options.aliases || {};
  var th = options.threshold == null ? DEFAULT_SQUAD_THRESHOLD : options.threshold;
  var raw = displayPlayerName(voterName);
  if (!raw) {
    return {
      nameMatchStatus: "empty",
      tallyExcluded: true,
      adminApproved: false,
      matchedPlayer: null,
      reason: "empty name",
    };
  }
  var alias = resolveBallotAlias(raw, aliases);
  var match = findSquadMatch(alias.matchAs, squad, th);
  if (!match && alias.matchAs !== raw) match = findSquadMatch(raw, squad, th);
  if (!match) {
    return {
      nameMatchStatus: "unmatched",
      tallyExcluded: true,
      adminApproved: false,
      matchedPlayer: null,
      reason: explainSquadMismatch(raw, squad, th),
    };
  }
  return {
    nameMatchStatus: match.exact && !alias.aliased ? "matched" : "fuzzy",
    tallyExcluded: false,
    adminApproved: false,
    matchedPlayer: displayPlayerName(match.match),
    reason: match.reason,
  };
}

/** Parse ballot submittedAt for sorting (latest first). */
export function ballotSubmittedAt(vote) {
  if (!vote || !vote.submittedAt) return 0;
  var t = Date.parse(String(vote.submittedAt));
  return isFinite(t) ? t : 0;
}

function ballotDocKey(v, roundKey) {
  return v.id || "t" + v.teamId + "|" + normalizeName(v.voterName) + "|" + roundKey;
}

function ballotDedupeKey(v, roundKey) {
  if (v.id) return v.id;
  return "t" + v.teamId + "|" + normalizeName(v.voterName) + "|" + roundKey + "|" + (v.submittedAt || "");
}

function ballotMatchesPlayer(v, player, aliases, th) {
  var raw = displayPlayerName(v.voterName || "");
  if (!raw) return null;
  var alias = resolveBallotAlias(raw, aliases);
  var m = findSquadMatch(alias.matchAs, [player], th);
  if (!m && alias.matchAs !== raw) m = findSquadMatch(raw, [player], th);
  if (!m) return null;
  return {
    ballot: raw,
    squadName: displayPlayerName(player),
    voterNameKey: v.voterNameKey || "",
    submittedAt: v.submittedAt || "",
    id: v.id || "",
    exact: m.exact && !alias.aliased,
    similarity: m.similarity,
    aliased: alias.aliased,
  };
}

/**
 * Squad members with 2+ ballots matched to them. Latest submittedAt wins for tally.
 */
export function findDuplicateBallotsPerSquad(squad, roundVotes, threshold, aliases, roundKey) {
  var th = threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold;
  var aliasMap = aliases || {};
  var rk = roundKey || "";
  var duplicates = [];

  (squad || []).forEach(function (player) {
    var squadName = displayPlayerName(player);
    var hits = [];
    (roundVotes || []).forEach(function (v) {
      var m = ballotMatchesPlayer(v, player, aliasMap, th);
      if (m) {
        hits.push(Object.assign({}, m, { _vote: v, _ts: ballotSubmittedAt(v) }));
      }
    });
    if (hits.length < 2) return;

    hits.sort(function (a, b) {
      return b._ts - a._ts || String(b.ballot).localeCompare(String(a.ballot));
    });
    var kept = hits[0];
    var excluded = hits.slice(1);
    duplicates.push({
      squadName: squadName,
      kept: { ballot: kept.ballot, submittedAt: kept.submittedAt, id: kept.id },
      excluded: excluded.map(function (x) {
        return {
          ballot: x.ballot,
          submittedAt: x.submittedAt,
          id: x.id,
          ballotKey: ballotDedupeKey(x._vote, rk),
          reason: "duplicate ballot for same squad member (latest wins)",
        };
      }),
      ballotNames: hits.map(function (x) {
        return x.ballot;
      }),
    });
  });

  return duplicates;
}

/** One ballot per squad member for results tally. Latest submittedAt wins. */
export function dedupeVotesOnePerSquad(
  squad,
  votes,
  teamId,
  roundLabel,
  voteRoundLabelFn,
  threshold,
  opts
) {
  var options = opts || {};
  var roundKey = voteRoundLabelFn({ round: roundLabel });
  var roundVotes = (votes || []).filter(function (v) {
    return v && String(v.teamId) === String(teamId) && voteRoundLabelFn(v) === roundKey;
  });
  var duplicates = findDuplicateBallotsPerSquad(
    squad,
    roundVotes,
    threshold,
    options.aliases || {},
    roundKey
  );
  var skipKeys = Object.create(null);
  duplicates.forEach(function (d) {
    d.excluded.forEach(function (x) {
      if (x.id) skipKeys[x.id] = true;
      if (x.ballotKey) skipKeys[x.ballotKey] = true;
    });
  });

  var votesForTally = roundVotes.filter(function (v) {
    if (!v) return false;
    if (v.id && skipKeys[v.id]) return false;
    if (skipKeys[ballotDedupeKey(v, roundKey)]) return false;
    if (isVoteExcludedFromTally(v)) return false;
    return true;
  });

  return {
    votesForTally: votesForTally,
    duplicates: duplicates,
    ballotCount: roundVotes.length,
    countedBallots: votesForTally.length,
  };
}

/** Map squad player → voter ballot for this round (exact, fuzzy, or admin alias). */
export function matchSquadToVoters(squad, votes, teamId, roundLabel, voteRoundLabelFn, threshold, opts) {
  var th = threshold == null ? DEFAULT_SQUAD_THRESHOLD : threshold;
  var options = opts || {};
  var aliases = options.aliases || {};
  var excluded = options.excluded || [];
  var eligible = eligibleSquadPlayers(squad, excluded);
  var roundKey = voteRoundLabelFn({ round: roundLabel });

  var roundVotes = (votes || []).filter(function (v) {
    return v && String(v.teamId) === String(teamId) && voteRoundLabelFn(v) === roundKey;
  });
  var ballotCount = roundVotes.length;

  var deduped = dedupeVotesOnePerSquad(
    squad,
    votes,
    teamId,
    roundLabel,
    voteRoundLabelFn,
    th,
    { aliases: aliases }
  );
  var tallyVotes = deduped.votesForTally;
  var duplicates = deduped.duplicates;

  var voted = [];
  var votedSquad = [];
  var missing = [];
  var possible = [];
  var extraVoters = [];
  var extraDetails = [];
  var usedBallots = Object.create(null);

  function ballotKey(v) {
    return ballotDocKey(v, roundKey);
  }

  function tryMatchBallot(v, player) {
    return ballotMatchesPlayer(v, player, aliases, th);
  }

  eligible.forEach(function (player) {
    var hit = null;
    tallyVotes.forEach(function (v) {
      var bk = ballotKey(v);
      if (usedBallots[bk]) return;
      var m = tryMatchBallot(v, player);
      if (m) hit = m;
    });
    if (hit) {
      tallyVotes.forEach(function (v) {
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
    countedBallots: deduped.countedBallots,
    duplicates: duplicates,
    eligibleCount: eligible.length,
    excluded: excluded.slice(),
    squadCount: (squad || []).length,
  };
}

var BALLOT_SLOT_POINTS = [3, 2, 1];

/** Canonical key for duplicate-pick detection on one ballot. */
export function ballotPickKey(name) {
  var display = displayPlayerName(name);
  if (!display) return "";
  return normalizeName(canonicalPlayerName(display));
}

/** True when the same player appears in more than one pick slot. */
export function ballotPicksHaveDuplicates(picks) {
  var seen = Object.create(null);
  var list = picks || [];
  for (var i = 0; i < list.length; i++) {
    var key = ballotPickKey(list[i]);
    if (!key) continue;
    if (seen[key]) return true;
    seen[key] = true;
  }
  return false;
}

/** Display names of players picked more than once (for validation messages). */
export function findDuplicateBallotPickNames(picks) {
  var seen = Object.create(null);
  var dups = [];
  (picks || []).forEach(function (name) {
    var key = ballotPickKey(name);
    if (!key) return;
    var label = canonicalPlayerName(name) || displayPlayerName(name);
    if (seen[key]) {
      if (dups.indexOf(label) === -1) dups.push(label);
    } else {
      seen[key] = label;
    }
  });
  return dups;
}

/**
 * Remove duplicate picks on one ballot; keep the highest-value slot per player.
 * Slots are 3 / 2 / 1 points (indices 0 / 1 / 2).
 * Example: ["Bob","Bob","Bob"] → ["Bob","",""]
 */
export function dedupeBallotPicks(picks) {
  var src = Array.isArray(picks) ? picks.slice(0, 3) : [];
  while (src.length < 3) src.push("");
  var best = Object.create(null);
  src.forEach(function (name, idx) {
    var display = displayPlayerName(name);
    if (!display) return;
    var key = ballotPickKey(display);
    if (!key) return;
    if (!best[key] || BALLOT_SLOT_POINTS[idx] > BALLOT_SLOT_POINTS[best[key].idx]) {
      best[key] = {
        idx: idx,
        name: canonicalPlayerName(display) || display,
      };
    }
  });
  var out = ["", "", ""];
  Object.keys(best).forEach(function (k) {
    var e = best[k];
    out[e.idx] = e.name;
  });
  return out;
}

/** True when dedupeBallotPicks would change the ballot. */
export function ballotPicksNeedDedupe(picks) {
  if (!ballotPicksHaveDuplicates(picks)) return false;
  var cleaned = dedupeBallotPicks(picks);
  var src = (picks || []).slice(0, 3);
  while (src.length < 3) src.push("");
  for (var i = 0; i < 3; i++) {
    if (ballotPickKey(src[i]) !== ballotPickKey(cleaned[i])) return true;
    if (displayPlayerName(src[i]) !== displayPlayerName(cleaned[i])) return true;
  }
  return false;
}
