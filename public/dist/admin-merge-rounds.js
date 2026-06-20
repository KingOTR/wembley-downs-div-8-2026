/**
 * Admin: merge team votes from one round into another (super admin).
 * Lazy-loaded alongside app.min.js; uses window.__svFirebaseApp / __svAuth (no CDN Firebase imports).
 */
import { findSquadMatch, normalizeName } from "./name-match.js";

const STORAGE_KEY = "soccerVoteApp_v2";
const PREFS_KEY = STORAGE_KEY + "_cache";
const ADMIN_SESSION_KEY = "soccerVoteAdminUnlock";

function qo(c) {
  return normalizeName(c);
}

function nameKey(c) {
  return (
    qo(c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "x"
  );
}

/** Same as app.min.js Zp() — doc id segment for round / voter keys */
function roundDocKey(label) {
  return nameKey(voteRoundLabel({ round: label }));
}

function normalizeRoundLabel(c) {
  var l = String(c ?? "").trim();
  if (!l) return "";
  l = l.replace(/\s+/g, " ").trim();
  var h = l.match(/^round\s*(\d+(?:\.\d+)?)$/i);
  if (h) return "Round " + h[1];
  var m = l.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return "Round " + m[1];
  var f = l.match(/^round\s+(\d+(?:\.\d+)?)(.*)$/i);
  return f ? ("Round " + f[1] + (f[2] || "")).replace(/\s+/g, " ").trim() : l;
}

function voteRoundLabel(vote) {
  var l = vote && vote.round;
  if (l == null || l === "") return "Round 1";
  return normalizeRoundLabel(l) || "Round 1";
}

function teamIdStr(c) {
  return c == null ? "" : String(c);
}

function roundSortKey(label) {
  var m = String(label || "").match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function isSuperAdminUnlocked() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function getAdminTeamId() {
  var sel = document.getElementById("resultsTeamSelect");
  if (sel && sel.value) return parseInt(sel.value, 10) || 1;
  var tabs = document.querySelectorAll("#adminTeamTabs button");
  var teams = [];
  try {
    teams = loadLocalData().teams || [];
  } catch {
    teams = [];
  }
  for (var i = 0; i < tabs.length; i++) {
    if (!tabs[i].classList.contains("active")) continue;
    var team = teams[i];
    if (team && team.id != null) return team.id;
    return i + 1;
  }
  return 1;
}

function loadRoundByTeamPrefs() {
  try {
    var raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    var prefs = JSON.parse(raw);
    return prefs && prefs.roundByTeam && typeof prefs.roundByTeam === "object" ? prefs.roundByTeam : {};
  } catch {
    return {};
  }
}

function roundsFromResultsSelect() {
  var sel = document.getElementById("resultsRoundSelect");
  if (!sel) return [];
  var out = [];
  for (var i = 0; i < sel.options.length; i++) {
    var n = normalizeRoundLabel(sel.options[i].value) || sel.options[i].value;
    if (n) out.push(n);
  }
  return out;
}

function collectRounds(teamId, teams, votes) {
  var map = Object.create(null);
  var team = (teams || []).find(function (t) {
    return teamIdStr(t.id) === teamIdStr(teamId);
  });
  if (team && team.round) map[normalizeRoundLabel(team.round) || team.round] = true;
  if (team && team.matchesByRound) {
    Object.keys(team.matchesByRound).forEach(function (r) {
      var n = normalizeRoundLabel(r) || r;
      if (n) map[n] = true;
    });
  }
  try {
    var roundByTeam = loadRoundByTeamPrefs();
    var prefRound = roundByTeam[teamIdStr(teamId)];
    if (prefRound) {
      var pr = normalizeRoundLabel(prefRound) || prefRound;
      if (pr) map[pr] = true;
    }
  } catch { /* ignore */ }
  (votes || []).forEach(function (v) {
    if (!v || teamIdStr(v.teamId) !== teamIdStr(teamId)) return;
    var rl = voteRoundLabel(v);
    if (rl) map[rl] = true;
  });
  roundsFromResultsSelect().forEach(function (r) {
    if (r) map[r] = true;
  });
  if (!Object.keys(map).length && team && team.round) {
    map[normalizeRoundLabel(team.round) || "Round 1"] = true;
  }
  if (!Object.keys(map).length) map["Round 1"] = true;
  return Object.keys(map).sort(function (a, b) {
    var da = roundSortKey(a);
    var db = roundSortKey(b);
    return da !== db ? da - db : String(a).localeCompare(String(b));
  });
}

function fillSelect(sel, rounds, preferred) {
  if (!sel) return;
  var prev = preferred || sel.value;
  sel.innerHTML = "";
  rounds.forEach(function (r) {
    var opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    sel.appendChild(opt);
  });
  if (prev && rounds.indexOf(prev) !== -1) sel.value = prev;
  else if (rounds.length) sel.value = rounds[rounds.length - 1];
}

function buildPlayerKeySet(players) {
  var set = Object.create(null);
  (players || []).forEach(function (p) {
    var k = qo(p);
    if (k) set[k] = true;
  });
  return set;
}

function isOnSquad(voterName, players) {
  return !!findSquadMatch(voterName, players);
}

function planMerge(teamId, teams, votes, srcRound, dstRound) {
  var srcLabel = voteRoundLabel({ round: srcRound });
  var dstLabel = voteRoundLabel({ round: dstRound });
  var team = (teams || []).find(function (t) {
    return teamIdStr(t.id) === teamIdStr(teamId);
  });
  var players = (team && team.players) || [];

  var destKeys = Object.create(null);
  (votes || []).forEach(function (v) {
    if (!v || teamIdStr(v.teamId) !== teamIdStr(teamId)) return;
    if (voteRoundLabel(v) !== dstLabel) return;
    destKeys[v.voterNameKey || nameKey(v.voterName)] = true;
  });

  var merged = [];
  var skippedDup = [];
  var invalid = [];
  var possibleMatch = [];
  var sourceVotes = (votes || []).filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId) && voteRoundLabel(v) === srcLabel;
  });

  sourceVotes.forEach(function (v) {
    var key = v.voterNameKey || nameKey(v.voterName);
    var squadHit = findSquadMatch(v.voterName, players);
    if (!squadHit) {
      invalid.push(v.voterName || "(unnamed)");
      return;
    }
    if (!squadHit.exact) {
      possibleMatch.push((v.voterName || "(unnamed)") + " ≈ " + squadHit.match);
    }
    if (destKeys[key]) {
      skippedDup.push(v.voterName || key);
      return;
    }
    destKeys[key] = true;
    merged.push(v);
  });

  return {
    srcLabel: srcLabel,
    dstLabel: dstLabel,
    dstRoundKey: roundDocKey(dstLabel),
    sourceVotes: sourceVotes,
    merged: merged,
    skippedDup: skippedDup,
    invalid: invalid,
    possibleMatch: possibleMatch,
  };
}

function renderSummary(el, plan, teamName) {
  if (!el) return;
  el.style.display = "block";
  var lines = [
    "<div style='font-weight:800;color:var(--red-dark);margin-bottom:0.35rem'>Merge preview — " +
      escapeHtml(teamName) +
      "</div>",
    "<div><strong>" +
      plan.merged.length +
      "</strong> vote" +
      (plan.merged.length === 1 ? "" : "s") +
      " will merge from <em>" +
      escapeHtml(plan.srcLabel) +
      "</em> → <em>" +
      escapeHtml(plan.dstLabel) +
      "</em></div>",
    "<div style='margin-top:0.35rem'><strong>" +
      plan.skippedDup.length +
      "</strong> skipped (already voted in destination)</div>",
    "<div style='margin-top:0.35rem'><strong>" +
      plan.invalid.length +
      "</strong> invalid (not on squad list)</div>",
  ];
  if (plan.skippedDup.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Skipped duplicates</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(plan.skippedDup.join(", ")) +
        "</p></details>"
    );
  }
  if (plan.possibleMatch && plan.possibleMatch.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Possible name matches (fuzzy)</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(plan.possibleMatch.join(", ")) +
        "</p></details>"
    );
  }
  if (plan.invalid.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Invalid names (not on squad)</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(plan.invalid.join(", ")) +
        "</p></details>"
    );
  }
  if (plan.merged.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Votes to merge</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(
          plan.merged
            .map(function (v) {
              return v.voterName;
            })
            .join(", ")
        ) +
        "</p></details>"
    );
  }
  el.innerHTML = lines.join("");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function waitForApp(maxMs) {
  var deadline = Date.now() + (maxMs || 30000);
  while (Date.now() < deadline) {
    if (window.__svFirebaseApp) return window.__svFirebaseApp;
    await new Promise(function (r) {
      setTimeout(r, 200);
    });
  }
  return null;
}

async function waitForAuth(maxMs) {
  var deadline = Date.now() + (maxMs || 30000);
  while (Date.now() < deadline) {
    if (window.__svAuth && window.__svAuth.currentUser) return window.__svAuth.currentUser;
    await new Promise(function (r) {
      setTimeout(r, 200);
    });
  }
  return null;
}

function projectId() {
  var app = window.__svFirebaseApp;
  return app && app.options && app.options.projectId ? app.options.projectId : "";
}

function apiKey() {
  var app = window.__svFirebaseApp;
  return app && app.options && app.options.apiKey ? app.options.apiKey : "";
}

function firestoreUrl(path, query) {
  var pid = projectId();
  if (!pid) return "";
  var url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(pid) +
    "/databases/(default)/documents/" +
    path;
  var params = [];
  var key = apiKey();
  if (key) params.push("key=" + encodeURIComponent(key));
  if (query) params.push(query);
  if (params.length) url += "?" + params.join("&");
  return url;
}

async function readHeaders() {
  var headers = { "Content-Type": "application/json" };
  var auth = window.__svAuth;
  if (auth && auth.currentUser) {
    try {
      var token = await auth.currentUser.getIdToken();
      headers.Authorization = "Bearer " + token;
    } catch (e) {
      console.warn("[merge-rounds] auth token unavailable for read", e);
    }
  }
  return headers;
}

async function authHeaders() {
  var auth = window.__svAuth;
  if (!auth || !auth.currentUser) {
    throw new Error("Sign in as super admin first (Coach / admin → Super admin → Unlock).");
  }
  var token = await auth.currentUser.getIdToken();
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

function fsValue(val) {
  if (val == null) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(fsValue) } };
  }
  if (typeof val === "object") {
    var fields = {};
    Object.keys(val).forEach(function (k) {
      fields[k] = fsValue(val[k]);
    });
    return { mapValue: { fields: fields } };
  }
  return { stringValue: String(val) };
}

function parseFsValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if (v.arrayValue && Array.isArray(v.arrayValue.values)) {
    return v.arrayValue.values.map(parseFsValue);
  }
  if (v.mapValue && v.mapValue.fields) {
    var out = {};
    Object.keys(v.mapValue.fields).forEach(function (k) {
      out[k] = parseFsValue(v.mapValue.fields[k]);
    });
    return out;
  }
  return null;
}

function docPath(name) {
  var m = String(name || "").match(/documents\/(.+)$/);
  return m ? m[1] : "";
}

async function runQuery(structuredQuery) {
  var pid = projectId();
  if (!pid) throw new Error("Cloud not connected.");
  var url = firestoreUrl(":runQuery");
  if (!url) throw new Error("Cloud not connected.");
  var res = await fetch(url, {
    method: "POST",
    headers: await readHeaders(),
    body: JSON.stringify({ structuredQuery: structuredQuery }),
  });
  var rows = await res.json();
  if (!res.ok) {
    var msg = rows && rows.error && rows.error.message ? rows.error.message : "Query failed (" + res.status + ")";
    throw new Error(msg);
  }
  return Array.isArray(rows) ? rows : [];
}

async function getConfigTeams() {
  var url = firestoreUrl("config/main");
  if (!url) throw new Error("Cloud not connected.");
  var res = await fetch(url, { headers: await readHeaders() });
  if (res.status === 404) return [];
  var row = await res.json();
  if (!res.ok) {
    var msg = row && row.error && row.error.message ? row.error.message : "Config load failed";
    throw new Error(msg);
  }
  var teams = row.fields && row.fields.teams ? parseFsValue(row.fields.teams) : [];
  return Array.isArray(teams) ? teams : [];
}

function ingestVoteRows(rows, byId) {
  rows.forEach(function (row) {
    if (!row || !row.document) return;
    var id = docPath(row.document.name);
    if (!id || byId[id]) return;
    var data = {};
    var fields = row.document.fields || {};
    Object.keys(fields).forEach(function (k) {
      data[k] = parseFsValue(fields[k]);
    });
    byId[id] = Object.assign({ id: id }, data);
  });
}

async function fetchVotesRest(teamId) {
  var byId = Object.create(null);
  for (var i = 0; i < 2; i++) {
    var tid = i === 0 ? teamId : String(teamId);
    var structuredQuery = {
      from: [{ collectionId: "votes" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "teamId" },
          op: "EQUAL",
          value: fsValue(tid),
        },
      },
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
    };
    var startAt = null;
    for (var page = 0; page < 50; page++) {
      var query = structuredQuery;
      if (startAt) query = Object.assign({}, structuredQuery, { startAt: startAt });
      var rows = await runQuery(query);
      if (!rows.length) break;
      var lastDoc = null;
      var gotDoc = false;
      rows.forEach(function (row) {
        if (row && row.document) {
          lastDoc = row.document;
          gotDoc = true;
        }
      });
      ingestVoteRows(rows, byId);
      if (!gotDoc || !lastDoc) break;
      startAt = {
        values: [{ referenceValue: lastDoc.name }],
        before: false,
      };
      if (rows.length < 300) break;
    }
  }
  return Object.keys(byId).map(function (id) {
    return byId[id];
  });
}

async function batchWrite(writes) {
  var pid = projectId();
  if (!pid) throw new Error("Cloud not connected.");
  var url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(pid) +
    "/databases/(default)/documents:batchWrite";
  for (var i = 0; i < writes.length; i += 400) {
    var chunk = writes.slice(i, i + 400);
    console.log("[merge-rounds] batchWrite chunk", Math.floor(i / 400) + 1, "ops:", chunk.length);
    var res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ writes: chunk }),
    });
    var body = await res.json();
    if (!res.ok) {
      var msg = body && body.error && body.error.message ? body.error.message : "Batch write failed (" + res.status + ")";
      console.error("[merge-rounds] batchWrite failed", body);
      throw new Error(msg);
    }
    if (body.writeResults) {
      body.writeResults.forEach(function (wr, idx) {
        if (wr && wr.status && wr.status.code !== 0) {
          console.error("[merge-rounds] write error", idx, wr.status);
        }
      });
    }
  }
}

function docName(docId) {
  return (
    "projects/" +
    projectId() +
    "/databases/(default)/documents/votes/" +
    encodeURIComponent(docId).replace(/%2F/g, "/")
  );
}

async function loadCloudData(teamId) {
  var app = await waitForApp(25000);
  if (!app) throw new Error("Cloud not connected. Wait for sync or refresh.");
  var teams = [];
  var votes = [];
  var errors = [];
  try {
    teams = await getConfigTeams();
  } catch (e) {
    errors.push("config: " + (e.message || String(e)));
  }
  try {
    votes = await fetchVotesRest(teamId);
  } catch (e) {
    errors.push("votes: " + (e.message || String(e)));
  }
  if (!teams.length && !votes.length && errors.length) {
    throw new Error(errors.join("; "));
  }
  return { teams: teams, votes: votes, cloudRest: true, loadWarnings: errors };
}

function loadLocalData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { teams: [], votes: [], coachVotes: [] };
    return JSON.parse(raw);
  } catch {
    return { teams: [], votes: [], coachVotes: [] };
  }
}

function saveLocalData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function mergeVoteLists() {
  var lists = [];
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] && arguments[i].length) lists.push(arguments[i]);
  }
  if (!lists.length) return [];
  var byId = Object.create(null);
  lists.forEach(function (votes) {
    votes.forEach(function (v) {
      if (!v) return;
      var id = v.id || (v.teamId + "|" + (v.voterNameKey || v.voterName) + "|" + voteRoundLabel(v));
      byId[id] = v;
    });
  });
  return Object.keys(byId).map(function (id) {
    return byId[id];
  });
}

async function loadData(teamId) {
  await waitForApp(25000);
  if (isSuperAdminUnlocked()) await waitForAuth(20000);
  var localData = loadLocalData();
  var localTeams = localData.teams || [];
  var localVotes = (localData.votes || []).filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId);
  });
  var warnings = [];

  if (window.__svFirebaseApp) {
    try {
      var cloud = await loadCloudData(teamId);
      if (cloud.loadWarnings && cloud.loadWarnings.length) warnings = cloud.loadWarnings;
      var teams = cloud.teams && cloud.teams.length ? cloud.teams : localTeams;
      cloud.votes = mergeVoteLists(cloud.votes, localVotes);
      cloud.teams = teams;
      cloud.warnings = warnings;
      return cloud;
    } catch (e) {
      warnings.push(e.message || String(e));
      if (isSuperAdminUnlocked() && (localTeams.length || localVotes.length)) {
        return {
          teams: localTeams,
          votes: localVotes,
          localOnly: true,
          warnings: warnings,
        };
      }
      if (localTeams.length || localVotes.length) {
        return {
          teams: localTeams,
          votes: localVotes,
          localOnly: true,
          warnings: warnings,
        };
      }
      throw e;
    }
  }

  if (!localTeams.length && !localVotes.length && isSuperAdminUnlocked()) {
    throw new Error("Cloud not connected and no local data. Refresh and unlock super admin.");
  }
  return { teams: localTeams, votes: localVotes, localOnly: true, warnings: warnings };
}

async function deleteSourceVotesCloud(teamId, srcLabel, sourceVotes) {
  var ids = Object.create(null);
  sourceVotes.forEach(function (v) {
    if (v && v.id) ids[v.id] = true;
  });
  var extra = await fetchVotesRest(teamId);
  extra.forEach(function (v) {
    if (v && voteRoundLabel(v) === srcLabel) ids[v.id] = true;
  });
  var idList = Object.keys(ids);
  var writes = idList.map(function (id) {
    return { delete: docName(id) };
  });
  if (writes.length) await batchWrite(writes);
  return idList.length;
}

async function runMergeCloud(teamId, plan) {
  var writes = plan.merged.map(function (v) {
    var key = v.voterNameKey || nameKey(v.voterName);
    var newId = "t" + teamId + "_r" + plan.dstRoundKey + "_v" + key;
    console.log("[merge-rounds] upsert", newId, "←", v.voterName, plan.srcLabel, "→", plan.dstLabel);
    // No updateMask: destination docs usually don't exist yet; masked update fails with NOT_FOUND.
    return {
      update: {
        name: docName(newId),
        fields: {
          teamId: fsValue(teamId),
          voterName: fsValue(v.voterName),
          voterNameKey: fsValue(key),
          round: fsValue(plan.dstLabel),
          picks: fsValue(Array.isArray(v.picks) ? v.picks.slice() : []),
          submittedAt: fsValue(v.submittedAt || new Date().toISOString()),
        },
      },
    };
  });
  if (writes.length) await batchWrite(writes);
  return writes.length;
}

async function writeMergeAuditLog(teamId, plan, mergedCount, deletedCount, deleteSource) {
  try {
    var auth = window.__svAuth;
    if (!auth || !auth.currentUser) return;
    var pid = projectId();
    if (!pid) return;
    var logId = "merge_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    var url =
      "https://firestore.googleapis.com/v1/projects/" +
      encodeURIComponent(pid) +
      "/databases/(default)/documents/adminLog/" +
      encodeURIComponent(logId);
    var adminEmail = auth.currentUser.email || "";
    var body = {
      fields: {
        action: fsValue("mergeRounds"),
        teamId: fsValue(teamId),
        sourceRound: fsValue(plan.srcLabel),
        destRound: fsValue(plan.dstLabel),
        mergedCount: fsValue(mergedCount),
        deletedSourceCount: fsValue(deleteSource ? deletedCount : 0),
        skippedDup: fsValue(plan.skippedDup.length),
        invalid: fsValue(plan.invalid.length),
        adminEmail: fsValue(adminEmail),
        timestamp: fsValue(new Date().toISOString()),
      },
    };
    var res = await fetch(url, {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var row = await res.json().catch(function () {
        return {};
      });
      console.warn("[merge-rounds] audit log failed", row.error || res.status);
    } else {
      console.log("[merge-rounds] audit log written", logId);
    }
  } catch (e) {
    console.warn("[merge-rounds] audit log error", e);
  }
}

function applyMergedVotesLocal(teamId, plan, deleteSource) {
  var data = loadLocalData();
  data.votes = data.votes || [];
  plan.merged.forEach(function (v) {
    var key = v.voterNameKey || nameKey(v.voterName);
    var newId = "t" + teamId + "_r" + plan.dstRoundKey + "_v" + key;
    var row = {
      id: newId,
      teamId: teamId,
      voterName: v.voterName,
      voterNameKey: key,
      round: plan.dstLabel,
      picks: Array.isArray(v.picks) ? v.picks.slice() : [],
      submittedAt: v.submittedAt || new Date().toISOString(),
    };
    var found = false;
    for (var i = 0; i < data.votes.length; i++) {
      if (data.votes[i] && data.votes[i].id === newId) {
        data.votes[i] = row;
        found = true;
        break;
      }
    }
    if (!found) data.votes.push(row);
  });
  if (deleteSource) {
    data.votes = data.votes.filter(function (v) {
      return !(v && teamIdStr(v.teamId) === teamIdStr(teamId) && voteRoundLabel(v) === plan.srcLabel);
    });
  }
  saveLocalData(data);
  return data.votes.filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId);
  });
}

function notifyVotesMerged(teamId, votes) {
  try {
    window.dispatchEvent(
      new CustomEvent("sv-votes-merged", {
        detail: { teamId: teamId, votes: votes || [] },
      })
    );
  } catch (e) {
    console.warn("[merge-rounds] could not dispatch sv-votes-merged", e);
  }
}

function runMergeLocal(teamId, plan, deleteSource) {
  var data = loadLocalData();
  var removed = deleteSource
    ? (data.votes || []).filter(function (v) {
        return v && teamIdStr(v.teamId) === teamIdStr(teamId) && voteRoundLabel(v) === plan.srcLabel;
      }).length
    : 0;
  var teamVotes = applyMergedVotesLocal(teamId, plan, deleteSource);
  notifyVotesMerged(teamId, teamVotes);
  return { merged: plan.merged.length, removed: removed };
}

var lastPlan = null;
var bound = false;
var lastMergeRunAt = 0;
var MERGE_COOLDOWN_MS = 30000;

function validateRoundLabel(label) {
  var n = normalizeRoundLabel(label);
  if (!n || n.length > 80) return null;
  return n;
}

function setMergeHint(text, isErr) {
  var hint = document.getElementById("mergeRoundsHint");
  if (!hint) return;
  hint.textContent = text || "";
  hint.style.color = isErr ? "var(--red-dark)" : "";
}

async function refreshRoundSelects() {
  if (!isSuperAdminUnlocked()) {
    setMergeHint("Unlock super admin to load rounds.", true);
    return;
  }
  var srcSel = document.getElementById("mergeSourceRound");
  var dstSel = document.getElementById("mergeDestRound");
  var errEl = document.getElementById("mergeRoundsErr");
  if (!srcSel || !dstSel) return;
  setMergeHint("Loading rounds…");
  if (errEl) errEl.textContent = "";
  try {
    var teamId = getAdminTeamId();
    var data = await loadData(teamId);
    var team = (data.teams || []).find(function (t) {
      return teamIdStr(t.id) === teamIdStr(teamId);
    });
    var rounds = collectRounds(teamId, data.teams, data.votes);
    var current = team && team.round ? normalizeRoundLabel(team.round) || team.round : "";
    fillSelect(srcSel, rounds, rounds.length > 1 ? rounds[rounds.length - 1] : current);
    fillSelect(dstSel, rounds, current || (rounds.length ? rounds[0] : ""));
    var authReady = !!(window.__svAuth && window.__svAuth.currentUser);
    var parts = [
      rounds.length + " round(s)",
      (data.votes || []).length + " vote(s) loaded",
      data.localOnly ? "local fallback" : "cloud",
      authReady ? "auth OK" : "auth pending (reads still work)",
    ];
    if (data.warnings && data.warnings.length) parts.push("warn: " + data.warnings.join("; "));
    setMergeHint(parts.join(" · "), !!(data.warnings && data.warnings.length));
    if (!rounds.length) {
      if (errEl) errEl.textContent = "No rounds found — check team config, votes, or refresh after unlock.";
    }
  } catch (e) {
    console.warn("merge rounds: could not refresh selects", e);
    setMergeHint("Could not load rounds: " + (e.message || String(e)), true);
    if (errEl) errEl.textContent = e.message || String(e);
  }
}

function wireMergeUi() {
  if (bound) return;
  var previewBtn = document.getElementById("mergeRoundsPreview");
  var runBtn = document.getElementById("mergeRoundsRun");
  var errEl = document.getElementById("mergeRoundsErr");
  var summaryEl = document.getElementById("mergeRoundsSummary");
  if (!previewBtn || !runBtn) return;
  bound = true;

  var teamTabs = document.getElementById("adminTeamTabs");
  if (teamTabs) {
    teamTabs.addEventListener("click", function () {
      setTimeout(function () {
        refreshRoundSelects().catch(function () {});
      }, 80);
    });
  }
  var resultsTeamSel = document.getElementById("resultsTeamSelect");
  if (resultsTeamSel) {
    resultsTeamSel.addEventListener("change", function () {
      refreshRoundSelects().catch(function () {});
    });
  }
  var unlockBtn = document.getElementById("unlockAdmin");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", function () {
      setTimeout(function () {
        refreshRoundSelects().catch(function () {});
      }, 2000);
    });
  }
  var superContent = document.getElementById("superAdminContent");
  if (superContent) {
    var unlockObs = new MutationObserver(function () {
      if (isSuperAdminUnlocked()) refreshRoundSelects().catch(function () {});
    });
    unlockObs.observe(superContent, { attributes: true, attributeFilter: ["style"] });
  }

  previewBtn.addEventListener("click", async function () {
    if (errEl) errEl.textContent = "";
    if (summaryEl) summaryEl.style.display = "none";
    runBtn.disabled = true;
    lastPlan = null;
    try {
      if (!isSuperAdminUnlocked()) {
        throw new Error("Unlock super admin first (Coach / admin → Super admin).");
      }
      var teamId = getAdminTeamId();
      var srcRound = validateRoundLabel(document.getElementById("mergeSourceRound")?.value);
      var dstRound = validateRoundLabel(document.getElementById("mergeDestRound")?.value);
      if (!srcRound || !dstRound) throw new Error("Select valid source and destination rounds.");
      if (voteRoundLabel({ round: srcRound }) === voteRoundLabel({ round: dstRound })) {
        throw new Error("Source and destination rounds must be different.");
      }
      var data = await loadData(teamId);
      var team = (data.teams || []).find(function (t) {
        return teamIdStr(t.id) === teamIdStr(teamId);
      });
      lastPlan = planMerge(teamId, data.teams, data.votes, srcRound, dstRound);
      lastPlan.teamId = teamId;
      lastPlan.localOnly = !!data.localOnly;
      renderSummary(summaryEl, lastPlan, (team && team.name) || "Team " + teamId);
      runBtn.disabled = !lastPlan.merged.length;
      if (!lastPlan.merged.length && errEl) {
        errEl.textContent = "Nothing to merge — check duplicates, invalid names, or empty source round.";
      }
    } catch (e) {
      console.error(e);
      if (errEl) errEl.textContent = e.message || String(e);
    }
  });

  runBtn.addEventListener("click", async function () {
    if (errEl) errEl.textContent = "";
    if (!lastPlan || !lastPlan.merged.length) {
      if (errEl) errEl.textContent = "Run preview first.";
      return;
    }
    var deleteSource = !!document.getElementById("mergeDeleteSource")?.checked;
    var msg =
      "Merge " +
      lastPlan.merged.length +
      " vote(s) from " +
      lastPlan.srcLabel +
      " into " +
      lastPlan.dstLabel +
      "?" +
      (deleteSource ? " Source round votes will be deleted." : "");
    if (!confirm(msg)) return;
    var now = Date.now();
    if (now - lastMergeRunAt < MERGE_COOLDOWN_MS) {
      var waitSec = Math.ceil((MERGE_COOLDOWN_MS - (now - lastMergeRunAt)) / 1000);
      if (errEl) errEl.textContent = "Please wait " + waitSec + "s before running another merge.";
      return;
    }
    runBtn.disabled = true;
    previewBtn.disabled = true;
    try {
      lastMergeRunAt = Date.now();
      var mergedCount = 0;
      var deletedCount = 0;
      if (lastPlan.localOnly) {
        var res = runMergeLocal(lastPlan.teamId, lastPlan, deleteSource);
        mergedCount = res.merged;
        deletedCount = res.removed;
      } else {
        mergedCount = await runMergeCloud(lastPlan.teamId, lastPlan);
        if (deleteSource) {
          deletedCount = await deleteSourceVotesCloud(
            lastPlan.teamId,
            lastPlan.srcLabel,
            lastPlan.sourceVotes
          );
        }
        var freshVotes = await fetchVotesRest(lastPlan.teamId);
        var data = loadLocalData();
        var byId = Object.create(null);
        (data.votes || []).forEach(function (v) {
          if (v && v.id) byId[v.id] = v;
        });
        freshVotes.forEach(function (v) {
          if (v && v.id) byId[v.id] = v;
        });
        data.votes = Object.keys(byId).map(function (k) {
          return byId[k];
        });
        saveLocalData(data);
        notifyVotesMerged(lastPlan.teamId, freshVotes);
        await writeMergeAuditLog(lastPlan.teamId, lastPlan, mergedCount, deletedCount, deleteSource);
      }
      if (summaryEl) {
        summaryEl.style.display = "block";
        summaryEl.innerHTML =
          "<div style='font-weight:800;color:#15803d'>Merge complete</div>" +
          "<div style='margin-top:0.35rem'>Merged <strong>" +
          mergedCount +
          "</strong> vote(s) into " +
          escapeHtml(lastPlan.dstLabel) +
          ".</div>" +
          (deleteSource
            ? "<div style='margin-top:0.25rem'>Removed <strong>" +
              deletedCount +
              "</strong> vote(s) from " +
              escapeHtml(lastPlan.srcLabel) +
              ".</div>"
            : "") +
          (lastPlan.localOnly
            ? "<p class='hint' style='margin:0.45rem 0 0'>Results updated in this browser.</p>"
            : "<p class='hint' style='margin:0.45rem 0 0'>Cloud updated — admin results refreshed.</p>");
      }
      lastPlan = null;
      setTimeout(refreshRoundSelects, 500);
    } catch (e) {
      console.error(e);
      if (errEl) errEl.textContent = e.message || String(e);
      runBtn.disabled = false;
    } finally {
      previewBtn.disabled = false;
    }
  });
}

function observeAdminMount() {
  var mount = document.getElementById("adminDeferredMount");
  if (!mount) return;
  var wired = false;
  function wireOnce() {
    if (wired || !document.getElementById("mergeSourceRound")) return;
    wired = true;
    try {
      obs.disconnect();
    } catch (e) {}
    wireMergeUi();
    refreshRoundSelects().catch(function () {});
  }
  var obs = new MutationObserver(wireOnce);
  obs.observe(mount, { childList: true, subtree: true });
  wireOnce();
}

try {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeAdminMount, { once: true });
  } else {
    observeAdminMount();
  }
} catch (e) {
  console.warn("merge-rounds: init failed", e);
}
