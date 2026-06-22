/**
 * Load before app.min.js so vote tally / doc keys can canonicalize aliases.
 */
import {
  canonicalPlayerName,
  normalizeName,
  formatGoalScorerList,
  validateBallotPicks,
} from "./name-match.js?tag=v185";

window.__svCanonicalPlayerName = canonicalPlayerName;
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
