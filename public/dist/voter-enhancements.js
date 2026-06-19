/**
 * Voter UX enhancements — companion to app.min.js (no Firebase CDN imports).
 * Features: already-voted banner, duplicate warn, offline queue, who hasn't voted, lineup share pack, dark mode.
 */
const STORAGE_KEY = "soccerVoteApp_v2";
const PREFS_KEY = STORAGE_KEY + "_cache";
const PUBLIC_PREFS = STORAGE_KEY + "_public_prefs";
const OFFLINE_QUEUE_KEY = STORAGE_KEY + "_offline_vote_queue";
const THEME_KEY = STORAGE_KEY + "_theme";

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

function ensureAlreadyVotedBanner() {
  var wrap = document.querySelector(".vote-name-wrap");
  if (!wrap) return null;
  var el = document.getElementById("alreadyVotedBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "alreadyVotedBanner";
    el.className = "banner banner--already-voted";
    el.style.display = "none";
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
    banner.style.display = "none";
    banner.textContent = "";
    return;
  }
  var teamId = getCurrentTeamId();
  var round = getCurrentRound(teamId);
  var existing = findExistingVote(teamId, name, round);
  if (!existing) {
    banner.style.display = "none";
    return;
  }
  var picks = (existing.picks || []).join(" · ");
  banner.style.display = "block";
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

async function submitVoteRest(docId, payload) {
  var app = window.__svFirebaseApp;
  if (!app || !app.options || !app.options.projectId) throw new Error("Cloud not ready");
  var pid = app.options.projectId;
  var url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(pid) +
    "/databases/(default)/documents/votes/" +
    encodeURIComponent(docId);
  var res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
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
      status.style.display = "block";
      status.textContent = "Back online — sent " + flushed + " queued vote(s).";
      setTimeout(function () {
        if (navigator.onLine) status.style.display = "none";
      }, 4000);
    }
  }
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
      var banner = document.getElementById("offlineBanner");
      if (banner) {
        banner.style.display = "block";
        banner.textContent = "Vote queued (" + q.length + "). Will auto-submit when online.";
      }
    },
    true
  );

  window.addEventListener("online", function () {
    flushOfflineQueue().catch(function (e) {
      console.warn("[offline-queue]", e);
    });
  });
  if (navigator.onLine) flushOfflineQueue().catch(function () {});
}

function ensureWhoHasntVotedBlock() {
  var results = document.getElementById("resultsSummaryCard");
  if (!results || document.getElementById("whoHasntVotedBlock")) return;
  var details = document.createElement("details");
  details.id = "whoHasntVotedBlock";
  details.className = "subcard";
  details.style.cssText = "padding:0.65rem 0.75rem; margin:0.5rem 0 0";
  details.innerHTML =
    "<summary style='cursor:pointer;font-weight:800;color:var(--red-dark)'>Who hasn't voted?</summary>" +
    "<p class='hint' style='margin:0.35rem 0 0'>Squad players without a ballot this round.</p>" +
    "<div id='whoHasntVotedList' style='margin-top:0.45rem;font-size:0.9rem;line-height:1.5'></div>";
  results.insertAdjacentElement("afterend", details);
}

function updateWhoHasntVoted() {
  ensureWhoHasntVotedBlock();
  var listEl = document.getElementById("whoHasntVotedList");
  var teamSel = document.getElementById("resultsTeamSelect");
  var roundSel = document.getElementById("resultsRoundSelect");
  if (!listEl || !teamSel || !roundSel) return;
  var teamId = parseInt(teamSel.value, 10) || 1;
  var round = normalizeRoundLabel(roundSel.value) || roundSel.value || "Round 1";
  var data = loadLocalData();
  var team = (data.teams || []).find(function (t) {
    return String(t.id) === String(teamId);
  });
  var squad = (team && team.players ? team.players : []).filter(Boolean);
  var voters = Object.create(null);
  (data.votes || []).forEach(function (v) {
    if (!v || String(v.teamId) !== String(teamId)) return;
    if (voteRoundLabel(v) !== voteRoundLabel({ round: round })) return;
    voters[qo(v.voterName)] = true;
  });
  var missing = squad.filter(function (p) {
    return !voters[qo(p)];
  });
  if (!squad.length) {
    listEl.innerHTML = "<span class='hint'>No squad list saved.</span>";
    return;
  }
  if (!missing.length) {
    listEl.innerHTML = "<span style='color:#15803d;font-weight:700'>Everyone on the squad has voted.</span>";
    return;
  }
  listEl.textContent = missing.join(", ") + " (" + missing.length + "/" + squad.length + " missing)";
}

function wireWhoHasntVoted() {
  ensureWhoHasntVotedBlock();
  var teamSel = document.getElementById("resultsTeamSelect");
  var roundSel = document.getElementById("resultsRoundSelect");
  if (teamSel) teamSel.addEventListener("change", updateWhoHasntVoted);
  if (roundSel) roundSel.addEventListener("change", updateWhoHasntVoted);
  window.addEventListener("sv-votes-merged", function () {
    setTimeout(updateWhoHasntVoted, 300);
  });
  var obs = new MutationObserver(function () {
    if (document.getElementById("resultsTeamSelect")) updateWhoHasntVoted();
  });
  var mount = document.getElementById("adminDeferredMount");
  if (mount) obs.observe(mount, { childList: true, subtree: true });
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
  btn.style.cssText = "margin-top:0.5rem;padding:0.4rem 0.75rem;font-size:0.8rem";
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

function init() {
  wireVoterNameListeners();
  wireDuplicateSubmitGuard();
  wireOfflineQueue();
  wireWhoHasntVoted();
  ensureLineupSharePackButton();
  wireThemeToggle();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

// Admin panel mounts later — re-wire when it appears
var adminObs = new MutationObserver(function () {
  wireWhoHasntVoted();
  ensureLineupSharePackButton();
});
var adminMount = document.getElementById("adminDeferredMount");
if (adminMount) adminObs.observe(adminMount, { childList: true, subtree: true });
