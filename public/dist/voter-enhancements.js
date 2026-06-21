/**
 * Voter UX enhancements — companion to app.min.js (no Firebase CDN imports).
 * Features: already-voted banner, duplicate warn, offline queue, who hasn't voted, lineup share pack, dark mode.
 */
import {
  matchSquadToVoters,
  normalizeName,
  displayPlayerName,
  canonicalPlayerName,
  nameSimilarity,
  findAmbiguousByFirstName,
  findSquadMatch,
  eligibleSquadPlayers,
  dedupeVotesOnePerSquad,
  resolveCoachSlotForVoterName,
  voterNameKey,
  classifyBallotNameMatch,
  isVoteExcludedFromTally,
  DEFAULT_SQUAD_THRESHOLD,
} from "./name-match.js?tag=v170";

const STORAGE_KEY = "soccerVoteApp_v2";
const PREFS_KEY = STORAGE_KEY + "_cache";
const PUBLIC_PREFS = STORAGE_KEY + "_public_prefs";
const OFFLINE_QUEUE_KEY = STORAGE_KEY + "_offline_vote_queue";
const THEME_KEY = STORAGE_KEY + "_theme";

function assetTag() {
  try {
    var m = document.querySelector('meta[name="sv-app-version"]');
    var n = m ? String(m.getAttribute("content") || "").trim() : "";
    if (n) return "v" + n;
  } catch (e) {}
  return "v170";
}

function distImport(path) {
  return import(path + "?tag=" + assetTag());
}

function debounce(fn, ms) {
  var t = 0;
  return function () {
    clearTimeout(t);
    var args = arguments;
    t = setTimeout(function () {
      fn.apply(null, args);
    }, ms);
  };
}

function qo(c) {
  return normalizeName(c);
}

function nameKey(c) {
  return voterNameKey(c);
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

function getTeamFromData(data, teamId) {
  return (data.teams || []).find(function (t) {
    return String(t.id) === String(teamId);
  });
}

function getVoteMeta(team, round) {
  if (!team || !team.voteMetaByRound) return { excluded: [], aliases: {} };
  var rk = normalizeRoundLabel(round) || round;
  var meta = team.voteMetaByRound[rk] || team.voteMetaByRound[round] || {};
  return {
    excluded: Array.isArray(meta.excluded) ? meta.excluded.slice() : [],
    aliases: meta.aliases && typeof meta.aliases === "object" ? Object.assign({}, meta.aliases) : {},
  };
}

function saveVoteMeta(teamId, round, patch) {
  var rk = normalizeRoundLabel(round) || round;
  if (typeof window.__svPatchVoteMeta === "function") {
    window.__svPatchVoteMeta(teamId, rk, patch);
  } else {
    var data = loadLocalData();
    var team = getTeamFromData(data, teamId);
    if (!team) return;
    team.voteMetaByRound = team.voteMetaByRound || {};
    var cur = getVoteMeta(team, rk);
    if (patch.excluded) cur.excluded = patch.excluded.slice();
    if (patch.aliases) cur.aliases = Object.assign({}, cur.aliases, patch.aliases);
    if (patch.addAlias && patch.addAlias.from && patch.addAlias.to) {
      cur.aliases[normalizeName(patch.addAlias.from)] = displayPlayerName(patch.addAlias.to);
    }
    team.voteMetaByRound[rk] = cur;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[vote-meta]", e);
    }
  }
  if (typeof window.__svSyncConfig === "function") {
    window.__svSyncConfig().catch(function (e) {
      console.warn("[vote-meta] cloud sync", e);
    });
  }
}

function computeParticipation(squad, votes, teamId, round, meta) {
  var m = meta || { excluded: [], aliases: {} };
  return matchSquadToVoters(squad, votes, teamId, round, voteRoundLabel, DEFAULT_SQUAD_THRESHOLD, {
    excluded: m.excluded,
    aliases: m.aliases,
  });
}

function syncVotesReceivedCount(ballotCount) {
  var el = document.getElementById("votesReceivedCount");
  if (el && ballotCount != null) el.textContent = String(ballotCount);
}

function resolveSquadSync(teamId, data) {
  var team = getTeamFromData(data, teamId);
  var squad = (team && Array.isArray(team.players) ? team.players : []).filter(Boolean);
  if (!squad.length) {
    try {
      if (typeof window.__svTeamPlayers === "function") {
        var fromApp = window.__svTeamPlayers(teamId);
        if (fromApp && fromApp.length) squad = fromApp.filter(Boolean);
      }
    } catch (e) {}
  }
  return { team: team, squad: squad };
}

/** Hook for app.min.js results tally — one ballot per squad member (latest wins). */
window.__svDedupeVotesForTally = function (teamId, round, votes) {
  try {
    var data = loadLocalData();
    var resolved = resolveSquadSync(teamId, data);
    if (!resolved.squad.length) return votes || [];
    var meta = getVoteMeta(resolved.team, round);
    var merged = votes || [];
    var cached = cloudVotesCache[String(teamId)];
    if (cached && cached.votes && cached.votes.length) {
      merged = mergeVotesLists(merged, cached.votes);
    }
    var out = dedupeVotesOnePerSquad(
      resolved.squad,
      merged,
      teamId,
      round,
      voteRoundLabel,
      DEFAULT_SQUAD_THRESHOLD,
      { aliases: meta.aliases }
    );
    return out.votesForTally || [];
  } catch (e) {
    console.warn("[dedupe-tally]", e);
    return votes || [];
  }
};

window.__svEnrichVotePayload = function (voterName, teamId, payload) {
  try {
    var data = loadLocalData();
    var team = getTeamFromData(data, teamId);
    var squad = (team && team.players ? team.players : []).filter(Boolean);
    var meta = getVoteMeta(team, payload && payload.round);
    var cls = classifyBallotNameMatch(voterName, squad, { aliases: meta.aliases });
    return {
      nameMatchStatus: cls.nameMatchStatus,
      tallyExcluded: cls.tallyExcluded,
      adminApproved: cls.adminApproved,
      matchedPlayer: cls.matchedPlayer || null,
      nameMatchReason: cls.reason || "",
    };
  } catch (e) {
    console.warn("[vote-enrich]", e);
    return {};
  }
};

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

function getTeamCoachNames(teamId) {
  var data = loadLocalData();
  var team = (data.teams || []).find(function (t) {
    return String(t.id) === String(teamId);
  });
  return {
    coach1: (team && team.coach1Name) || "Coach 1",
    coach2: (team && team.coach2Name) || "Coach 2",
  };
}

function isCoachVoterName(name, teamId) {
  var data = loadLocalData();
  var team = getTeamFromData(data, teamId);
  return !!resolveCoachSlotForVoterName(name, team);
}

function coachVoteRedirectMessage(teamId) {
  var coaches = getTeamCoachNames(teamId);
  return (
    coaches.coach1 +
    " and " +
    coaches.coach2 +
    " can vote here — ballots route to coach results automatically."
  );
}

function findExistingCoachVote(teamId, slot, roundLabel) {
  var round = voteRoundLabel({ round: roundLabel });
  var data = loadLocalData();
  return (
    (data.coachVotes || []).find(function (v) {
      if (!v) return false;
      return (
        String(v.teamId) === String(teamId) &&
        parseInt(v.slot, 10) === parseInt(slot, 10) &&
        voteRoundLabel(v) === round
      );
    }) || null
  );
}

async function submitCoachVoteRest(payload) {
  if (!projectId()) throw new Error("Cloud not ready");
  var url = firestoreUrl("coachVotes");
  if (!url) throw new Error("Cloud not ready");
  var res = await fetch(url, {
    method: "POST",
    headers: await restHeaders(),
    body: JSON.stringify({
      fields: {
        teamId: fsValue(payload.teamId),
        slot: fsValue(payload.slot),
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
    throw new Error((body.error && body.error.message) || "Coach vote submit failed");
  }
  var json = await res.json().catch(function () {
    return {};
  });
  return json;
}

function saveCoachVoteLocal(payload, cloudId) {
  var data = loadLocalData();
  data.coachVotes = data.coachVotes || [];
  var round = voteRoundLabel({ round: payload.round });
  data.coachVotes = data.coachVotes.filter(function (v) {
    if (!v) return false;
    return !(
      String(v.teamId) === String(payload.teamId) &&
      parseInt(v.slot, 10) === parseInt(payload.slot, 10) &&
      voteRoundLabel(v) === round
    );
  });
  var localId =
    cloudId ||
    "coach_" + payload.teamId + "_s" + payload.slot + "_r" + nameKey(payload.round);
  data.coachVotes.push(
    Object.assign({}, payload, {
      id: localId,
      submittedAt: payload.submittedAt || new Date().toISOString(),
    })
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[coach-vote-local]", e);
  }
}

window.__svResolveCoachSlot = function (voterName, teamId) {
  try {
    var data = loadLocalData();
    var team = getTeamFromData(data, teamId);
    return resolveCoachSlotForVoterName(voterName, team);
  } catch (e) {
    console.warn("[coach-slot]", e);
    return null;
  }
};

window.__svSubmitCoachVoteFromPlayerUI = async function (opts) {
  var teamId = opts.teamId;
  var slot = parseInt(opts.slot, 10);
  var round = normalizeRoundLabel(opts.round) || opts.round || "Round 1";
  var picks = (opts.picks || []).map(function (p) {
    return canonicalPlayerName(p) || displayPlayerName(p);
  });
  if (picks.length !== 3) throw new Error("Pick 3 players before submitting.");
  var payload = {
    teamId: teamId,
    slot: slot,
    round: round,
    picks: picks,
    submittedAt: new Date().toISOString(),
  };
  var cloudId = null;
  if (window.__svFirebaseApp && navigator.onLine) {
    try {
      var json = await submitCoachVoteRest(payload);
      cloudId = docPath(json.name) || null;
    } catch (e) {
      console.warn("[coach-vote-cloud]", e);
      throw e;
    }
  }
  saveCoachVoteLocal(payload, cloudId);
  try {
    window.dispatchEvent(new CustomEvent("sv-coach-vote-saved", { detail: payload }));
  } catch (e) {}
  return payload;
};

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
      (nameKey(v.voterName || "") === key || qo(v.voterName) === qo(voterName))
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
  var team = getTeamFromData(loadLocalData(), teamId);
  var coachSlot = resolveCoachSlotForVoterName(name, team);
  if (coachSlot) {
    var coachVote = findExistingCoachVote(teamId, coachSlot.slot, round);
    if (!coachVote) {
      setBannerVisible(banner, true);
      banner.innerHTML =
        "<strong>Coach vote</strong> — ballot for <em>" +
        escapeHtml(coachSlot.label) +
        "</em> will go to coach results (slot " +
        coachSlot.slot +
        ").";
      return;
    }
    var cpicks = (coachVote.picks || []).join(" · ");
    setBannerVisible(banner, true);
    banner.innerHTML =
      "<strong>You already voted</strong> as coach <em>" +
      escapeHtml(coachSlot.label) +
      "</em> this round" +
      (cpicks ? " — " + escapeHtml(cpicks) + "." : ".") +
      " Submitting again will replace your coach ballot.";
    return;
  }
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
  var submitting = false;

  btn.addEventListener(
    "click",
    function (ev) {
      if (submitting) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
      var nameInput = document.getElementById("voterNameInput");
      var name = nameInput ? nameInput.value.trim() : "";
      if (!name) return;
      var teamId = getCurrentTeamId();
      var round = getCurrentRound(teamId);
      var coachSlot = resolveCoachSlotForVoterName(name, getTeamFromData(loadLocalData(), teamId));
      if (coachSlot) {
        var existingCoach = findExistingCoachVote(teamId, coachSlot.slot, round);
        if (existingCoach) {
          var cpicks = (existingCoach.picks || []).join(" · ");
          var cmsg =
            coachSlot.label +
            " already has a coach ballot for " +
            round +
            (cpicks ? " (" + cpicks + ")." : ".") +
            "\n\nSubmit again to change your coach vote?";
          if (!confirm(cmsg)) {
            ev.stopImmediatePropagation();
            ev.preventDefault();
            return;
          }
        }
      } else {
        var existing = findExistingVote(teamId, name, round);
        if (existing) {
          var picks = (existing.picks || []).join(" · ");
          var msg =
            name +
            " already has a ballot for " +
            round +
            (picks ? " (" + picks + ")." : ".") +
            "\n\nSubmit again to change your vote?";
          if (!confirm(msg)) {
            ev.stopImmediatePropagation();
            ev.preventDefault();
            return;
          }
        }
      }
      submitting = true;
      btn.disabled = true;
      var prevText = btn.textContent;
      btn.textContent = "Submitting…";
      setTimeout(function () {
        submitting = false;
        btn.disabled = false;
        btn.textContent = prevText;
      }, 2800);
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
  var fields = {
    teamId: fsValue(payload.teamId),
    voterName: fsValue(payload.voterName),
    voterNameKey: fsValue(payload.voterNameKey),
    round: fsValue(payload.round),
    picks: fsValue(payload.picks),
    submittedAt: fsValue(payload.submittedAt),
  };
  if (payload.nameMatchStatus != null) fields.nameMatchStatus = fsValue(payload.nameMatchStatus);
  if (payload.tallyExcluded != null) fields.tallyExcluded = fsValue(payload.tallyExcluded);
  if (payload.adminApproved != null) fields.adminApproved = fsValue(payload.adminApproved);
  if (payload.matchedPlayer != null) fields.matchedPlayer = fsValue(payload.matchedPlayer);
  if (payload.nameMatchReason != null) fields.nameMatchReason = fsValue(payload.nameMatchReason);
  var res = await fetch(url, {
    method: "PATCH",
    headers: await restHeaders(),
    body: JSON.stringify({ fields: fields }),
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
  if (!window.__svFirebaseApp) {
    scheduleOfflineQueueFlush();
    return;
  }
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

var offlineFlushTimer = 0;

function scheduleOfflineQueueFlush() {
  if (!navigator.onLine || !loadOfflineQueue().length) return;
  if (window.__svFirebaseApp) {
    flushOfflineQueue().catch(function () {});
    return;
  }
  if (offlineFlushTimer) return;
  var tries = 0;
  function attempt() {
    offlineFlushTimer = 0;
    if (!navigator.onLine || !loadOfflineQueue().length) return;
    if (window.__svFirebaseApp) {
      flushOfflineQueue().catch(function () {});
      return;
    }
    if (tries++ < 40) offlineFlushTimer = setTimeout(attempt, 500);
  }
  offlineFlushTimer = setTimeout(attempt, 500);
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
      try {
        if (typeof window.__svEnrichVotePayload === "function") {
          Object.assign(payload, window.__svEnrichVotePayload(name, teamId, payload));
        }
      } catch (e) {
        console.warn("[offline-enrich]", e);
      }
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
    scheduleOfflineQueueFlush();
  });
  window.addEventListener("offline", updateOfflineBanner);
  updateOfflineBanner();
  if (navigator.onLine) {
    flushOfflineQueue().catch(function () {});
    scheduleOfflineQueueFlush();
  }
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

function formatBallotWhen(iso) {
  if (!iso) return "unknown time";
  try {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

function voteTallyBadge(vote) {
  if (!vote) return "";
  if (vote.adminApproved) return "admin approved";
  if (vote.nameMatchStatus === "matched") return "matched";
  if (vote.nameMatchStatus === "fuzzy") return "fuzzy match";
  if (vote.nameMatchStatus === "unmatched" || vote.tallyExcluded) return "name not matched";
  return "";
}

function voteCountsInTally(vote) {
  return !isVoteExcludedFromTally(vote);
}

function patchLocalVote(voteId, patch) {
  var data = loadLocalData();
  var found = false;
  data.votes = (data.votes || []).map(function (v) {
    if (v && (v.id === voteId || String(v.id) === String(voteId))) {
      found = true;
      return Object.assign({}, v, patch);
    }
    return v;
  });
  if (found) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[vote-patch-local]", e);
    }
  }
  return found;
}

async function patchVoteTallyApproval(vote, includeInTally) {
  if (!vote || !vote.id) return;
  var patch = {
    tallyExcluded: !includeInTally,
    adminApproved: !!includeInTally && vote.nameMatchStatus === "unmatched",
  };
  patchLocalVote(vote.id, patch);
  if (cloudVotesCache[String(vote.teamId)]) {
    cloudVotesCache[String(vote.teamId)].votes = (cloudVotesCache[String(vote.teamId)].votes || []).map(
      function (v) {
        if (v && v.id === vote.id) return Object.assign({}, v, patch);
        return v;
      }
    );
  }
  if (window.__svFirebaseApp && projectId() && isSuperAdminUnlocked()) {
    try {
      await submitVoteRest(vote.id, Object.assign({}, vote, patch));
    } catch (e) {
      console.warn("[vote-tally-patch]", e);
      throw e;
    }
  }
  try {
    window.dispatchEvent(new CustomEvent("sv-votes-merged", { detail: { voteId: vote.id } }));
  } catch (e) {}
  triggerResultsRefresh();
}

function triggerResultsRefresh() {
  try {
    var teamSel = document.getElementById("resultsTeamSelect");
    if (teamSel) teamSel.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (e) {}
}

async function updateAdminBallotsList(teamId, round) {
  var wrap = document.getElementById("resultsBallotsWrap");
  if (!wrap) return;
  if (!isSuperAdminUnlocked()) {
    wrap.innerHTML = '<p class="hint" style="margin:0">Unlock super admin to view all ballots.</p>';
    return;
  }
  var rk = normalizeRoundLabel(round) || round || "Round 1";
  wrap.innerHTML = "<span class='hint admin-loading'>Loading ballots…</span>";
  var data = loadLocalData();
  var localVotes = (data.votes || []).filter(function (v) {
    return v && String(v.teamId) === String(teamId);
  });
  var cloudVotes = [];
  try {
    cloudVotes = await fetchCloudVotes(teamId, true);
  } catch (e) {
    console.warn("[admin-ballots]", e);
  }
  var votes = mergeVotesLists(localVotes, cloudVotes)
    .filter(function (v) {
      return v && String(v.teamId) === String(teamId) && voteRoundLabel(v) === rk;
    })
    .sort(function (a, b) {
      return String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""));
    });

  if (!votes.length) {
    wrap.innerHTML = '<p class="empty-state" style="margin:0">No ballots yet for ' + escapeHtml(rk) + ".</p>";
    return;
  }

  var html =
    "<p class='hint' style='margin:0 0 0.45rem'>" +
    votes.length +
    " ballot(s) — local + cloud. Unmatched names are excluded from tally until you approve.</p>" +
    "<div style='display:flex;flex-direction:column;gap:0.45rem'>";
  votes.forEach(function (v, idx) {
    var when = formatBallotWhen(v.submittedAt);
    var picks = (v.picks || []).map(function (p) {
      return escapeHtml(displayPlayerName(p));
    }).join(" · ");
    var badge = voteTallyBadge(v);
    var counts = voteCountsInTally(v);
    var statusColor = counts ? "#15803d" : "#b91c1c";
    var statusText = counts ? "Counts in tally" : "Excluded from tally";
    var matchLine = "";
    if (v.matchedPlayer) matchLine = " → squad: " + escapeHtml(v.matchedPlayer);
    else if (v.nameMatchReason) matchLine = " — " + escapeHtml(String(v.nameMatchReason));
    html +=
      "<div class='admin-ballot-row' style='border:1px solid var(--border);border-radius:10px;padding:0.6rem 0.7rem;background:#fff'>" +
      "<div style='display:flex;justify-content:space-between;gap:0.6rem;align-items:baseline;flex-wrap:wrap'>" +
      "<div style='font-weight:700;font-size:0.92rem'>" +
      escapeHtml(displayPlayerName(v.voterName || "Unknown")) +
      (badge ? " <span style='font-weight:600;font-size:0.78rem;color:#52525b'>(" + escapeHtml(badge) + ")</span>" : "") +
      "</div>" +
      "<span style='font-size:0.78rem;color:" +
      statusColor +
      ";font-weight:700'>" +
      escapeHtml(statusText) +
      "</span></div>" +
      "<div style='margin-top:0.2rem;font-size:0.82rem;color:#52525b'>" +
      escapeHtml(when) +
      matchLine +
      "</div>" +
      "<div style='margin-top:0.3rem;font-size:0.9rem'>" +
      picks +
      "</div>";
    if (isSuperAdminUnlocked()) {
      html +=
        "<label style='display:flex;align-items:center;gap:0.4rem;margin-top:0.4rem;font-size:0.82rem;cursor:pointer'>" +
        "<input type='checkbox' data-vote-tally='" +
        escapeHtml(v.id || "") +
        "'" +
        (counts ? " checked" : "") +
        " /> Count in results tally</label>";
    }
    html += "</div>";
  });
  html += "</div>";
  wrap.innerHTML = html;
  wrap.querySelectorAll("input[data-vote-tally]").forEach(function (cb) {
    if (cb._svTallyWire) return;
    cb._svTallyWire = true;
    cb.addEventListener("change", function () {
      var id = cb.getAttribute("data-vote-tally");
      var vote = votes.find(function (x) {
        return x && x.id === id;
      });
      if (!vote) return;
      cb.disabled = true;
      patchVoteTallyApproval(vote, cb.checked)
        .then(function () {
          updateAdminBallotsList(teamId, rk);
          updateWhoHasntVoted(true);
        })
        .catch(function (e) {
          cb.checked = !cb.checked;
          window.alert("Could not save tally setting: " + (e.message || e));
        })
        .finally(function () {
          cb.disabled = false;
        });
    });
  });
}

window.__svRenderAdminBallots = function (teamId, round) {
  var tid = parseInt(teamId, 10) || 1;
  var rk = normalizeRoundLabel(round) || round || "Round 1";
  updateAdminBallotsList(tid, rk).catch(function (e) {
    console.warn("[admin-ballots]", e);
  });
};

function ensureDuplicateBallotsBanner() {
  var card = document.getElementById("resultsSummaryCard");
  if (!card || document.getElementById("duplicateBallotsBanner")) return;
  var el = document.createElement("div");
  el.id = "duplicateBallotsBanner";
  el.className = "duplicate-ballots-banner";
  el.setAttribute("role", "alert");
  el.hidden = true;
  card.insertAdjacentElement("afterend", el);
}

function renderDuplicateBallotsWarning(duplicates) {
  ensureDuplicateBallotsBanner();
  var el = document.getElementById("duplicateBallotsBanner");
  if (!el) return;
  if (!duplicates || !duplicates.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  var html =
    "<strong>Duplicate ballots</strong> — someone may have accidentally submitted twice under different names. " +
    "Only the <em>latest</em> ballot counts for results. Ask the voter to use <strong>Change vote</strong>, or remove extras in Firestore.";
  html += "<ul class='duplicate-ballots-list'>";
  duplicates.forEach(function (d) {
    var names = d.ballotNames.join(", ");
    html +=
      "<li><strong>" +
      escapeHtml(d.squadName) +
      "</strong> received " +
      d.ballotNames.length +
      " ballots (" +
      escapeHtml(names) +
      "). Counting: <strong>" +
      escapeHtml(d.kept.ballot) +
      "</strong>" +
      (d.kept.submittedAt ? " · " + escapeHtml(formatBallotWhen(d.kept.submittedAt)) : "") +
      ". Ignored: " +
      d.excluded
        .map(function (x) {
          return escapeHtml(x.ballot) + (x.submittedAt ? " (" + formatBallotWhen(x.submittedAt) + ")" : "");
        })
        .join("; ") +
      ".</li>";
  });
  html += "</ul>";
  el.innerHTML = html;
}

function ensureWhoHasntVotedBlock() {
  var results = document.getElementById("resultsSummaryCard");
  if (!results || document.getElementById("whoHasntVotedBlock")) return;
  var details = document.createElement("details");
  details.id = "whoHasntVotedBlock";
  details.className = "subcard who-vote-panel";
  details.open = true;
  details.style.cssText = "padding:0.65rem 0.75rem; margin:0.5rem 0 0";
  details.innerHTML =
    "<summary style='cursor:pointer;font-weight:800;color:var(--red-dark)'>Who has / hasn't voted?</summary>" +
    "<p class='hint' style='margin:0.35rem 0 0'>Eligible squad vs ballots this round (local + cloud). Exclude players who didn't play/watch.</p>" +
    "<div id='whoVotedList' style='margin-top:0.45rem;font-size:0.9rem;line-height:1.5'></div>" +
    "<div id='whoHasntVotedList' style='margin-top:0.45rem;font-size:0.9rem;line-height:1.5'></div>" +
    "<div id='whoVoteUnmatched' style='margin-top:0.45rem;font-size:0.88rem;line-height:1.45'></div>" +
    "<div id='whoVoteExclusions' style='margin-top:0.55rem;font-size:0.88rem;line-height:1.45'></div>" +
    "<p id='whoVoteStatusHint' class='hint' style='margin:0.35rem 0 0'></p>";
  results.insertAdjacentElement("afterend", details);
  if (!details._svExclWire) {
    details._svExclWire = true;
    details.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.matches || !t.matches("input[data-excl-player]")) return;
      collectAndSaveExclusions();
    });
  }
}

var exclSaveTimer = null;

function collectAndSaveExclusions() {
  if (exclSaveTimer) clearTimeout(exclSaveTimer);
  exclSaveTimer = setTimeout(function () {
    exclSaveTimer = null;
    var box = document.getElementById("whoVoteExclusions");
  var teamSel = document.getElementById("resultsTeamSelect");
  var roundSel = document.getElementById("resultsRoundSelect");
  if (!box || !teamSel || !roundSel || !isSuperAdminUnlocked()) return;
  var teamId = parseInt(teamSel.value, 10) || 1;
  var round = normalizeRoundLabel(roundSel.value) || roundSel.value || "Round 1";
  var next = [];
  box.querySelectorAll("input[data-excl-player]:checked").forEach(function (cb) {
    next.push(cb.getAttribute("data-excl-player"));
  });
  saveVoteMeta(teamId, round, { excluded: next });
  var hint = document.getElementById("whoVoteStatusHint");
  if (hint) hint.textContent = "Exclusions saved for " + round + ".";
  updateWhoHasntVoted(true);
  }, 300);
}

function readPendingExclusions(box) {
  if (!box) return null;
  var inputs = box.querySelectorAll("input[data-excl-player]");
  if (!inputs.length) return null;
  var pending = [];
  inputs.forEach(function (cb) {
    if (cb.checked) pending.push(cb.getAttribute("data-excl-player"));
  });
  return pending;
}

function renderWhoVoteExclusions(teamId, round, squad, meta) {
  var box = document.getElementById("whoVoteExclusions");
  if (!box) return;
  if (!isSuperAdminUnlocked()) {
    box.innerHTML =
      "<p class='hint' style='margin:0'>Unlock <strong>super admin</strong> to mark who didn't play/watch this round.</p>";
    return;
  }
  var pending = readPendingExclusions(box);
  var excluded = pending || meta.excluded || [];
  var html =
    "<div class='who-vote-excl-head' style='font-weight:800;color:var(--terracotta-deep);margin-bottom:0.35rem'>Excluded this round (didn't play / watch)</div>" +
    "<div class='who-vote-excl-list' style='display:flex;flex-direction:column;gap:0.25rem'>";
  squad.forEach(function (player) {
    var name = displayPlayerName(player);
    var checked = excluded.some(function (x) {
      return normalizeName(x) === normalizeName(name);
    });
    html +=
      "<label class='who-vote-excl-row' style='display:flex;align-items:center;gap:0.45rem;font-size:0.86rem'>" +
      "<input type='checkbox' data-excl-player='" +
      escapeHtml(name) +
      "'" +
      (checked ? " checked" : "") +
      " />" +
      "<span>" +
      escapeHtml(name) +
      "</span></label>";
  });
  html += "</div>";
  html +=
    "<p class='hint' style='margin:0.35rem 0 0;font-size:0.78rem'>Check players who didn't play or watch — saves automatically.</p>";
  box.innerHTML = html;
}

function renderWhoVoteUnmatched(teamId, round, squad, matched) {
  var box = document.getElementById("whoVoteUnmatched");
  if (!box) return;
  if (!matched.extraDetails || !matched.extraDetails.length) {
    box.innerHTML = "";
    return;
  }
  var tallyNote =
    " Unmatched ballots are saved but excluded from results until you approve them below or in Ballots.";
  if (!isSuperAdminUnlocked()) {
    box.innerHTML =
      "<div style='font-weight:700;color:var(--red-dark);margin-bottom:0.25rem'>Unmatched ballots (" +
      matched.extraDetails.length +
      ")</div>" +
      "<span class='hint'>" +
      escapeHtml(
        matched.extraDetails
          .map(function (d) {
            return d.voterName + " (" + d.reason + ")";
          })
          .join("; ")
      ) +
      tallyNote +
      "</span>";
    return;
  }
  var html =
    "<div style='font-weight:700;color:var(--red-dark);margin-bottom:0.35rem'>Confirm ballot → squad</div>";
  matched.extraDetails.forEach(function (d, idx) {
    var suggested = d.suggestion && d.suggestion.match ? displayPlayerName(d.suggestion.match) : "";
    html +=
      "<div class='who-vote-alias-row' style='display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center;margin:0.3rem 0'>" +
      "<span style='font-weight:650'>" +
      escapeHtml(d.voterName) +
      "</span>" +
      "<select data-alias-idx='" +
      idx +
      "' style='min-width:8rem;padding:0.25rem 0.4rem;font-size:0.82rem'>" +
      "<option value=''>— link to squad —</option>";
    squad.forEach(function (p) {
      var pn = displayPlayerName(p);
      html +=
        "<option value='" +
        escapeHtml(pn) +
        "'" +
        (suggested && normalizeName(suggested) === normalizeName(pn) ? " selected" : "") +
        ">" +
        escapeHtml(pn) +
        "</option>";
    });
    html +=
      "</select>" +
      "<button type='button' class='ghost who-vote-alias-btn' data-ballot='" +
      escapeHtml(d.voterName) +
      "' style='padding:0.25rem 0.5rem;font-size:0.78rem'>Confirm</button>" +
      "</div>";
  });
  box.innerHTML = html;
  box.querySelectorAll(".who-vote-alias-btn").forEach(function (btn) {
    if (btn._svBound) return;
    btn._svBound = true;
    btn.addEventListener("click", function () {
      var ballot = btn.getAttribute("data-ballot");
      var row = btn.closest(".who-vote-alias-row");
      var sel = row && row.querySelector("select");
      var target = sel && sel.value;
      if (!ballot || !target) return;
      saveVoteMeta(teamId, round, { addAlias: { from: ballot, to: target } });
      updateWhoHasntVoted();
    });
  });
}

async function updateWhoHasntVoted(skipExclRender) {
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

  var team = getTeamFromData(data, teamId);
  var squad = await resolveTeamSquad(teamId, data.teams || []);
  if (!squad.length) {
    listEl.innerHTML = "<span class='hint'>No squad list saved (check config sync).</span>";
    return;
  }

  var meta = getVoteMeta(team, round);
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
  var matched = computeParticipation(squad, votes, teamId, round, meta);
  syncVotesReceivedCount(matched.ballotCount);
  renderDuplicateBallotsWarning(matched.duplicates || []);

  if (votedEl) {
    if (matched.votedSquad.length) {
      var dupNote =
        matched.duplicates && matched.duplicates.length
          ? " · " + matched.duplicates.length + " duplicate group(s) — latest counts"
          : "";
      votedEl.innerHTML =
        "<div style='font-weight:700;color:#15803d;margin-bottom:0.25rem'>Voted (" +
        matched.votedSquad.length +
        " squad · " +
        matched.countedBallots +
        "/" +
        matched.ballotCount +
        " ballot" +
        (matched.ballotCount === 1 ? "" : "s") +
        " counted" +
        dupNote +
        ")</div>" +
        escapeHtml(matched.votedSquad.join(", "));
    } else {
      votedEl.innerHTML =
        "<div style='font-weight:700;color:#52525b;margin-bottom:0.25rem'>Voted (0)</div><span class='hint'>No squad matches yet for " +
        matched.ballotCount +
        " ballot(s).</span>";
    }
  }

  if (matched.missing.length) {
    listEl.innerHTML =
      "<div style='font-weight:700;color:var(--red-dark);margin-bottom:0.25rem'>Hasn't voted (" +
      matched.missing.length +
      "/" +
      matched.eligibleCount +
      " eligible)</div>" +
      escapeHtml(matched.missing.join(", "));
  } else {
    listEl.innerHTML =
      "<div style='font-weight:700;color:#15803d;margin-bottom:0.25rem'>Hasn't voted (0)</div>" +
      "<span style='color:#15803d'>Everyone eligible has voted.</span>";
  }

  renderWhoVoteUnmatched(teamId, round, squad, matched);
  if (!skipExclRender) renderWhoVoteExclusions(teamId, round, squad, meta);

  var hints = [];
  hints.push(matched.ballotCount + " ballot(s)");
  hints.push(matched.eligibleCount + " eligible of " + matched.squadCount + " squad");
  if (matched.excluded.length) hints.push(matched.excluded.length + " excluded");
  hints.push(isSuperAdminUnlocked() ? "cloud refresh" : "local + public cloud read");
  if (matched.possible.length) hints.push("linked: " + matched.possible.join("; "));
  if (cloudErr) hints.push("cloud error: " + cloudErr);
  if (statusEl) statusEl.textContent = hints.join(" · ");
}

var debouncedUpdateWhoHasntVoted = debounce(function () {
  updateWhoHasntVoted();
}, 300);

var debouncedUpdateAdminBallots = debounce(function () {
  var teamSel = document.getElementById("resultsTeamSelect");
  var roundSel = document.getElementById("resultsRoundSelect");
  if (!teamSel || !roundSel) return;
  var teamId = parseInt(teamSel.value, 10) || 1;
  var round = normalizeRoundLabel(roundSel.value) || roundSel.value || "Round 1";
  if (typeof window.__svRenderAdminBallots === "function") {
    window.__svRenderAdminBallots(teamId, round);
  }
}, 300);

var debouncedUpdateAlreadyVotedBanner = debounce(function () {
  updateAlreadyVotedBanner();
}, 300);

var whoHasntVotedWired = false;

function wireWhoHasntVoted() {
  var teamSel = document.getElementById("resultsTeamSelect");
  var roundSel = document.getElementById("resultsRoundSelect");
  if (!teamSel || !roundSel) return;
  ensureWhoHasntVotedBlock();
  if (!whoHasntVotedWired) {
    whoHasntVotedWired = true;
    teamSel.addEventListener("change", debouncedUpdateWhoHasntVoted);
    roundSel.addEventListener("change", debouncedUpdateWhoHasntVoted);
    teamSel.addEventListener("change", debouncedUpdateAdminBallots);
    roundSel.addEventListener("change", debouncedUpdateAdminBallots);
    window.addEventListener("sv-votes-merged", function () {
      Object.keys(cloudVotesCache).forEach(function (k) {
        delete cloudVotesCache[k];
      });
      debouncedUpdateWhoHasntVoted();
      debouncedUpdateAdminBallots();
    });
  }
  updateWhoHasntVoted();
  debouncedUpdateAdminBallots();
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

function wireNameSuggestDeferUntilFocus() {
  var input = document.getElementById("voterNameInput");
  var panel = document.getElementById("voterNameSuggestPanel");
  if (!input || input._svSuggestDefer) return;
  input._svSuggestDefer = true;

  function hideSuggestions() {
    if (panel) {
      panel.hidden = true;
      panel.innerHTML = "";
    }
    input.removeAttribute("list");
  }

  hideSuggestions();

  function showSuggestionsReady() {
    if (document.activeElement !== input) return;
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
        input.setAttribute("list", "voterNameSuggest");
      }
    } catch (e) {}
  }

  input.addEventListener(
    "focus",
    function () {
      showSuggestionsReady();
    },
    true
  );
  input.addEventListener(
    "click",
    function () {
      showSuggestionsReady();
    },
    true
  );
  input.addEventListener("blur", function () {
    setTimeout(hideSuggestions, 150);
  });

  if (panel && !panel._svSuggestObs) {
    panel._svSuggestObs = true;
    var obs = new MutationObserver(function () {
      if (document.activeElement !== input && !panel.hidden) hideSuggestions();
    });
    obs.observe(panel, { attributes: true, childList: true, attributeFilter: ["hidden"] });
  }

  var guardEvents = ["sv-votes-merged", "sv-lineup-rendered"];
  guardEvents.forEach(function (evName) {
    window.addEventListener(evName, function () {
      if (document.activeElement !== input) hideSuggestions();
    });
  });
}

function getAdminTeamId() {
  var tabs = document.getElementById("adminTeamTabs");
  if (tabs) {
    var active = tabs.querySelector("button.active,[aria-selected='true']");
    if (active) {
      var id = active.getAttribute("data-team-id") || active.getAttribute("data-id");
      if (id) return parseInt(id, 10) || 1;
      var m = (active.textContent || "").match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
  }
  var teamSel = document.getElementById("resultsTeamSelect");
  if (teamSel && teamSel.value) return parseInt(teamSel.value, 10) || 1;
  return getCurrentTeamId();
}

function getAdminMatchRound() {
  var roundSel = document.getElementById("adminMatchRoundSelect");
  if (roundSel && roundSel.value) return normalizeRoundLabel(roundSel.value) || roundSel.value;
  return getCurrentRound(getAdminTeamId());
}

function syncAdminLocationFromStore() {
  var teamId = getAdminTeamId();
  var round = getAdminMatchRound();
  var entry = loadLocalTeamMatch(teamId, round) || {};
  if (typeof window.__svSyncLocationFromMatch === "function") {
    window.__svSyncLocationFromMatch(entry);
    return;
  }
  distImport("./location-autocomplete.js")
    .then(function (mod) {
      if (mod.syncLocationFromMatch) mod.syncLocationFromMatch(entry);
      else mod.syncLocationFromInputs();
    })
    .catch(function () {});
}

function loadLocalTeamMatch(teamId, round) {
  var data = loadLocalData();
  var team = (data.teams || []).find(function (t) {
    return String(t.id) === String(teamId);
  });
  if (!team || !team.matchesByRound) return null;
  var key = normalizeRoundLabel(round) || round;
  if (team.matchesByRound[key]) return team.matchesByRound[key];
  var keys = Object.keys(team.matchesByRound);
  for (var i = 0; i < keys.length; i++) {
    if (normalizeRoundLabel(keys[i]) === key) return team.matchesByRound[keys[i]];
  }
  return null;
}

function getPublicLineupSetupKey() {
  var att = document.getElementById("lineupPublicAtt");
  if (att && att.getAttribute("aria-pressed") === "true") return "att";
  return "def";
}

function wireLineupExportOverride() {
  var btn = document.getElementById("lineupExportPng");
  if (!btn || btn._svExportOverride) return;
  btn._svExportOverride = true;
  btn.addEventListener(
    "click",
    function (ev) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      distImport("./lineup-export.js")
        .then(function (mod) {
          var snap =
            typeof window.__svLineupExportSnapshot === "function"
              ? window.__svLineupExportSnapshot()
              : null;
          var teamId = getCurrentTeamId();
          var round = getCurrentRound(teamId);
          var data = loadLocalData();
          var team =
            (snap && snap.team) ||
            (data.teams || []).find(function (t) {
              return String(t.id) === String(teamId);
            });
          var entry = (snap && snap.entry) || loadLocalTeamMatch(teamId, round) || {};
          if (snap && snap.round) round = snap.round;
          return mod.exportLineupPng({
            team: team || { id: teamId, name: "Team " + teamId },
            round: round,
            entry: entry,
            setupKey: getPublicLineupSetupKey(),
          });
        })
        .then(function () {
          var msg = document.getElementById("lineupEditorMsg");
          if (msg) {
            msg.style.color = "#15803d";
            msg.textContent = "PNG exported (matches public lineup view).";
          }
        })
        .catch(function (e) {
          console.error("[lineup-export]", e);
          var msg = document.getElementById("lineupEditorMsg");
          if (msg) msg.textContent = e.message || "Could not export PNG.";
        });
    },
    true
  );
}

async function updateMatchCardWeather() {
  var mount = document.getElementById("matchWeatherBlock");
  if (!mount) {
    var card = document.getElementById("matchCard");
    if (!card) return;
    mount = document.createElement("div");
    mount.id = "matchWeatherBlock";
    mount.className = "lineup-weather-mount";
    var line = document.getElementById("matchLine");
    if (line && line.parentNode) line.parentNode.insertBefore(mount, line.nextSibling);
    else card.appendChild(mount);
  }

  var teamId = getCurrentTeamId();
  var round = getCurrentRound(teamId);
  var entry = loadLocalTeamMatch(teamId, round);
  if (!entry) {
    mount.innerHTML = "";
    return;
  }

  mount.innerHTML = "<p class='hint' style='margin:0.35rem 0 0'>Loading weather…</p>";
  try {
    var mod = await distImport("./weather-forecast.js");
    var units = mod.getWeatherUnits();
    var data = await mod.fetchMatchWeather({
      suburb: entry.suburb,
      groundName: entry.groundName || entry.venue,
      kickoff: entry.kickoff,
      date: entry.date,
      venue: entry.venue,
      lat: entry.lat,
      lng: entry.lng,
      locationLabel: entry.locationLabel,
    });
    mount.innerHTML = mod.weatherPanelHtml(data, units);
    mod.wireWeatherUnitsToggle(mount, function () {
      updateMatchCardWeather().catch(function () {});
    });
  } catch (e) {
    console.warn("[match-weather]", e);
    mount.innerHTML = "";
  }
}

function wireMatchWeather() {
  var teamSel = document.getElementById("publicTeamSelect");
  var roundSel = document.getElementById("publicRoundSelect");
  var refresh = function () {
    updateMatchCardWeather().catch(function () {});
  };
  if (teamSel && !teamSel._svWeather) {
    teamSel._svWeather = true;
    teamSel.addEventListener("change", refresh);
  }
  if (roundSel && !roundSel._svWeather) {
    roundSel._svWeather = true;
    roundSel.addEventListener("change", refresh);
  }
  window.addEventListener("storage", function (ev) {
    if (ev.key === STORAGE_KEY) refresh();
  });
  window.addEventListener("sv-match-saved", function () {
    refresh();
  });
  refresh();
}

function wireVoterNameListeners() {
  var input = document.getElementById("voterNameInput");
  if (!input || input._svEnhance) return;
  input._svEnhance = true;
  input.addEventListener("input", debouncedUpdateAlreadyVotedBanner);
  input.addEventListener("change", debouncedUpdateAlreadyVotedBanner);
  var teamSel = document.getElementById("publicTeamSelect");
  var roundSel = document.getElementById("publicRoundSelect");
  if (teamSel) teamSel.addEventListener("change", debouncedUpdateAlreadyVotedBanner);
  if (roundSel) roundSel.addEventListener("change", debouncedUpdateAlreadyVotedBanner);
  window.addEventListener("sv-votes-merged", debouncedUpdateAlreadyVotedBanner);
  window.addEventListener("storage", function (ev) {
    if (ev.key === STORAGE_KEY) debouncedUpdateAlreadyVotedBanner();
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
  var team = getTeamFromData(data, teamId);
  var squad = await resolveTeamSquad(teamId, data.teams || []);
  squad = squad.filter(function (player) {
    return !isCoachVoterName(player, teamId);
  });
  if (!squad.length) {
    el.classList.remove("is-visible");
    return;
  }

  var meta = getVoteMeta(team, round);
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
  var matched = computeParticipation(squad, votes, teamId, round, meta);
  var voted = matched.votedSquad.length;
  var total = matched.eligibleCount;
  var pct = total ? Math.round((voted / total) * 100) : 0;

  textEl.textContent =
    voted + " of " + total + " eligible squad members have voted (" + round + ")";
  if (fillEl) fillEl.style.width = pct + "%";
  el.setAttribute(
    "aria-label",
    voted + " of " + total + " eligible squad members have voted this round"
  );
}

function wireParticipationCounter() {
  ensureParticipationCounter();
  var teamSel = document.getElementById("publicTeamSelect");
  var roundSel = document.getElementById("publicRoundSelect");
  var refresh = debounce(function () {
    if (participationInflight) return;
    participationInflight = updateParticipationCounter()
      .catch(function (e) {
        console.warn("[participation]", e);
      })
      .finally(function () {
        participationInflight = null;
      });
  }, 400);
  if (teamSel && !teamSel._svParticipation) {
    teamSel._svParticipation = true;
    teamSel.addEventListener("change", refresh);
  }
  if (roundSel && !roundSel._svParticipation) {
    roundSel._svParticipation = true;
    roundSel.addEventListener("change", refresh);
  }
  window.addEventListener("sv-votes-merged", refresh);
  refresh();
}

function normalizeLineupNameEl(el) {
  if (!el || el._svNameNorm) return;
  var raw = el.textContent || "";
  var norm = canonicalPlayerName(displayPlayerName(raw));
  if (norm && norm !== raw) el.textContent = norm;
  el._svNameNorm = true;
}

function wireLineupPublicTabs() {
  var defBtn = document.getElementById("lineupPublicDef");
  var attBtn = document.getElementById("lineupPublicAtt");
  var guidesBtn = document.getElementById("togglePitchGuides");
  var advBtn = document.getElementById("togglePitchAdvGuides");
  if (!defBtn || defBtn._svLineupTabs) return;
  defBtn._svLineupTabs = true;

  var storageKey = STORAGE_KEY + "_pitch_guides";
  var advKey = STORAGE_KEY + "_pitch_adv_guides";

  function setOverlay(mode) {
    var guidesOn = mode === "guides";
    var advOn = mode === "adv";
    document.body.classList.toggle("pitch-guides-on", guidesOn);
    document.body.classList.toggle("pitch-adv-guides-on", advOn);
    try {
      localStorage.setItem(storageKey, guidesOn ? "1" : "0");
      localStorage.setItem(advKey, advOn ? "1" : "0");
    } catch {}
    if (guidesBtn) {
      guidesBtn.setAttribute("aria-pressed", guidesOn ? "true" : "false");
      guidesBtn.classList.toggle("lineup-tab-overlay-active", guidesOn);
    }
    if (advBtn) {
      advBtn.setAttribute("aria-pressed", advOn ? "true" : "false");
      advBtn.classList.toggle("lineup-tab-overlay-active", advOn);
    }
    distImport("./lineup-fotmob.js")
      .then(function (mod) {
        mod.syncPitchOverlay(document.getElementById("lineupPublicWrap"));
      })
      .catch(function () {});
  }

  function clickSetup(btn, other, setup) {
    if (!btn || btn._svSetupWired) return;
    btn._svSetupWired = true;
    btn.addEventListener(
      "click",
      function () {
        setOverlay("none");
        try {
          btn.setAttribute("aria-pressed", "true");
          if (other) other.setAttribute("aria-pressed", "false");
        } catch {}
      },
      true
    );
  }

  clickSetup(defBtn, attBtn, "def");
  clickSetup(attBtn, defBtn, "att");

  if (guidesBtn && !guidesBtn._svOverlayWired) {
    guidesBtn._svOverlayWired = true;
    guidesBtn.addEventListener(
      "click",
      function (ev) {
        ev.stopImmediatePropagation();
        var next = !document.body.classList.contains("pitch-guides-on");
        setOverlay(next ? "guides" : "none");
        if (advBtn && next) advBtn.classList.remove("lineup-tab-overlay-active");
      },
      true
    );
  }

  if (advBtn && !advBtn._svOverlayWired) {
    advBtn._svOverlayWired = true;
    advBtn.addEventListener(
      "click",
      function (ev) {
        ev.stopImmediatePropagation();
        var next = !document.body.classList.contains("pitch-adv-guides-on");
        setOverlay(next ? "adv" : "none");
        if (guidesBtn && next) guidesBtn.classList.remove("lineup-tab-overlay-active");
      },
      true
    );
  }

  window.addEventListener("sv-lineup-rendered", function () {
    distImport("./lineup-fotmob.js")
      .then(function (mod) {
        mod.syncPitchOverlay(document.getElementById("lineupPublicWrap"));
      })
      .catch(function () {});
  });

  try {
    if (localStorage.getItem(advKey) === "1") setOverlay("adv");
    else if (localStorage.getItem(storageKey) === "1") setOverlay("guides");
  } catch {}
}

var sarahPickPromise = null;

function showNamePickModal(title, message, options) {
  return new Promise(function (resolve) {
    var existing = document.getElementById("svNamePickModal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "svNamePickModal";
    modal.className = "sv-name-pick-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    var card = document.createElement("div");
    card.className = "sv-name-pick-card";
    card.innerHTML =
      "<h3>" +
      escapeHtml(title) +
      "</h3><p>" +
      escapeHtml(message) +
      "</p><div class='sv-name-pick-options'></div>";
    var opts = card.querySelector(".sv-name-pick-options");

    options.forEach(function (name) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = name;
      btn.addEventListener("click", function () {
        modal.remove();
        resolve(name);
      });
      opts.appendChild(btn);
    });

    modal.appendChild(card);
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) {
        modal.remove();
        resolve(null);
      }
    });
    document.body.appendChild(modal);
  });
}

async function resolveAmbiguousVoterName(rawName, teamId) {
  var name = displayPlayerName(rawName);
  if (!name) return name;

  var data = loadLocalData();
  var squad = await resolveTeamSquad(teamId, data.teams || []);
  var choices = findAmbiguousByFirstName(name, squad);
  if (!choices) return canonicalPlayerName(name);

  var exact = squad.find(function (p) {
    return normalizeName(p) === normalizeName(name);
  });
  if (exact) return canonicalPlayerName(displayPlayerName(exact));

  if (sarahPickPromise) return sarahPickPromise;

  sarahPickPromise = showNamePickModal(
    "Which player?",
    "More than one squad member matches \"" + name + "\". Pick your exact squad name:",
    choices
  ).finally(function () {
    sarahPickPromise = null;
  });

  var picked = await sarahPickPromise;
  return picked ? canonicalPlayerName(picked) : null;
}

function wireSarahDisambiguation() {
  var input = document.getElementById("voterNameInput");
  var submitBtn = document.getElementById("submitVote");
  if (!input || input._svSarahWire) return;
  input._svSarahWire = true;

  input.addEventListener("blur", function () {
    var name = input.value.trim();
    if (!name) return;
    resolveAmbiguousVoterName(name, getCurrentTeamId()).then(function (resolved) {
      if (resolved && resolved !== name) input.value = resolved;
      updateAlreadyVotedBanner();
    });
  });

  if (submitBtn && !submitBtn._svSarahGuard) {
    submitBtn._svSarahGuard = true;
    submitBtn.addEventListener(
      "click",
      function (ev) {
        if (submitBtn._svSarahResubmit) {
          submitBtn._svSarahResubmit = false;
          return;
        }
        var name = input.value.trim();
        if (!name) return;

        ev.stopImmediatePropagation();
        ev.preventDefault();

        (async function () {
          var teamId = getCurrentTeamId();
          var data = loadLocalData();
          var squad = await resolveTeamSquad(teamId, data.teams || []);
          var choices = findAmbiguousByFirstName(name, squad);
          if (!choices) {
            submitBtn._svSarahResubmit = true;
            submitBtn.click();
            return;
          }
          var exact = squad.find(function (p) {
            return normalizeName(p) === normalizeName(name);
          });
          if (exact) {
            input.value = canonicalPlayerName(displayPlayerName(exact));
            submitBtn._svSarahResubmit = true;
            submitBtn.click();
            return;
          }
          var resolved = await resolveAmbiguousVoterName(name, teamId);
          if (resolved) {
            input.value = resolved;
            updateAlreadyVotedBanner();
            submitBtn._svSarahResubmit = true;
            submitBtn.click();
          }
        })().catch(function (e) {
          console.warn("[sarah-disambig]", e);
        });
      },
      true
    );
  }
}

var squadBadgesCache = Object.create(null);

function squadBadgeKey(name) {
  return canonicalPlayerName(displayPlayerName(name));
}

window.__svSquadBadgeForName = function (name) {
  var key = squadBadgeKey(name);
  return squadBadgesCache[key] || squadBadgesCache[name] || "";
};

window.__svGetSquadBadges = function () {
  var out = Object.create(null);
  Object.keys(squadBadgesCache).forEach(function (k) {
    if (squadBadgesCache[k]) out[k] = squadBadgesCache[k];
  });
  return out;
};

window.__svSetSquadBadges = function (map) {
  squadBadgesCache = Object.create(null);
  if (map && typeof map === "object") {
    Object.keys(map).forEach(function (k) {
      var b = String(map[k] || "")
        .trim()
        .toUpperCase();
      if (b) squadBadgesCache[k] = b;
    });
  }
  renderSquadBadgesPanel();
};

function parseSquadFromEditor() {
  var ta = document.getElementById("playerEditor");
  if (!ta) return [];
  return String(ta.value || "")
    .split(/\r?\n/)
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
}

function renderSquadBadgesPanel() {
  var panel = document.getElementById("squadBadgesPanel");
  if (!panel) return;
  var squad = parseSquadFromEditor();
  if (!squad.length) {
    panel.innerHTML = "<p class='hint' style='margin:0'>Add squad names below, then assign badges here.</p>";
    return;
  }
  var html =
    "<div class='squad-badges-head'>Squad badges <span class='hint'>(persist across rounds)</span></div>" +
    "<div class='squad-badges-list'>";
  squad.forEach(function (name) {
    var key = squadBadgeKey(name);
    var cur = squadBadgesCache[key] || squadBadgesCache[name] || "";
    html +=
      "<div class='squad-badge-row'>" +
      "<div class='squad-badge-name'>" +
      escapeHtml(name) +
      "</div>" +
      "<select class='squad-badge-select' data-player='" +
      escapeHtml(key) +
      "' aria-label='Badge for " +
      escapeHtml(name) +
      "'>" +
      "<option value=''" +
      (cur ? "" : " selected") +
      ">None</option>" +
      "<option value='C'" +
      (cur === "C" ? " selected" : "") +
      ">Captain (C)</option>" +
      "<option value='VC'" +
      (cur === "VC" ? " selected" : "") +
      ">Vice Captain (VC)</option>" +
      "<option value='GK'" +
      (cur === "GK" ? " selected" : "") +
      ">Goalkeeper (GK)</option>" +
      "</select></div>";
  });
  html += "</div>";
  panel.innerHTML = html;
  panel.querySelectorAll(".squad-badge-select").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var player = sel.getAttribute("data-player") || "";
      var val = String(sel.value || "")
        .trim()
        .toUpperCase();
      if (val) squadBadgesCache[player] = val;
      else delete squadBadgesCache[player];
    });
  });
}

function wireSquadBadges() {
  var ta = document.getElementById("playerEditor");
  if (!ta || ta._svBadgeWire) return;
  ta._svBadgeWire = true;
  ta.addEventListener("input", function () {
    clearTimeout(ta._svBadgeTimer);
    ta._svBadgeTimer = setTimeout(renderSquadBadgesPanel, 200);
  });
  renderSquadBadgesPanel();
}

function wireAdminSectionTabs() {
  var nav = document.getElementById("adminSectionTabs");
  if (!nav || nav._svWired) return;
  nav._svWired = true;
  var panels = document.querySelectorAll("[data-admin-panel]");
  function show(tab) {
    nav.querySelectorAll("button[data-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach(function (p) {
      p.hidden = p.getAttribute("data-admin-panel") !== tab;
    });
    if (tab === "votes") {
      try {
        ensureWhoHasntVotedBlock();
        updateWhoHasntVoted();
        debouncedUpdateAdminBallots();
      } catch (e) {
        console.warn("[who-vote]", e);
      }
    }
    if (tab === "team") {
      distImport("./location-autocomplete.js")
        .then(function (mod) {
          mod.initLocationAutocomplete();
          syncAdminLocationFromStore();
        })
        .catch(function () {});
    }
  }
  nav.querySelectorAll("button[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      show(btn.getAttribute("data-tab") || "team");
    });
  });
  show("team");
}

function wireLocationOnRoundChange() {
  var roundSel = document.getElementById("adminMatchRoundSelect");
  if (!roundSel || roundSel._svLocWire) return;
  roundSel._svLocWire = true;
  roundSel.addEventListener("change", function () {
    setTimeout(function () {
      distImport("./location-autocomplete.js")
        .then(function (mod) {
          mod.initLocationAutocomplete();
          syncAdminLocationFromStore();
        })
        .catch(function () {});
    }, 400);
  });
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

function parseRoundNumberFromLabel(label) {
  var l = String(label || "").trim();
  var m = l.match(/^round\s*(\d+(?:\.\d+)?)$/i);
  if (m) return parseFloat(m[1]);
  m = l.match(/^(\d+(?:\.\d+)?)$/);
  return m ? parseFloat(m[1]) : null;
}

function wirePublishedRoundControls() {
  var pubEl = document.getElementById("publishedRoundInput");
  var roundEl = document.getElementById("roundInput");
  var btn = document.getElementById("publishNextRoundBtn");
  if (!pubEl || !btn || btn._svPubWire) return;
  btn._svPubWire = true;
  btn.addEventListener("click", function () {
    var cur = normalizeRoundLabel(pubEl.value || (roundEl && roundEl.value) || "Round 1") || "Round 1";
    var n = parseRoundNumberFromLabel(cur);
    if (n == null) {
      window.alert("Set a numbered public round first (e.g. Round 9).");
      return;
    }
    pubEl.value = "Round " + (n + 1);
    if (roundEl && !roundEl.value.trim()) roundEl.value = pubEl.value;
    var err = document.getElementById("adminOpErr");
    if (err) {
      err.style.color = "#15803d";
      err.textContent = "Public round set to " + pubEl.value + " — click Save team & round to publish.";
    }
  });
}

function init() {
  wireNameSuggestDeferUntilFocus();
  wireVoterNameListeners();
  wireDuplicateSubmitGuard();
  wireOfflineQueue();
  wireThemeToggle();
  wireParticipationCounter();
  wireLineupNameNormalize();
  wireLineupExportOverride();
  wireMatchWeather();
  wireLineupPublicTabs();
  wireSarahDisambiguation();
  wirePublishedRoundControls();
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
    wireSquadBadges();
    wireAdminSectionTabs();
    wireLocationOnRoundChange();
    wirePublishedRoundControls();
  } catch (e) {
    adminEnhanceWired = false;
    console.warn("[voter-enhancements] admin wire failed", e);
  }
});
var adminMount = document.getElementById("adminDeferredMount");
if (adminMount) adminObs.observe(adminMount, { childList: true, subtree: true });
