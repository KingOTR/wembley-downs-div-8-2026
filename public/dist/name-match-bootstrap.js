/**
 * Load before app.min.js so vote tally / doc keys can canonicalize aliases.
 */
import {
  canonicalPlayerName,
  normalizeName,
  formatGoalScorerList,
  validateBallotPicks,
  findSquadMatch,
  displayPlayerName,
  STRICT_SQUAD_THRESHOLD,
} from "./name-match.js?tag=v190";

/** Map pick/voter name to squad roster label for tally (not off-roster nicknames). */
function canonicalForTally(name) {
  var base = canonicalPlayerName(name);
  var squad =
    typeof window.__svGetBallotSquad === "function" ? window.__svGetBallotSquad() : [];
  if (squad && squad.length) {
    var hit = findSquadMatch(base, squad, STRICT_SQUAD_THRESHOLD);
    if (!hit) hit = findSquadMatch(name, squad, STRICT_SQUAD_THRESHOLD);
    if (hit && hit.match) return displayPlayerName(hit.match);
  }
  return base;
}

window.__svCanonicalPlayerName = canonicalForTally;
window.__svNormalizeName = normalizeName;
window.__svFormatGoalScorerList = formatGoalScorerList;

function ballotSquadFromStorage() {
  try {
    var raw = localStorage.getItem("soccerVoteApp_v2");
    if (!raw) return [];
    var data = JSON.parse(raw);
    var teamId = 1;
    var sel = document.getElementById("teamSelect");
    if (sel && sel.value) teamId = parseInt(sel.value, 10) || 1;
    var team = (data.teams || []).find(function (t) {
      return String(t.id) === String(teamId);
    });
    return team && team.players ? team.players.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

window.__svGetBallotSquad = ballotSquadFromStorage;

window.__svValidateBallotPicks = function (picks) {
  var squad =
    typeof window.__svGetBallotSquad === "function" ? window.__svGetBallotSquad() : null;
  return validateBallotPicks(picks, squad);
};
