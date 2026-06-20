/**
 * Voter UX enhancements — companion to app.min.js (no Firebase CDN imports).
 * Features: already-voted banner, duplicate warn, offline queue, who hasn't voted, lineup share pack, dark mode.
 */
import {
  matchSquadToVoters,
  normalizeName,
  displayPlayerName,
  DEFAULT_SQUAD_THRESHOLD,
} from "./name-match.js?tag=v132";

const STORAGE_KEY = "soccerVoteApp_v2";
const PREFS_KEY = STORAGE_KEY + "_cache";
const PUBLIC_PREFS = STORAGE_KEY + "_public_prefs";
const OFFLINE_QUEUE_KEY = STORAGE_KEY + "_offline_vote_queue";
const THEME_KEY = STORAGE_KEY + "_theme";

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

const ADMIN_SESSION_KEY = "soccerVoteAdminUnlock";

function isSuperAdminUnlocked() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

async function fetchConfigTeams() {
  if (!window.__svFirebaseApp || !projectId()) return [];
  var url = firestoreUrl("config/main");
  if (!url) return [];
  try {
    var res = await fetch(url, { headers: await restHeaders() });
    if (!res.ok) return [];
    var row = await res.json();
    var teams = row.fields && row.fields.teams ? parseFsValue(row.fields.teams) : [];
    return Array.isArray(teams) ? teams : [];
  } catch (e) {
    console.warn("[voter-enhancements] config fetch failed", e);
    return [];
  }
}

async function resolveTeamSquad(teamId, localTeams) {
  var team = (localTeams || []).find(function (t) {
    return String(t.id) === String(teamId);
  });
  if (team && team.players && team.players.length) return team.players.filter(Boolean);
  var cloudTeams = await fetchConfigTeams();
  var cloudTeam = cloudTeams.find(function (t) {
    return String(t.id) === String(teamId);
  });
  return cloudTeam && cloudTeam.players ? cloudTeam.players.filter(Boolean) : [];
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

function getPublicPrefs() {
  try {
    var raw = localStorage.getItem(PUBLIC_PREFS);
    return raw ? JSON.parse(raw) : { teamId: 1, roundByTeam: {} };
  } catch {
    return { teamId: 1, roundByTeam: {} };
  }
}

function getCurrentTeamId() {
  var sel = document.getElementById("publicTeamSelect");
  if (sel && sel.value) return parseInt(sel.value, 10) || 1;
  return parseInt(getPublicPrefs().teamId, 10) || 1;
}

function getCurrentRound(teamId) {
  var roundSel = document.getElementById("publicRoundSelect");
  if (roundSel && roundSel.value) return normalizeRoundLabel(roundSel.value) || roundSel.value;
  var prefs = getPublicPrefs();
  var r = prefs.roundByTeam && prefs.roundByTeam[String(teamId)];
  if (r) return normalizeRoundLabel(r) || r;
  var data = loadLocalData();
  var team = (data.teams || []).find(function (t) {
    return String(t.id) === String(teamId);
  });
  return normalizeRoundLabel(team && team.round) || "Round 1";
}

function projectId() {
  var app = window.__svFirebaseApp;
  return app && app.options && app.options.projectId ? app.options.projectId : "";
}

function apiKey() {
  var app = window.__svFirebaseApp;
  return app && app.options && app.options.apiKey ? app.options.apiKey : "";
}

async function restHeaders() {
  var headers = { "Content-Type": "application/json" };
  var auth = window.__svAuth;
  if (auth && auth.currentUser) {
    try {
      var token = await auth.currentUser.getIdToken();
      headers.Authorization = "Bearer " + token;
    } catch (e) {
      console.warn("[voter-enhancements] could not get auth token", e);
    }
  }
  return headers;
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

function findExistingVote(teamId, voterName, roundLabel) {
  var key = nameKey(voterName);
  var round = voteRoundLabel({ round: roundLabel });
  var docId = "t" + teamId + "_r" + nameKey(round) + "_v" + key;
  var data = loadLocalData();
  var hit = (data.votes || []).find(function (v) {
    if (!v) return false;
    if (v.id === docId) return true;
    return (
      String(v.teamId) === String(teamId) &&
      voteRoundLabel(v) === round &&
      (v.voterNameKey === key || qo(v.voterName) === qo(voterName))
    );
  });
  return hit || null;
}

function setBannerVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("is-visible", !!visible);
  el.style.display = visible ? "block" : "";
}

function ensureAlreadyVotedBanner() {
  var wrap = document.querySelector(".vote-name-wrap");
  if (!wrap) return null;
  var el = document.getElementById("alreadyVotedBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "alreadyVotedBanner";
    el.className = "banner banner--already-voted";
    el.setAttribute("role", "status");
    wrap.insertAdjacentElement("afterend", el);
  }
  return el;
}

function updateAlreadyVotedBanner() {
  var banner = ensureAlreadyVotedBanner();
  if (!banner) return;
  var nameInput = document.getElementById("voterNameInput");
  var name = nameInput ? nameInput.value.trim() : "";
  if (!name) {
    setBannerVisible(banner, false);
    banner.textContent = "";
    return;
  }
  var teamId = getCurrentTeamId();
  var round = getCurrentRound(teamId);
  var existing = findExistingVote(teamId, name, round);
  if (!existing) {
    setBannerVisible(banner, false);
    return;
  }
  var picks = (existing.picks || []).join(" · ");
  setBannerVisible(banner, true);
  banner.innerHTML =
    "<strong>You already voted</strong> this round as <em>" +
    escapeHtml(name) +
    "</em>" +
    (picks ? " — " + escapeHtml(picks) + "." : ".") +
    " Submitting again will replace your ballot.";
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wireDuplicateSubmitGuard() {
  var btn = document.getElementById("submitVote");
  if (!btn || btn._svDupGuard) return;
  btn._svDupGuard = true;
  btn.addEventListener(
    "click",
    function (ev) {
      var nameInput = document.getElementById("voterNameInput");
      var name = nameInput ? nameInput.value.trim() : "";
      if (!name) return;
      var teamId = getCurrentTeamId();
      var round = getCurrentRound(teamId);
      var existing = findExistingVote(teamId, name, round);
      if (!existing) return;
      var picks = (existing.picks || []).join(" · ");
      var msg =
        name +
        " already has a ballot for " +
        round +
        (picks ? " (" + picks + ")." : ".") +
        "\n\nSubmit again to replace it?";
      if (!confirm(msg)) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }
    },
    true
  );
}

function loadOfflineQueue() {
  try {
    var raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    var q = raw ? JSON.parse(raw) : [];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(q) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

function fsValue(val) {
  if (val == null) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) return { arrayValue: { values: val.map(fsValue) } };
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

async function submitVoteRest(docId, payload) {
  if (!projectId()) throw new Error("Cloud not ready");
  var url = firestoreUrl("votes/" + encodeURIComponent(docId));
  if (!url) throw new Error("Cloud not ready");
  var res = await fetch(url, {
    method: "PATCH",
    headers: await restHeaders(),
    body: JSON.stringify({
      fields: {
        teamId: fsValue(payload.teamId),
        voterName: fsValue(payload.voterName),
        voterNameKey: fsValue(payload.voterNameKey),
        round: fsValue(payload.round),
        picks: fsValue(payload.picks),
        submittedAt: fsValue(payload.submittedAt),
      },
    }),
  });
  if (!res.ok) {
    var body = await res.json().catch(function () {
      return {};
    });
    throw new Error((body.error && body.error.message) || "Vote submit failed");
  }
}

async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  var q = loadOfflineQueue();
  if (!q.length) return;
  if (!window.__svFirebaseApp) return;
  var remaining = [];
  var flushed = 0;
  for (var i = 0; i < q.length; i++) {
    var item = q[i];
    try {
      await submitVoteRest(item.docId, item.payload);
      flushed++;
    } catch (e) {
      console.warn("[offline-queue] retry failed", item.docId, e);
      remaining.push(item);
    }
  }
  saveOfflineQueue(remaining);
  if (flushed) {
    console.log("[offline-queue] flushed", flushed, "vote(s)");
    window.dispatchEvent(new CustomEvent("sv-votes-merged", { detail: {} }));
    var status = document.getElementById("offlineBanner");
    if (status) {
      setBannerVisible(status, true);
      status.textContent = "Back online — sent " + flushed + " queued vote(s).";
      setTimeout(function () {
        if (navigator.onLine) updateOfflineBanner();
      }, 4000);
    }
  }
}

function updateOfflineBanner() {
  var banner = document.getElementById("offlineBanner");
  if (!banner) return;
  var q = loadOfflineQueue();
  if (!navigator.onLine) {
    setBannerVisible(banner, true);
    banner.textContent =
      q.length > 0
        ? "You're offline. " + q.length + " vote(s) queued — will submit when back online."
        : "You're offline. You can still pick players; votes queue until you're back online.";
    return;
  }
  if (q.length > 0) {
    setBannerVisible(banner, true);
    banner.textContent = "Vote queued (" + q.length + "). Submitting when connection is stable…";
    return;
  }
  setBannerVisible(banner, false);
}

function wireOfflineQueue() {
  var btn = document.getElementById("submitVote");
  if (!btn || btn._svOfflineQueue) return;
  btn._svOfflineQueue = true;

  btn.addEventListener(
    "click",
    function (ev) {
      if (navigator.onLine) return;
      var nameInput = document.getElementById("voterNameInput");
      var name = nameInput ? nameInput.value.trim() : "";
      if (!name) return;
      var picksRow = document.getElementById("picksRow");
      var picks = [];
      if (picksRow) {
        picksRow.querySelectorAll(".pick-chip").forEach(function (chip) {
          var spans = chip.querySelectorAll("span");
          if (spans.length >= 2) picks.push(spans[1].textContent.trim());
        });
      }
      if (picks.length !== 3) return;
      var teamId = getCurrentTeamId();
      var round = getCurrentRound(teamId);
      var voterKey = nameKey(name);
      var roundKey = nameKey(round);
      var docId = "t" + teamId + "_r" + roundKey + "_v" + voterKey;
      var payload = {
        teamId: teamId,
        voterName: name,
        voterNameKey: voterKey,
        round: round,
        picks: picks,
        submittedAt: new Date().toISOString(),
      };
      var q = loadOfflineQueue().filter(function (x) {
        return x.docId !== docId;
      });
      q.push({ docId: docId, payload: payload, queuedAt: Date.now() });
      saveOfflineQueue(q);
      ev.stopImmediatePropagation();
      ev.preventDefault();
      var msg = document.getElementById("voteMsg");
      if (msg) {
        msg.style.color = "#a16207";
        msg.textContent = "Offline — vote queued. It will submit when you're back online.";
      }
      updateOfflineBanner();
    },
    true
  );

  window.addEventListener("online", function () {
    updateOfflineBanner();
    flushOfflineQueue().catch(function (e) {
      console.warn("[offline-queue]", e);
    });
  });
  window.addEventListener("offline", updateOfflineBanner);
  updateOfflineBanner();
  if (navigator.onLine) flushOfflineQueue().catch(function () {});
}

var cloudVotesCache = Object.create(null);
var cloudVotesInflight = Object.create(null);

async function fetchCloudVotes(teamId, force) {
  var tid = String(teamId);
  if (!force && cloudVotesCache[tid] && Date.now() - cloudVotesCache[tid].at < 15000) {
    return cloudVotesCache[tid].votes;
  }
  if (cloudVotesInflight[tid]) return cloudVotesInflight[tid];
  if (!window.__svFirebaseApp || !projectId()) return [];

  cloudVotesInflight[tid] = (async function () {
    var byId = Object.create(null);
    var url = firestoreUrl(":runQuery");
    if (!url) return [];
    for (var i = 0; i < 2; i++) {
      var teamVal = i === 0 ? parseInt(teamId, 10) || 1 : String(teamId);
      var structuredQuery = {
        from: [{ collectionId: "votes" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "teamId" },
            op: "EQUAL",
            value: fsValue(teamVal),
          },
        },
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      };
      var startAt = null;
      for (var page = 0; page < 20; page++) {
        var query = structuredQuery;
        if (startAt) query = Object.assign({}, structuredQuery, { startAt: startAt });
        var res = await fetch(url, {
          method: "POST",
          headers: await restHeaders(),
          body: JSON.stringify({ structuredQuery: query }),
        });
        var rows = await res.json().catch(function () {
          return [];
        });
        if (!res.ok) {
          console.warn("[who-hasnt-voted] cloud query failed", rows.error || res.status);
          break;
        }
        if (!Array.isArray(rows) || !rows.length) break;
        var lastDoc = null;
        var gotDoc = false;
        rows.forEach(function (row) {
          if (!row || !row.document) return;
          lastDoc = row.document;
          gotDoc = true;
          var id = docPath(row.document.name);
          if (!id || byId[id]) return;
          var data = {};
          var fields = row.document.fields || {};
          Object.keys(fields).forEach(function (k) {
            data[k] = parseFsValue(fields[k]);
          });
          byId[id] = Object.assign({ id: id }, data);
        });
        if (!gotDoc || !lastDoc) break;
        startAt = { values: [{ referenceValue: lastDoc.name }], before: false };
        if (rows.length < 300) break;
      }
    }
    var votes = Object.keys(byId).map(function (id) {
      return byId[id];
    });
    cloudVotesCache[tid] = { at: Date.now(), votes: votes };
    return votes;
  })();

  try {
    return await cloudVotesInflight[tid];
  } finally {
    delete cloudVotesInflight[tid];
  }
}

function mergeVotesLists() {
  var byId = Object.create(null);
  for (var i = 0; i < arguments.length; i++) {
    (arguments[i] || []).forEach(function (v) {
      if (!v) return;
      var id = v.id || "t" + v.teamId + "|" + (v.voterNameKey || v.voterName) + "|" + voteRoundLabel(v);
      byId[id] = v;
    });
  }
  return Object.keys(byId).map(function (k) {
    return byId[k];
  });
}

function ensureWhoHasntVotedBlock() {
  var results = document.getElementById("resultsSummaryCard");
  if (!results || document.getElementById("whoHasntVotedBlock")) return;
  var details = document.createElement("details");
  details.id = "whoHasntVotedBlock";
  details.className = "subcard";
  details.style.cssText = "padding:0.65rem 0.75rem; margin:0.5rem 0 0";
  details.innerHTML =
    "<summary style='cursor:pointer;font-weight:800;color:var(--red-dark)'>Who has / hasn't voted?</summary>" +
    "<p class='hint' style='margin:0.35rem 0 0'>Ballots this round vs squad list (local + cloud, fuzzy name match).</p>" +
    "<div id='whoVotedList' style='margin-top:0.45rem;font-size:0.9rem;line-height:1.5'></div>" +
    "<div id='whoHasntVotedList' style='margin-top:0.45rem;font-size:0.9rem;line-height:1.5'></div>" +
    "<p id='whoVoteStatusHint' class='hint' style='margin:0.35rem 0 0'></p>";
  results.insertAdjacentElement("afterend", details);
}

async function updateWhoHasntVoted() {
  ensureWhoHasntVotedBlock();
  var votedEl = document.getElementById("whoVotedList");
  var listEl = document.getElementById("whoHasntVotedList");
  var statusEl = document.getElementById("whoVoteStatusHint");
  var teamSel = document.getElementById("resultsTeamSelect");
  var roundSel = document.getElementById("resultsRoundSelect");
  if (!listEl || !teamSel || !roundSel) return;
  var teamId = parseInt(teamSel.value, 10) || 1;
  var round = normalizeRoundLabel(roundSel.value) || roundSel.value || "Round 1";
  var data = loadLocalData();
  listEl.innerHTML = "<span class='hint admin-loading'>Loading cloud votes…</span>";
  if (votedEl) votedEl.innerHTML = "";
  if (statusEl) statusEl.textContent = "Fetching ballots from cloud…";

  var squad = await resolveTeamSquad(teamId, data.teams || []);
  if (!squad.length) {
    listEl.innerHTML = "<span class='hint'>No squad list saved (check config sync).</span>";
    return;
  }

  var localVotes = (data.votes || []).filter(function (v) {
    return v && String(v.teamId) === String(teamId);
  });
  var cloudVotes = [];
  var cloudErr = "";
  try {
    cloudVotes = await fetchCloudVotes(teamId, isSuperAdminUnlocked());
  } catch (e) {
    cloudErr = e.message || String(e);
    console.warn("[who-hasnt-voted]", e);
  }
  var votes = mergeVotesLists(localVotes, cloudVotes);
  var roundVotes = votes.filter(function (v) {
    return v && String(v.teamId) === String(teamId) && voteRoundLabel(v) === voteRoundLabel({ round: round });
  });
  var matched = matchSquadToVoters(squad, votes, teamId, round, voteRoundLabel, DEFAULT_SQUAD_THRESHOLD);

  if (votedEl) {
    if (matched.voted.length) {
      votedEl.innerHTML =
        "<div style='font-weight:700;color:#15803d;margin-bottom:0.25rem'>Voted (" +
        matched.voted.length +
        ")</div>" +
        escapeHtml(matched.voted.join(", "));
    } else {
      votedEl.innerHTML =
        "<div style='font-weight:700;color:#52525b;margin-bottom:0.25rem'>Voted (0)</div><span class='hint'>No ballots yet this round.</span>";
    }
  }

  if (matched.missing.length) {
    listEl.innerHTML =
      "<div style='font-weight:700;color:var(--red-dark);margin-bottom:0.25rem'>Hasn't voted (" +
      matched.missing.length +
      "/" +
      squad.length +
      ")</div>" +
      escapeHtml(matched.missing.join(", "));
  } else {
    listEl.innerHTML =
      "<div style='font-weight:700;color:#15803d;margin-bottom:0.25rem'>Hasn't voted (0)</div>" +
      "<span style='color:#15803d'>Everyone on the squad has voted.</span>";
  }

  var hints = [];
  hints.push(roundVotes.length + " ballot(s) this round");
  hints.push(squad.length + " on squad");
  hints.push(isSuperAdminUnlocked() ? "cloud refresh" : "local + public cloud read");
  if (matched.possible.length) hints.push("fuzzy: " + matched.possible.join("; "));
  if (matched.extraVoters.length) {
    var extras = matched.extraVoters.filter(function (n) {
      return displayPlayerName(n);
    });
    if (extras.length) hints.push("not on squad: " + extras.join(", "));
  }
  if (matched.extraDetails && matched.extraDetails.length) {
    hints.push(
      "mismatch detail: " +
        matched.extraDetails
          .map(function (d) {
            return d.voterName + " (" + d.reason + ")";
          })
          .join("; ")
    );
  }
  if (cloudErr) hints.push("cloud error: " + cloudErr);
  if (statusEl) statusEl.textContent = hints.join(" · ");
}

var whoHasntVotedWired = false;

function wireWhoHasntVoted() {
  var teamSel = document.getElementById("resultsTeamSelect");
  var roundSel = document.getElementById("resultsRoundSelect");
  if (!teamSel || !roundSel) return;
  ensureWhoHasntVotedBlock();
  if (!whoHasntVotedWired) {
    whoHasntVotedWired = true;
    teamSel.addEventListener("change", updateWhoHasntVoted);
    roundSel.addEventListener("change", updateWhoHasntVoted);
    window.addEventListener("sv-votes-merged", function () {
      Object.keys(cloudVotesCache).forEach(function (k) {
        delete cloudVotesCache[k];
      });
      setTimeout(updateWhoHasntVoted, 300);
    });
  }
  updateWhoHasntVoted();
}

function ensureLineupSharePackButton() {
  var copyBtn = document.getElementById("lineupCopyShareLink");
  var pngBtn = document.getElementById("lineupExportPng");
  if (!copyBtn || !pngBtn || document.getElementById("lineupSharePack")) return;
  var pack = document.createElement("button");
  pack.type = "button";
  pack.className = "primary";
  pack.id = "lineupSharePack";
  pack.textContent = "Share pack (PNG + WhatsApp)";
  pngBtn.parentNode && pngBtn.parentNode.insertBefore(pack, copyBtn);
  pack.addEventListener("click", async function () {
    try {
      pngBtn.click();
      await new Promise(function (r) {
        setTimeout(r, 400);
      });
      var teamSel = document.getElementById("publicTeamSelect");
      var roundSel = document.getElementById("publicRoundSelect");
      var teamId = teamSel ? parseInt(teamSel.value, 10) || 1 : 1;
      var round = roundSel ? roundSel.value : getCurrentRound(teamId);
      var opp = document.getElementById("matchOpponentLine");
      var opponent = opp ? opp.textContent.trim() : "opponent";
      var text =
        "Lineup — " +
        round +
        " vs " +
        opponent +
        "\n" +
        location.origin +
        location.pathname +
        "?team=" +
        teamId +
        "&round=" +
        encodeURIComponent(round) +
        "&view=lineup";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
      var wa = "https://wa.me/?text=" + encodeURIComponent(text);
      window.open(wa, "_blank", "noopener,noreferrer");
      var msg = document.getElementById("lineupEditorMsg");
      if (msg) {
        msg.style.color = "#15803d";
        msg.textContent = "PNG saved + WhatsApp text copied.";
      }
    } catch (e) {
      console.error("[lineup-share-pack]", e);
    }
  });
}

function applyTheme(mode) {
  var root = document.documentElement;
  if (mode === "dark") {
    root.setAttribute("data-theme", "dark");
  } else if (mode === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
  var btn = document.getElementById("themeToggle");
  if (btn) {
    var label = mode === "dark" ? "Dark" : mode === "light" ? "Light" : "Auto";
    btn.textContent = "Theme: " + label;
    btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
  }
}

function cycleTheme() {
  var cur = "auto";
  try {
    cur = localStorage.getItem(THEME_KEY) || "auto";
  } catch {}
  var next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
  applyTheme(next);
}

function wireThemeToggle() {
  var header = document.querySelector("header");
  if (!header || document.getElementById("themeToggle")) return;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.id = "themeToggle";
  btn.className = "ghost theme-toggle";
  btn.addEventListener("click", cycleTheme);
  header.appendChild(btn);
  var saved = "auto";
  try {
    saved = localStorage.getItem(THEME_KEY) || "auto";
  } catch {}
  applyTheme(saved);
}

function wireVoterNameListeners() {
  var input = document.getElementById("voterNameInput");
  if (!input || input._svEnhance) return;
  input._svEnhance = true;
  input.addEventListener("input", updateAlreadyVotedBanner);
  input.addEventListener("change", updateAlreadyVotedBanner);
  var teamSel = document.getElementById("publicTeamSelect");
  var roundSel = document.getElementById("publicRoundSelect");
  if (teamSel) teamSel.addEventListener("change", updateAlreadyVotedBanner);
  if (roundSel) roundSel.addEventListener("change", updateAlreadyVotedBanner);
  window.addEventListener("sv-votes-merged", function () {
    setTimeout(updateAlreadyVotedBanner, 300);
  });
  window.addEventListener("storage", function (ev) {
    if (ev.key === STORAGE_KEY) updateAlreadyVotedBanner();
  });
  updateAlreadyVotedBanner();
}

function ensureParticipationCounter() {
  var voteSection = document.getElementById("voteSection");
  if (!voteSection || document.getElementById("participationCounter")) return;
  var el = document.createElement("div");
  el.id = "participationCounter";
  el.className = "participation-pill";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML =
    "<span id='participationText'></span>" +
    "<span class='participation-bar' aria-hidden='true'><span class='participation-fill' id='participationFill' style='width:0%'></span></span>";
  var head = voteSection.querySelector(".vote-flow-head");
  if (head) head.insertAdjacentElement("afterend", el);
}

var participationInflight = null;

async function updateParticipationCounter() {
  ensureParticipationCounter();
  var el = document.getElementById("participationCounter");
  var textEl = document.getElementById("participationText");
  var fillEl = document.getElementById("participationFill");
  if (!el || !textEl) return;

  var teamId = getCurrentTeamId();
  var round = getCurrentRound(teamId);
  var data = loadLocalData();
  var squad = await resolveTeamSquad(teamId, data.teams || []);
  if (!squad.length) {
    el.classList.remove("is-visible");
    return;
  }

  textEl.textContent = "Loading participation…";
  el.classList.add("is-visible");

  var localVotes = (data.votes || []).filter(function (v) {
    return v && String(v.teamId) === String(teamId);
  });
  var cloudVotes = [];
  try {
    cloudVotes = await fetchCloudVotes(teamId, false);
  } catch (e) {
    console.warn("[participation]", e);
  }
  var votes = mergeVotesLists(localVotes, cloudVotes);
  var matched = matchSquadToVoters(squad, votes, teamId, round, voteRoundLabel, DEFAULT_SQUAD_THRESHOLD);
  var voted = matched.voted.length;
  var total = squad.length;
  var pct = total ? Math.round((voted / total) * 100) : 0;

  textEl.textContent = voted + " of " + total + " squad members have voted (" + round + ")";
  if (fillEl) fillEl.style.width = pct + "%";
  el.setAttribute("aria-label", voted + " of " + total + " squad members have voted this round");
}

function wireParticipationCounter() {
  ensureParticipationCounter();
  var teamSel = document.getElementById("publicTeamSelect");
  var roundSel = document.getElementById("publicRoundSelect");
  var refresh = function () {
    if (participationInflight) return;
    participationInflight = updateParticipationCounter()
      .catch(function (e) {
        console.warn("[participation]", e);
      })
      .finally(function () {
        participationInflight = null;
      });
  };
  if (teamSel && !teamSel._svParticipation) {
    teamSel._svParticipation = true;
    teamSel.addEventListener("change", refresh);
  }
  if (roundSel && !roundSel._svParticipation) {
    roundSel._svParticipation = true;
    roundSel.addEventListener("change", refresh);
  }
  window.addEventListener("sv-votes-merged", function () {
    setTimeout(refresh, 400);
  });
  refresh();
}

function normalizeLineupNameEl(el) {
  if (!el || el._svNameNorm) return;
  var raw = el.textContent || "";
  var norm = displayPlayerName(raw);
  if (norm && norm !== raw) el.textContent = norm;
  el._svNameNorm = true;
}

function wireLineupNameNormalize() {
  var roots = [document.getElementById("lineupCard"), document.getElementById("lineupEditorGrid")].filter(Boolean);
  if (!roots.length) return;
  var sel =
    ".nm, .lineup-xi-name, .lineup-mini-row .name, .player-chip .nm, #lineupEditorGrid .player-chip .nm, .lineup-modal-body .player-chip .nm";
  roots.forEach(function (root) {
    if (root._svNameNormObs) return;
    root._svNameNormObs = true;
    root.querySelectorAll(sel).forEach(normalizeLineupNameEl);
    var obs = new MutationObserver(function () {
      root.querySelectorAll(sel).forEach(function (el) {
        el._svNameNorm = false;
        normalizeLineupNameEl(el);
      });
    });
    obs.observe(root, { childList: true, subtree: true, characterData: true });
  });
}

function init() {
  wireVoterNameListeners();
  wireDuplicateSubmitGuard();
  wireOfflineQueue();
  wireThemeToggle();
  wireParticipationCounter();
  wireLineupNameNormalize();
}

function safeInit() {
  try {
    init();
  } catch (e) {
    console.warn("[voter-enhancements] init failed (non-fatal)", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", safeInit, { once: true });
} else {
  safeInit();
}

var adminEnhanceWired = false;
var adminObs = new MutationObserver(function () {
  if (adminEnhanceWired) return;
  if (!document.getElementById("resultsTeamSelect")) return;
  adminEnhanceWired = true;
  try {
    adminObs.disconnect();
  } catch (e) {}
  try {
    wireWhoHasntVoted();
    ensureLineupSharePackButton();
  } catch (e) {
    adminEnhanceWired = false;
    console.warn("[voter-enhancements] admin wire failed", e);
  }
});
var adminMount = document.getElementById("adminDeferredMount");
if (adminMount) adminObs.observe(adminMount, { childList: true, subtree: true });
