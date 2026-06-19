/**
 * Admin: merge team votes from one round into another (super admin).
 * Lazy-loaded alongside app.min.js; uses window.__svFirebaseApp / __svAuth (no CDN Firebase imports).
 */
const STORAGE_KEY = "soccerVoteApp_v2";
const ADMIN_SESSION_KEY = "soccerVoteAdminUnlock";

function qo(c) {
  return String(c || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function nameKey(c) {
  return (
    qo(c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "x"
  );
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
  var tabs = document.querySelectorAll("#adminTeamTabs button");
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].classList.contains("active")) return i + 1;
  }
  var sel = document.getElementById("resultsTeamSelect");
  if (sel) return parseInt(sel.value, 10) || 1;
  return 1;
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
  (votes || []).forEach(function (v) {
    if (!v || teamIdStr(v.teamId) !== teamIdStr(teamId)) return;
    var rl = voteRoundLabel(v);
    if (rl) map[rl] = true;
  });
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

function isOnSquad(voterName, playerKeys) {
  return !!playerKeys[qo(voterName)];
}

function planMerge(teamId, teams, votes, srcRound, dstRound) {
  var srcLabel = voteRoundLabel({ round: srcRound });
  var dstLabel = voteRoundLabel({ round: dstRound });
  var team = (teams || []).find(function (t) {
    return teamIdStr(t.id) === teamIdStr(teamId);
  });
  var playerKeys = buildPlayerKeySet(team && team.players);

  var destKeys = Object.create(null);
  (votes || []).forEach(function (v) {
    if (!v || teamIdStr(v.teamId) !== teamIdStr(teamId)) return;
    if (voteRoundLabel(v) !== dstLabel) return;
    destKeys[v.voterNameKey || nameKey(v.voterName)] = true;
  });

  var merged = [];
  var skippedDup = [];
  var invalid = [];
  var sourceVotes = (votes || []).filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId) && voteRoundLabel(v) === srcLabel;
  });

  sourceVotes.forEach(function (v) {
    var key = v.voterNameKey || nameKey(v.voterName);
    if (!isOnSquad(v.voterName, playerKeys)) {
      invalid.push(v.voterName || "(unnamed)");
      return;
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
    dstRoundKey: nameKey(dstLabel),
    sourceVotes: sourceVotes,
    merged: merged,
    skippedDup: skippedDup,
    invalid: invalid,
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
  if (plan.invalid.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Invalid names</summary><p class='hint' style='margin:0.35rem 0 0'>" +
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

function projectId() {
  var app = window.__svFirebaseApp;
  return app && app.options && app.options.projectId ? app.options.projectId : "";
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
  var url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(pid) +
    "/databases/(default)/documents:runQuery";
  var res = await fetch(url, {
    method: "POST",
    headers: await authHeaders(),
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
  var pid = projectId();
  if (!pid) throw new Error("Cloud not connected.");
  var url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(pid) +
    "/databases/(default)/documents/config/main";
  var res = await fetch(url, { headers: await authHeaders() });
  if (res.status === 404) return [];
  var row = await res.json();
  if (!res.ok) {
    var msg = row && row.error && row.error.message ? row.error.message : "Config load failed";
    throw new Error(msg);
  }
  var teams = row.fields && row.fields.teams ? parseFsValue(row.fields.teams) : [];
  return Array.isArray(teams) ? teams : [];
}

async function fetchVotesRest(teamId) {
  var byId = Object.create(null);
  for (var i = 0; i < 2; i++) {
    var tid = i === 0 ? teamId : String(teamId);
    var rows = await runQuery({
      from: [{ collectionId: "votes" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "teamId" },
          op: "EQUAL",
          value: fsValue(tid),
        },
      },
    });
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
    var res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ writes: chunk }),
    });
    var body = await res.json();
    if (!res.ok) {
      var msg = body && body.error && body.error.message ? body.error.message : "Batch write failed";
      throw new Error(msg);
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
  if (!window.__svAuth || !window.__svAuth.currentUser) {
    throw new Error("Sign in as super admin first (Coach / admin → Super admin → Unlock).");
  }
  var teams = await getConfigTeams();
  var votes = await fetchVotesRest(teamId);
  return { teams: teams, votes: votes, cloudRest: true };
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

async function loadData(teamId) {
  var app = await waitForApp(500);
  if (app && window.__svAuth && window.__svAuth.currentUser) {
    try {
      return await loadCloudData(teamId);
    } catch (e) {
      if (isSuperAdminUnlocked()) {
        var local = loadLocalData();
        return { teams: local.teams || [], votes: local.votes || [], localOnly: true };
      }
      throw e;
    }
  }
  if (!isSuperAdminUnlocked()) throw new Error("Unlock super admin first.");
  var localData = loadLocalData();
  return { teams: localData.teams || [], votes: localData.votes || [], localOnly: true };
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
      updateMask: { fieldPaths: ["teamId", "voterName", "voterNameKey", "round", "picks", "submittedAt"] },
    };
  });
  if (writes.length) await batchWrite(writes);
  return writes.length;
}

function runMergeLocal(teamId, plan, deleteSource) {
  var data = loadLocalData();
  data.votes = data.votes || [];
  var dstRoundKey = plan.dstRoundKey;
  plan.merged.forEach(function (v) {
    var key = v.voterNameKey || nameKey(v.voterName);
    var newId = "t" + teamId + "_r" + dstRoundKey + "_v" + key;
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
  var removed = 0;
  if (deleteSource) {
    var before = data.votes.length;
    data.votes = data.votes.filter(function (v) {
      return !(v && teamIdStr(v.teamId) === teamIdStr(teamId) && voteRoundLabel(v) === plan.srcLabel);
    });
    removed = before - data.votes.length;
  }
  saveLocalData(data);
  return { merged: plan.merged.length, removed: removed };
}

var lastPlan = null;
var bound = false;

async function refreshRoundSelects() {
  if (!isSuperAdminUnlocked()) return;
  var srcSel = document.getElementById("mergeSourceRound");
  var dstSel = document.getElementById("mergeDestRound");
  if (!srcSel || !dstSel) return;
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
  } catch (e) {
    console.warn("merge rounds: could not refresh selects", e);
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
      var srcRound = document.getElementById("mergeSourceRound")?.value;
      var dstRound = document.getElementById("mergeDestRound")?.value;
      if (!srcRound || !dstRound) throw new Error("Select source and destination rounds.");
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
    runBtn.disabled = true;
    previewBtn.disabled = true;
    try {
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
            ? "<p class='hint' style='margin:0.45rem 0 0'>Refresh the page to see updated results.</p>"
            : "<p class='hint' style='margin:0.45rem 0 0'>Results will update on next sync.</p>");
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
  var obs = new MutationObserver(function () {
    if (document.getElementById("mergeSourceRound")) {
      wireMergeUi();
      refreshRoundSelects().catch(function () {});
    }
  });
  obs.observe(mount, { childList: true, subtree: true });
  if (document.getElementById("mergeSourceRound")) {
    wireMergeUi();
    refreshRoundSelects().catch(function () {});
  }
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
