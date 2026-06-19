/**
 * Admin: merge team votes from one round into another (super admin).
 * Loaded alongside app.min.js; uses window.__svFirebaseApp when cloud is active.
 */
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

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
      "<details style='margin-top:0.35rem'><summary>Invalid names</summary><p class='hint' style='margin:0.35rem 0 0'>" +
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

async function loadCloudData(teamId) {
  var app = await waitForApp(25000);
  if (!app) throw new Error("Cloud not connected. Wait for sync or refresh.");
  var auth = getAuth(app);
  if (!auth.currentUser) throw new Error("Sign in as super admin first (Coach / admin → Super admin → Unlock).");
  var db = getFirestore(app);
  var configSnap = await getDoc(doc(db, "config", "main"));
  var teams = (configSnap.exists() && configSnap.data().teams) || [];
  var votes = await fetchVotes(db, teamId);
  return { teams: teams, votes: votes, db: db, app: app };
}

async function fetchVotes(db, teamId) {
  var q1 = query(collection(db, "votes"), where("teamId", "==", teamId));
  var q2 = query(collection(db, "votes"), where("teamId", "==", String(teamId)));
  var snaps = await Promise.all([getDocs(q1), getDocs(q2)]);
  var byId = Object.create(null);
  snaps.forEach(function (snap) {
    snap.docs.forEach(function (d) {
      if (!byId[d.id]) {
        var data = d.data();
        byId[d.id] = Object.assign({ id: d.id }, data);
      }
    });
  });
  return Object.keys(byId).map(function (id) {
    return byId[id];
  });
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
  if (app) {
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

async function deleteSourceVotesCloud(db, teamId, srcLabel, sourceVotes) {
  var ids = Object.create(null);
  sourceVotes.forEach(function (v) {
    if (v && v.id) ids[v.id] = true;
  });
  var extra = await fetchVotes(db, teamId);
  extra.forEach(function (v) {
    if (v && voteRoundLabel(v) === srcLabel) ids[v.id] = true;
  });
  var idList = Object.keys(ids);
  for (var i = 0; i < idList.length; i += 400) {
    var batch = writeBatch(db);
    idList.slice(i, i + 400).forEach(function (id) {
      batch.delete(doc(db, "votes", id));
    });
    await batch.commit();
  }
  return idList.length;
}

async function runMergeCloud(db, teamId, plan) {
  var batch = writeBatch(db);
  var count = 0;
  plan.merged.forEach(function (v) {
    var key = v.voterNameKey || nameKey(v.voterName);
    var newId = "t" + teamId + "_r" + plan.dstRoundKey + "_v" + key;
    var data = {
      teamId: teamId,
      voterName: v.voterName,
      voterNameKey: key,
      round: plan.dstLabel,
      picks: Array.isArray(v.picks) ? v.picks.slice() : [],
      submittedAt: v.submittedAt || new Date().toISOString(),
    };
    batch.set(doc(db, "votes", newId), data);
    count++;
  });
  if (count) await batch.commit();
  return count;
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

  document.getElementById("adminTeamTabs")?.addEventListener("click", function () {
    setTimeout(refreshRoundSelects, 80);
  });

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
      lastPlan.db = data.db || null;
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
        if (!lastPlan.db) throw new Error("Cloud database not available.");
        mergedCount = await runMergeCloud(lastPlan.db, lastPlan.teamId, lastPlan);
        if (deleteSource) {
          deletedCount = await deleteSourceVotesCloud(
            lastPlan.db,
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
            : "");
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

  refreshRoundSelects();
}

function observeAdminMount() {
  var mount = document.getElementById("adminDeferredMount");
  if (!mount) return;
  var obs = new MutationObserver(function () {
    if (document.getElementById("mergeSourceRound")) {
      wireMergeUi();
      refreshRoundSelects();
    }
  });
  obs.observe(mount, { childList: true, subtree: true });
  if (document.getElementById("mergeSourceRound")) wireMergeUi();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeAdminMount, { once: true });
} else {
  observeAdminMount();
}
