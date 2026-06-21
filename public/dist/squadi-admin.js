/**
 * Admin UI: Squadi competition pointer + import fixtures into matchesByRound.
 */
import {
  parseSquadiFixtureUrl,
  normalizeSquadiConfig,
  fetchWembleyFixtures,
  mergeFixturesIntoMatchesByRound,
} from "./squadi-client.js?tag=v170";

var STORAGE_KEY = "soccerVoteApp_v2";

function loadLocalData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { teams: [], votes: [], coachVotes: [] };
  } catch {
    return { teams: [], votes: [], coachVotes: [] };
  }
}

function saveLocalData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[squadi-admin] save failed", e);
  }
}

function currentTeamId() {
  var sel = document.getElementById("publicTeamSelect");
  if (sel && sel.value) return parseInt(sel.value, 10) || 1;
  return 1;
}

function getTeam(data, teamId) {
  return (data.teams || []).find(function (t) {
    return String(t.id) === String(teamId);
  });
}

function readSquadiForm() {
  var urlEl = document.getElementById("squadiFixtureUrl");
  var filterEl = document.getElementById("squadiTeamFilter");
  var teamIdEl = document.getElementById("squadiTeamId");
  var yearEl = document.getElementById("squadiYearId");
  var compEl = document.getElementById("squadiCompetitionKey");
  var divEl = document.getElementById("squadiDivisionId");
  var raw = {
    fixtureUrl: urlEl ? urlEl.value.trim() : "",
    teamId: teamIdEl ? teamIdEl.value.trim() : "",
    yearId: yearEl ? yearEl.value.trim() : "",
    competitionUniqueKey: compEl ? compEl.value.trim() : "",
    divisionId: divEl ? divEl.value.trim() : "",
    teamNameFilter: filterEl ? filterEl.value.trim() : "Wembley Downs",
  };
  return normalizeSquadiConfig(raw);
}

function fillSquadiForm(squadi) {
  var s = squadi || {};
  var urlEl = document.getElementById("squadiFixtureUrl");
  var filterEl = document.getElementById("squadiTeamFilter");
  var teamIdEl = document.getElementById("squadiTeamId");
  var yearEl = document.getElementById("squadiYearId");
  var compEl = document.getElementById("squadiCompetitionKey");
  var divEl = document.getElementById("squadiDivisionId");
  if (urlEl) urlEl.value = s.fixtureUrl || "";
  if (filterEl) filterEl.value = s.teamNameFilter || "Wembley Downs";
  if (teamIdEl) teamIdEl.value = s.teamId != null ? String(s.teamId) : "";
  if (yearEl) yearEl.value = s.yearId != null ? String(s.yearId) : "";
  if (compEl) compEl.value = s.competitionUniqueKey || "";
  if (divEl) divEl.value = s.divisionId != null ? String(s.divisionId) : "";
}

function persistSquadiOnTeam() {
  var data = loadLocalData();
  var team = getTeam(data, currentTeamId());
  if (!team) return;
  team.squadi = readSquadiForm();
  saveLocalData(data);
  try {
    if (window.U && window.U.teams) {
      var ut = window.U.teams.find(function (t) {
        return String(t.id) === String(team.id);
      });
      if (ut) ut.squadi = team.squadi;
    }
  } catch (e) {}
}

function loadSquadiFromTeam() {
  var data = loadLocalData();
  var team = getTeam(data, currentTeamId());
  fillSquadiForm(team && team.squadi);
}

function setSquadiStatus(msg, ok) {
  var el = document.getElementById("squadiSyncStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = ok ? "#15803d" : ok === false ? "#b91c1c" : "";
}

async function importFromSquadi() {
  var statusEl = document.getElementById("squadiSyncStatus");
  var btn = document.getElementById("squadiImportBtn");
  try {
    if (btn) btn.disabled = true;
    setSquadiStatus("Fetching from Squadi…");
    var squadi = readSquadiForm();
    if (!squadi.competitionUniqueKey || !squadi.yearId) {
      setSquadiStatus("Paste a Squadi fixture page URL or fill competition + year.", false);
      return;
    }
    var syncOut = await fetchWembleyFixtures(squadi, { squad: team.players || [] });
    var fixtures = syncOut.fixtures;
    if (!fixtures.length) {
      setSquadiStatus("No matches found for “" + squadi.teamNameFilter + "”. Check competition URL.", false);
      return;
    }

    var data = loadLocalData();
    var teamId = currentTeamId();
    var team = getTeam(data, teamId);
    if (!team) {
      setSquadiStatus("Team not found in local config.", false);
      return;
    }
    team.squadi = squadi;
    team.matchesByRound = mergeFixturesIntoMatchesByRound(team.matchesByRound, fixtures);
    saveLocalData(data);

    try {
      if (window.U && window.U.teams) {
        var ut = window.U.teams.find(function (t) {
          return String(t.id) === String(teamId);
        });
        if (ut) {
          ut.squadi = team.squadi;
          ut.matchesByRound = team.matchesByRound;
        }
      }
    } catch (e) {}

    window.dispatchEvent(new CustomEvent("sv-match-saved", { detail: { source: "squadi" } }));
    var statusMsg = "Imported " + fixtures.length + " round(s) (Round " + syncOut.minRound + "+).";
    if (syncOut.skippedGradingRounds) {
      statusMsg +=
        " Skipped " +
        syncOut.skippedGradingRounds +
        " grading round(s) (before Round " +
        syncOut.minRound +
        ").";
    }
    statusMsg += " Click Save team & round to push to cloud.";
    setSquadiStatus(statusMsg, true);

    try {
      if (typeof window.__svRefreshMatchForm === "function") window.__svRefreshMatchForm();
      else if (typeof window.Op === "function") window.Op();
    } catch (e) {}
  } catch (e) {
    console.error("[squadi-admin]", e);
    setSquadiStatus(String(e.message || e), false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function wireSquadiAdmin() {
  var panel = document.querySelector('[data-admin-panel="team"]');
  if (!panel || panel._svSquadiWired) return;
  panel._svSquadiWired = true;

  var urlEl = document.getElementById("squadiFixtureUrl");
  if (urlEl) {
    urlEl.addEventListener("change", function () {
      var parsed = parseSquadiFixtureUrl(urlEl.value);
      if (parsed) {
        if (parsed.competitionUniqueKey) {
          var comp = document.getElementById("squadiCompetitionKey");
          if (comp) comp.value = parsed.competitionUniqueKey;
        }
        if (parsed.yearId) {
          var y = document.getElementById("squadiYearId");
          if (y) y.value = String(parsed.yearId);
        }
        if (parsed.divisionId) {
          var d = document.getElementById("squadiDivisionId");
          if (d) d.value = String(parsed.divisionId);
        }
        if (parsed.teamId) {
          var tid = document.getElementById("squadiTeamId");
          if (tid) tid.value = String(parsed.teamId);
        }
      }
      persistSquadiOnTeam();
    });
  }

  ["squadiTeamFilter", "squadiTeamId", "squadiYearId", "squadiCompetitionKey", "squadiDivisionId"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", persistSquadiOnTeam);
  });

  var importBtn = document.getElementById("squadiImportBtn");
  if (importBtn) importBtn.addEventListener("click", importFromSquadi);

  var saveBtn = document.getElementById("saveRound");
  if (saveBtn) {
    saveBtn.addEventListener("click", persistSquadiOnTeam, true);
  }

  var teamTabs = document.getElementById("adminTeamTabs");
  if (teamTabs) {
    teamTabs.addEventListener("click", function () {
      setTimeout(loadSquadiFromTeam, 200);
    });
  }

  loadSquadiFromTeam();
}

var obs = new MutationObserver(function () {
  if (document.getElementById("squadiFixtureUrl")) {
    wireSquadiAdmin();
  }
});

if (document.body) obs.observe(document.body, { childList: true, subtree: true });
else document.addEventListener("DOMContentLoaded", function () {
  obs.observe(document.body, { childList: true, subtree: true });
});

wireSquadiAdmin();
