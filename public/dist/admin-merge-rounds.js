/**
 * Admin: merge team votes from one round into another (super admin).
 * Lazy-loaded alongside app.min.js; uses window.__svFirebaseApp / __svAuth (no CDN Firebase imports).
 */
import {
  findSquadMatch,
  normalizeName,
  canonicalPlayerName,
  explainSquadMismatch,
  displayPlayerName,
  nameSimilarity,
  DEFAULT_SQUAD_THRESHOLD,
  STRICT_SQUAD_THRESHOLD,
} from "./name-match.js?tag=v189";

const STORAGE_KEY = "soccerVoteApp_v2";
const CHRIS_COACH_SLOT = 2;
const WILL_COACH_SLOT = 1;
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
  var prev = sel.value ? normalizeRoundLabel(sel.value) || sel.value : "";
  if (!prev || rounds.indexOf(prev) === -1) prev = preferred || "";
  var unchanged =
    sel.options.length === rounds.length &&
    rounds.every(function (r, i) {
      return sel.options[i] && sel.options[i].value === r;
    });
  if (unchanged && prev && sel.value === prev) return;
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

function squadThreshold(strict) {
  return strict ? STRICT_SQUAD_THRESHOLD : DEFAULT_SQUAD_THRESHOLD;
}

function getRoundFromUi(selectId, manualId) {
  var manualEl = document.getElementById(manualId);
  var manualVal = manualEl && manualEl.value ? manualEl.value.trim() : "";
  if (manualVal) return validateRoundLabel(manualVal);
  var sel = document.getElementById(selectId);
  if (!sel || !sel.value) return null;
  return validateRoundLabel(sel.value);
}

function voterDocKey(v) {
  return nameKey(v && v.voterName ? v.voterName : "");
}

function analyzeSourceVote(v, players, destKeys, th, forceInclude) {
  var key = voterDocKey(v);
  var voterLabel = canonicalPlayerName(v.voterName) || "(unnamed)";
  var forced = forceInclude && forceInclude[key];
  var squadHit = findSquadMatch(v.voterName, players, th);
  var isDup = !!destKeys[key];
  var status = "ok";
  var reason = squadHit ? squadHit.reason || "on squad" : explainSquadMismatch(v.voterName, players, th);

  if (isDup) {
    status = "dup";
    reason = "already voted in destination round";
  } else if (!squadHit && !forced) {
    status = "invalid";
  } else if (squadHit && !squadHit.exact && !forced) {
    status = "fuzzy";
    reason = (squadHit.reason || "fuzzy") + " → " + displayPlayerName(squadHit.match);
  } else if (forced && !squadHit) {
    status = "forced";
    reason = "manual override (not on squad)";
  } else if (forced) {
    status = "forced";
    reason = "manual override";
  }

  var includeDefault = status === "ok" || status === "fuzzy" || status === "forced";
  if (status === "invalid" || status === "dup") includeDefault = false;

  return {
    vote: v,
    key: key,
    voterLabel: voterLabel,
    squadHit: squadHit,
    status: status,
    reason: reason,
    isDup: isDup,
    includeDefault: includeDefault,
  };
}

function planMerge(teamId, teams, votes, srcRound, dstRound, opts) {
  opts = opts || {};
  var strict = !!opts.strictSquadCheck;
  var th = squadThreshold(strict);
  var forceInclude = opts.forceInclude || Object.create(null);
  var manualInclude = opts.manualInclude || Object.create(null);
  var manualExclude = opts.manualExclude || Object.create(null);

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
    destKeys[voterDocKey(v)] = true;
  });

  var sourceVotes = (votes || []).filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId) && voteRoundLabel(v) === srcLabel;
  });

  var items = sourceVotes.map(function (v) {
    return analyzeSourceVote(v, players, destKeys, th, forceInclude);
  });

  var merged = [];
  var skippedDup = [];
  var invalid = [];
  var possibleMatch = [];
  var forced = [];

  items.forEach(function (item) {
    var included = manualInclude[item.key] === true;
    var excluded = manualExclude[item.key] === true;
    if (excluded) return;
    if (!included) {
      if (item.status === "dup") {
        skippedDup.push(item.voterLabel);
        return;
      }
      if (item.status === "invalid") {
        invalid.push(item.voterLabel);
        return;
      }
      if (!item.includeDefault) return;
    }

    if (item.isDup && !included) {
      skippedDup.push(item.voterLabel);
      return;
    }

    if (item.status === "fuzzy" && item.squadHit) {
      possibleMatch.push(item.voterLabel + " ≈ " + displayPlayerName(item.squadHit.match));
    }
    if (item.status === "forced" || (included && item.status === "invalid")) {
      forced.push(item.voterLabel);
    }
    merged.push(item.vote);
  });

  return {
    srcLabel: srcLabel,
    dstLabel: dstLabel,
    dstRoundKey: roundDocKey(dstLabel),
    sourceVotes: sourceVotes,
    items: items,
    merged: merged,
    skippedDup: skippedDup,
    invalid: invalid,
    possibleMatch: possibleMatch,
    forced: forced,
    strictSquadCheck: strict,
    players: players,
  };
}

function rebuildPlanFromUi(basePlan) {
  if (!basePlan) return null;
  var forceInclude = Object.create(null);
  var manualInclude = Object.create(null);
  var manualExclude = Object.create(null);
  var summaryEl = document.getElementById("mergeRoundsSummary");
  if (summaryEl) {
    summaryEl.querySelectorAll("[data-merge-key]").forEach(function (row) {
      var key = row.getAttribute("data-merge-key");
      var includeCb = row.querySelector(".merge-include-cb");
      var forceCb = row.querySelector(".merge-force-cb");
      if (forceCb && forceCb.checked) forceInclude[key] = true;
      if (includeCb && includeCb.checked) manualInclude[key] = true;
      if (includeCb && !includeCb.checked) manualExclude[key] = true;
    });
  }
  return planMerge(
    basePlan.teamId,
    basePlan.teams,
    basePlan.votes,
    basePlan.srcRound,
    basePlan.dstRound,
    {
      strictSquadCheck: !!document.getElementById("mergeStrictSquad")?.checked,
      forceInclude: forceInclude,
      manualInclude: manualInclude,
      manualExclude: manualExclude,
    }
  );
}

function statusBadge(status) {
  var colors = {
    ok: "#15803d",
    fuzzy: "#a16207",
    invalid: "var(--red-dark)",
    dup: "#52525b",
    forced: "#7c3aed",
  };
  var labels = {
    ok: "OK",
    fuzzy: "Fuzzy",
    invalid: "Not on squad",
    dup: "Duplicate",
    forced: "Forced",
  };
  var c = colors[status] || "#52525b";
  var l = labels[status] || status;
  return (
    "<span style='font-size:0.75rem;font-weight:800;padding:0.12rem 0.4rem;border-radius:999px;background:" +
    c +
    "18;color:" +
    c +
    "'>" +
    escapeHtml(l) +
    "</span>"
  );
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
      " selected from <em>" +
      escapeHtml(plan.srcLabel) +
      "</em> → <em>" +
      escapeHtml(plan.dstLabel) +
      "</em></div>",
    "<div style='margin-top:0.35rem;font-size:0.88rem;color:#52525b'>" +
      (plan.strictSquadCheck ? "Strict squad check ON" : "Loose squad check (default)") +
      " · tick rows to include/exclude · use Force include for flagged names</div>",
  ];

  if (plan.items && plan.items.length) {
    lines.push(
      "<div style='margin-top:0.65rem;font-weight:750'>Source votes (" +
        plan.items.length +
        ")</div>" +
        "<div class='merge-voter-list' style='margin-top:0.35rem;display:flex;flex-direction:column;gap:0.35rem'>"
    );
    plan.items.forEach(function (item) {
      var checked = item.includeDefault && item.status !== "dup" ? " checked" : "";
      var forceChecked = item.status === "forced" ? " checked" : "";
      var disabledDup = item.status === "dup" ? " disabled" : "";
      lines.push(
        "<label class='merge-voter-row' data-merge-key='" +
          escapeHtml(item.key) +
          "' style='display:flex;align-items:flex-start;gap:0.45rem;padding:0.45rem 0.55rem;border:1px solid var(--border);border-radius:10px;cursor:pointer'>" +
          "<input type='checkbox' class='merge-include-cb'" +
          checked +
          disabledDup +
          " style='margin-top:0.2rem' />" +
          "<span style='flex:1;min-width:0'>" +
          "<span style='font-weight:750'>" +
          escapeHtml(item.voterLabel) +
          "</span> " +
          statusBadge(item.status) +
          "<br><span class='hint' style='font-size:0.82rem;line-height:1.35'>" +
          escapeHtml(item.reason) +
          "</span></span>" +
          (item.status === "invalid" || item.status === "dup"
            ? "<label style='font-size:0.78rem;white-space:nowrap;display:flex;align-items:center;gap:0.25rem;color:var(--red-dark)'>" +
              "<input type='checkbox' class='merge-force-cb'" +
              forceChecked +
              " /> Force</label>"
            : "") +
          "</label>"
      );
    });
    lines.push("</div>");
  }

  if (plan.skippedDup.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Skipped duplicates (" +
        plan.skippedDup.length +
        ")</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(plan.skippedDup.join(", ")) +
        "</p></details>"
    );
  }
  if (plan.possibleMatch && plan.possibleMatch.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Possible name matches (" +
        plan.possibleMatch.length +
        ")</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(plan.possibleMatch.join(", ")) +
        "</p></details>"
    );
  }
  if (plan.forced && plan.forced.length) {
    lines.push(
      "<details open style='margin-top:0.45rem'><summary>Manual overrides (" +
        plan.forced.length +
        ")</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(plan.forced.join(", ")) +
        "</p></details>"
    );
  }
  if (plan.invalid.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Excluded / invalid (" +
        plan.invalid.length +
        ") — tick Include + Force to merge anyway</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(plan.invalid.join(", ")) +
        "</p></details>"
    );
  }

  el.innerHTML = lines.join("");

  el.querySelectorAll(".merge-include-cb, .merge-force-cb").forEach(function (cb) {
    cb.addEventListener("change", function () {
      if (cb.classList.contains("merge-force-cb") && cb.checked) {
        var row = cb.closest("[data-merge-key]");
        var inc = row && row.querySelector(".merge-include-cb");
        if (inc) inc.checked = true;
      }
      if (!lastPlan) return;
      var updated = rebuildPlanFromUi(lastPlan);
      if (!updated) return;
      updated.teamId = lastPlan.teamId;
      updated.teams = lastPlan.teams;
      updated.votes = lastPlan.votes;
      updated.srcRound = lastPlan.srcRound;
      updated.dstRound = lastPlan.dstRound;
      updated.localOnly = lastPlan.localOnly;
      lastPlan = updated;
      var runBtn = document.getElementById("mergeRoundsRun");
      if (runBtn) runBtn.disabled = !lastPlan.merged.length;
      var countEl = el.querySelector("div:nth-child(2)");
      if (countEl) {
        countEl.innerHTML =
          "<strong>" +
          lastPlan.merged.length +
          "</strong> vote" +
          (lastPlan.merged.length === 1 ? "" : "s") +
          " selected from <em>" +
          escapeHtml(lastPlan.srcLabel) +
          "</em> → <em>" +
          escapeHtml(lastPlan.dstLabel) +
          "</em>";
      }
    });
  });
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

const SUPER_ADMIN_EMAIL = "sydneywilliam29@gmail.com";

function requireFirestoreOps() {
  if (
    !window.__svFirestoreBatch ||
    !window.__svVoteDoc ||
    !window.__svCoachVoteDoc ||
    !window.__svAddDoc ||
    !window.__svCoachVotesCol
  ) {
    throw new Error(
      "Firestore write API not ready. Wait for cloud sync to finish, then refresh and unlock super admin."
    );
  }
}

async function waitForFirestoreOps(maxMs) {
  var deadline = Date.now() + (maxMs || 25000);
  while (Date.now() < deadline) {
    if (
      window.__svFirestoreBatch &&
      window.__svVoteDoc &&
      window.__svCoachVoteDoc &&
      window.__svAddDoc &&
      window.__svCoachVotesCol
    ) {
      return;
    }
    await new Promise(function (r) {
      setTimeout(r, 200);
    });
  }
  requireFirestoreOps();
}

function voteDocIdFromPath(name) {
  var m = String(name || "").match(/\/documents\/votes\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : normalizeVoteDocId(name);
}

function restFieldsToObject(fields) {
  var out = {};
  Object.keys(fields || {}).forEach(function (k) {
    out[k] = parseFsValue(fields[k]);
  });
  return out;
}

function buildVoteRow(v, teamId, dstLabel, dstRoundKey) {
  var key = voterDocKey(v);
  var picks = (Array.isArray(v.picks) ? v.picks.slice() : []).filter(Boolean);
  if (picks.length !== 3) {
    throw new Error(
      "Invalid vote for " +
        (v.voterName || "?") +
        ": need exactly 3 picks (has " +
        picks.length +
        "). Fix the ballot before merging."
    );
  }
  return {
    id: "t" + teamId + "_r" + dstRoundKey + "_v" + key,
    teamId: teamId,
    voterName: canonicalPlayerName(v.voterName) || v.voterName,
    voterNameKey: key,
    round: dstLabel,
    picks: picks.map(function (p) {
      return canonicalPlayerName(p) || p;
    }),
    submittedAt: v.submittedAt || new Date().toISOString(),
  };
}

function buildCoachVoteRow(vote, slot) {
  var picks = (Array.isArray(vote.picks) ? vote.picks.slice() : []).filter(Boolean);
  if (picks.length !== 3) {
    throw new Error(
      "Chris vote in " +
        voteRoundLabel(vote) +
        " needs 3 picks (has " +
        picks.length +
        ")."
    );
  }
  return {
    teamId: vote.teamId,
    slot: slot,
    round: voteRoundLabel(vote),
    picks: picks.map(function (p) {
      return canonicalPlayerName(p) || p;
    }),
    submittedAt: vote.submittedAt || new Date().toISOString(),
  };
}

function isChrisVoterName(name) {
  var base = displayPlayerName(name);
  if (!base) return false;
  var key = normalizeName(base);
  if (key === "chris" || key.indexOf("chris") === 0) return true;
  return nameSimilarity(base, "Chris") >= 0.88;
}

async function authHeaders() {
  await ensureCloudAuth(false);
  var auth = window.__svAuth;
  var token = await auth.currentUser.getIdToken();
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

async function ensureCloudAuth(requireSuperEmail) {
  var user = await waitForAuth(requireSuperEmail ? 15000 : 8000);
  if (!user) {
    throw new Error(
      "Firebase sign-in required for cloud merge. Coach / admin → Super admin → Unlock, then try again."
    );
  }
  if (requireSuperEmail) {
    var email = (user.email || "").toLowerCase();
    if (email !== SUPER_ADMIN_EMAIL) {
      throw new Error(
        "Signed in as " +
          (user.email || "?") +
          ". Cloud merge requires super admin (" +
          SUPER_ADMIN_EMAIL +
          ")."
      );
    }
  }
  return user;
}

function formatWriteStatus(status, context) {
  if (!status) return "unknown error";
  var msg = status.message || "";
  if (status.code === 7 || /PERMISSION_DENIED/i.test(msg)) {
    return (
      "Permission denied" +
      (context ? " (" + context + ")" : "") +
      ". Sign in as super admin " +
      SUPER_ADMIN_EMAIL +
      " (Coach/admin → Super admin → Unlock). Deletes and admin writes require Firebase auth; " +
      "vote upserts must use doc id t{team}_r{round}_v{voter} with exactly 3 picks."
    );
  }
  if (status.code === 5 || /NOT_FOUND/i.test(msg)) return "Document not found: " + msg;
  if (/UNAUTHENTICATED/i.test(msg)) {
    return "Not signed in to Firebase — unlock super admin as " + SUPER_ADMIN_EMAIL + " and retry.";
  }
  return msg || "error code " + (status.code != null ? status.code : "?");
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
  var m = String(name || "").match(/\/documents\/votes\/(.+)$/);
  if (m) return decodeURIComponent(m[1]);
  m = String(name || "").match(/documents\/(?:votes\/)?(.+)$/);
  return m ? m[1] : "";
}

function normalizeVoteDocId(id) {
  var s = String(id || "").trim();
  if (!s) return "";
  if (s.indexOf("votes/") === 0) s = s.slice(6);
  return s;
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
  await ensureCloudAuth(true);
  await waitForApp(25000);
  await waitForFirestoreOps(25000);
  var newBatch = window.__svFirestoreBatch;
  var voteDoc = window.__svVoteDoc;

  for (var i = 0; i < writes.length; i += 400) {
    var chunk = writes.slice(i, i + 400);
    console.log("[merge-rounds] bundled batch chunk", Math.floor(i / 400) + 1, "ops:", chunk.length);
    var batch = newBatch();
    chunk.forEach(function (w) {
      if (w.delete) {
        var delId = voteDocIdFromPath(w.delete);
        batch.delete(voteDoc(delId));
        return;
      }
      if (w.update) {
        var upId = voteDocIdFromPath(w.update.name);
        var data = w.plainData || restFieldsToObject(w.update.fields);
        batch.set(voteDoc(upId), data, { merge: true });
      }
    });
    try {
      await batch.commit();
    } catch (e) {
      console.error("[merge-rounds] bundled batch failed", e);
      var code = e && e.code ? String(e.code) : "";
      if (/permission/i.test(code) || /permission/i.test(e.message || "")) {
        throw new Error(formatWriteStatus({ code: 7, message: e.message }, "batch commit"));
      }
      throw e;
    }
  }
}

async function createCoachVotes(rows) {
  if (!rows.length) return 0;
  await ensureCloudAuth(true);
  await waitForFirestoreOps(25000);
  var addDoc = window.__svAddDoc;
  var coachCol = window.__svCoachVotesCol;
  var created = 0;
  for (var i = 0; i < rows.length; i++) {
    var ref = await addDoc(coachCol(), rows[i]);
    created++;
    console.log("[merge-rounds] coach vote created", ref && ref.id ? ref.id : "?", rows[i].round, "slot", rows[i].slot);
  }
  return created;
}

function docName(docId) {
  docId = normalizeVoteDocId(docId);
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
  // Public Firestore reads use API key via readHeaders(); do not block on auth.
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
    var row = buildVoteRow(v, teamId, plan.dstLabel, plan.dstRoundKey);
    console.log("[merge-rounds] upsert", row.id, "←", v.voterName, plan.srcLabel, "→", plan.dstLabel);
    return {
      update: {
        name: docName(row.id),
        fields: {},
      },
      plainData: {
        teamId: row.teamId,
        voterName: row.voterName,
        voterNameKey: row.voterNameKey,
        round: row.round,
        picks: row.picks,
        submittedAt: row.submittedAt,
      },
    };
  });
  if (writes.length) await batchWrite(writes);
  return writes.length;
}

async function writeMergeAuditLog(teamId, plan, mergedCount, deletedCount, deleteSource) {
  try {
    await ensureCloudAuth(true);
    await waitForFirestoreOps(8000);
    if (!window.__svAddDoc || !window.__svAdminLogCol) return;
    var auth = window.__svAuth;
    var adminEmail = auth && auth.currentUser ? auth.currentUser.email || "" : "";
    await window.__svAddDoc(window.__svAdminLogCol(), {
      action: "mergeRounds",
      teamId: teamId,
      sourceRound: plan.srcLabel,
      destRound: plan.dstLabel,
      mergedCount: mergedCount,
      deletedSourceCount: deleteSource ? deletedCount : 0,
      skippedDup: plan.skippedDup.length,
      invalid: plan.invalid.length,
      adminEmail: adminEmail,
      timestamp: new Date().toISOString(),
    });
    console.log("[merge-rounds] audit log written");
  } catch (e) {
    console.warn("[merge-rounds] audit log error", e);
  }
}

function findChrisPlayerVotes(votes, teamId) {
  return (votes || []).filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId) && isChrisVoterName(v.voterName);
  });
}

function applyChrisMigrationLocal(teamId, slot, chrisVotes) {
  var data = loadLocalData();
  data.votes = data.votes || [];
  data.coachVotes = data.coachVotes || [];
  var removed = 0;
  var added = 0;
  chrisVotes.forEach(function (v) {
    var coachRow = buildCoachVoteRow(v, slot);
    coachRow.id = "local_chris_" + teamId + "_s" + slot + "_r" + roundDocKey(coachRow.round);
    data.coachVotes.push(coachRow);
    added++;
  });
  data.votes = data.votes.filter(function (v) {
    if (!v || teamIdStr(v.teamId) !== teamIdStr(teamId) || !isChrisVoterName(v.voterName)) return true;
    removed++;
    return false;
  });
  saveLocalData(data);
  return { removed: removed, added: added, coachVotes: data.coachVotes };
}

async function migrateChrisVotesCloud(teamId, slot) {
  await ensureCloudAuth(true);
  var votes = await fetchVotesRest(teamId);
  var chrisVotes = findChrisPlayerVotes(votes, teamId);
  if (!chrisVotes.length) return { moved: 0, removed: 0, rounds: [] };

  var coachRows = chrisVotes.map(function (v) {
    return buildCoachVoteRow(v, slot);
  });
  var created = await createCoachVotes(coachRows);

  var deletes = chrisVotes
    .filter(function (v) {
      return v && v.id;
    })
    .map(function (v) {
      return { delete: docName(v.id) };
    });
  if (deletes.length) await batchWrite(deletes);

  var rounds = chrisVotes.map(function (v) {
    return voteRoundLabel(v);
  });
  return { moved: created, removed: deletes.length, rounds: rounds };
}

async function runMigrateChrisCoachVotes(teamId, slot) {
  if (slot == null || !isFinite(slot)) slot = CHRIS_COACH_SLOT;
  if (!isSuperAdminUnlocked()) {
    throw new Error("Unlock super admin first (Coach / admin → Super admin).");
  }
  var localData = loadLocalData();
  var localChris = findChrisPlayerVotes(localData.votes, teamId);
  var localOnly = !window.__svFirebaseApp;

  if (localOnly) {
    if (!localChris.length) {
      return { moved: 0, removed: 0, rounds: [], localOnly: true, message: "No Chris player votes in local cache." };
    }
    var localRes = applyChrisMigrationLocal(teamId, slot, localChris);
    notifyVotesMerged(teamId, loadLocalData().votes.filter(function (v) {
      return v && teamIdStr(v.teamId) === teamIdStr(teamId);
    }));
    return {
      moved: localRes.added,
      removed: localRes.removed,
      rounds: localChris.map(function (v) {
        return voteRoundLabel(v);
      }),
      localOnly: true,
      message:
        "Moved " +
        localRes.added +
        " Chris ballot(s) to coach slot " +
        slot +
        " in this browser (local only).",
    };
  }

  await ensureCloudAuth(true);
  var cloudRes = await migrateChrisVotesCloud(teamId, slot);
  if (localChris.length) applyChrisMigrationLocal(teamId, slot, localChris);
  var freshVotes = await fetchVotesRest(teamId);
  notifyVotesMerged(teamId, freshVotes);
  if (!cloudRes.moved && !localChris.length) {
    return {
      moved: 0,
      removed: 0,
      rounds: [],
      message: "No player votes found for Chris on team " + teamId + ".",
    };
  }
  return {
    moved: cloudRes.moved,
    removed: cloudRes.removed,
    rounds: cloudRes.rounds,
    message:
      "Moved " +
      cloudRes.moved +
      " Chris player ballot(s) to coach slot " +
      slot +
      (cloudRes.rounds.length ? " (" + cloudRes.rounds.join(", ") + ")" : "") +
      ". Removed " +
      cloudRes.removed +
      " from public votes.",
  };
}

function coachDocName(docId) {
  return (
    "projects/" +
    projectId() +
    "/databases/(default)/documents/coachVotes/" +
    encodeURIComponent(String(docId || "")).replace(/%2F/g, "/")
  );
}

function coachDocIdFromPath(name) {
  var m = String(name || "").match(/\/documents\/coachVotes\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : String(name || "");
}

function coachDocPathFromName(name) {
  var m = String(name || "").match(/\/documents\/coachVotes\/(.+)$/);
  if (m) return decodeURIComponent(m[1]);
  return coachDocIdFromPath(name);
}

function ingestCoachVoteRows(rows, byId) {
  rows.forEach(function (row) {
    if (!row || !row.document) return;
    var id = coachDocPathFromName(row.document.name);
    if (!id || byId[id]) return;
    var data = {};
    var fields = row.document.fields || {};
    Object.keys(fields).forEach(function (k) {
      data[k] = parseFsValue(fields[k]);
    });
    byId[id] = Object.assign({ id: id }, data);
  });
}

async function fetchCoachVotesRest(teamId) {
  var byId = Object.create(null);
  for (var i = 0; i < 2; i++) {
    var tid = i === 0 ? teamId : String(teamId);
    var structuredQuery = {
      from: [{ collectionId: "coachVotes" }],
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
      ingestCoachVoteRows(rows, byId);
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

function teamCoachLabels(team) {
  var coach1 = (team && team.coach1Name) || "Coach 1";
  var coach2 = (team && team.coach2Name) || "Coach 2";
  return {
    coach1: coach1,
    coach2: coach2,
    slot1Label: "Coach 1 (" + coach1 + ")",
    slot2Label: "Coach 2 (" + coach2 + ")",
  };
}

function resolveChrisCoachSlot(team) {
  if (!team) return CHRIS_COACH_SLOT;
  var labels = teamCoachLabels(team);
  if (isChrisVoterName(labels.coach2)) return CHRIS_COACH_SLOT;
  if (isChrisVoterName(labels.coach1)) return WILL_COACH_SLOT;
  return CHRIS_COACH_SLOT;
}

function picksSignature(picks) {
  return (Array.isArray(picks) ? picks : [])
    .map(function (p) {
      return canonicalPlayerName(p) || p;
    })
    .filter(Boolean)
    .join("|");
}

function buildChrisPlayerRoundMap(teamId, localData) {
  var map = Object.create(null);
  findChrisPlayerVotes(localData.votes || [], teamId).forEach(function (v) {
    map[voteRoundLabel(v)] = v;
  });
  (localData.coachVotes || []).forEach(function (v) {
    if (!v || teamIdStr(v.teamId) !== teamIdStr(teamId)) return;
    if (v.id && String(v.id).indexOf("local_chris_") === 0) {
      map[voteRoundLabel(v)] = v;
    }
  });
  return map;
}

function looksLikeChrisMigrationDoc(coachDoc, chrisRoundMap) {
  var round = voteRoundLabel(coachDoc);
  var chrisVote = chrisRoundMap[round];
  if (!chrisVote) return false;
  return picksSignature(chrisVote.picks) === picksSignature(coachDoc.picks);
}

function planCoachSlotRepair(teamId, coachVotes, team, localData) {
  localData = localData || loadLocalData();
  var labels = teamCoachLabels(team);
  var chrisSlot = resolveChrisCoachSlot(team);
  var chrisRoundMap = buildChrisPlayerRoundMap(teamId, localData);
  var byRound = Object.create(null);
  var moves = [];
  var keeps = [];

  (coachVotes || [])
    .filter(function (v) {
      return v && teamIdStr(v.teamId) === teamIdStr(teamId);
    })
    .forEach(function (v) {
      var round = voteRoundLabel(v);
      if (!byRound[round]) byRound[round] = { slot1: [], slot2: [] };
      if (parseInt(v.slot, 10) === 2) byRound[round].slot2.push(v);
      else byRound[round].slot1.push(v);
    });

  Object.keys(byRound)
    .sort(function (a, b) {
      return roundSortKey(a) - roundSortKey(b) || String(a).localeCompare(String(b));
    })
    .forEach(function (round) {
      var group = byRound[round];
      group.slot1.sort(function (a, b) {
        return String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
      });
      group.slot2.sort(function (a, b) {
        return String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
      });

      if (group.slot1.length > 1) {
        keeps.push({
          doc: group.slot1[0],
          round: round,
          slot: WILL_COACH_SLOT,
          reason: "Keep as " + labels.slot1Label + " (earliest slot 1 ballot)",
        });
        for (var i = 1; i < group.slot1.length; i++) {
          moves.push({
            doc: group.slot1[i],
            round: round,
            fromSlot: WILL_COACH_SLOT,
            toSlot: chrisSlot,
            reason: "Duplicate slot 1 — move to " + labels.slot2Label,
          });
        }
        return;
      }

      if (group.slot1.length === 1 && !group.slot2.length) {
        var lone = group.slot1[0];
        if (looksLikeChrisMigrationDoc(lone, chrisRoundMap)) {
          moves.push({
            doc: lone,
            round: round,
            fromSlot: WILL_COACH_SLOT,
            toSlot: chrisSlot,
            reason: "Chris player vote migrated to slot 1 — move to " + labels.slot2Label,
          });
        } else {
          keeps.push({
            doc: lone,
            round: round,
            slot: WILL_COACH_SLOT,
            reason: "Only slot 1 ballot — keep as " + labels.slot1Label,
          });
        }
      }
    });

  return {
    teamId: teamId,
    labels: labels,
    chrisSlot: chrisSlot,
    moves: moves,
    keeps: keeps,
    byRound: byRound,
    coachVotes: coachVotes || [],
  };
}

function renderCoachSlotRepairPreview(el, plan) {
  if (!el) return;
  el.style.display = "block";
  var lines = [
    "<div style='font-weight:800;color:var(--red-dark);margin-bottom:0.35rem'>Coach slot repair preview</div>",
    "<div style='font-size:0.88rem;color:#52525b'>" +
      escapeHtml(plan.labels.slot1Label) +
      " stays slot " +
      WILL_COACH_SLOT +
      " · " +
      escapeHtml(plan.labels.slot2Label) +
      " → slot " +
      plan.chrisSlot +
      "</div>",
  ];
  if (!plan.moves.length) {
    lines.push("<p class='hint' style='margin:0.45rem 0 0'>No slot fixes needed for this team.</p>");
  } else {
    lines.push(
      "<div style='margin-top:0.5rem;font-weight:750'>" +
        plan.moves.length +
        " ballot(s) to reassign</div>"
    );
    plan.moves.forEach(function (move) {
      lines.push(
        "<div style='margin-top:0.35rem;padding:0.45rem 0.55rem;border:1px solid var(--border);border-radius:10px;font-size:0.88rem'>" +
          "<strong>" +
          escapeHtml(move.round) +
          "</strong> slot " +
          move.fromSlot +
          " → " +
          move.toSlot +
          "<br><span class='hint'>" +
          escapeHtml(move.reason) +
          "</span><br><span style='font-size:0.82rem;color:#71717a;font-style:italic'>Vote picks hidden.</span></div>"
      );
    });
  }
  if (plan.keeps.length) {
    lines.push(
      "<details style='margin-top:0.45rem'><summary>Unchanged (" +
        plan.keeps.length +
        ")</summary><p class='hint' style='margin:0.35rem 0 0'>" +
        escapeHtml(
          plan.keeps
            .map(function (k) {
              return k.round + " — " + k.reason;
            })
            .join("; ")
        ) +
        "</p></details>"
    );
  }
  el.innerHTML = lines.join("");
}

async function batchWriteCoach(writes) {
  if (!writes.length) return;
  await ensureCloudAuth(true);
  await waitForFirestoreOps(25000);
  var coachDocFn = window.__svCoachVoteDoc;
  var newBatch = window.__svFirestoreBatch;
  for (var i = 0; i < writes.length; i += 400) {
    var chunk = writes.slice(i, i + 400);
    var batch = newBatch();
    chunk.forEach(function (w) {
      if (w.delete) {
        batch.delete(coachDocFn(w.docId));
        return;
      }
      batch.set(coachDocFn(w.docId), w.data, { merge: true });
    });
    try {
      await batch.commit();
    } catch (e) {
      console.error("[merge-rounds] coach batch failed", e);
      throw e;
    }
  }
}

function applyCoachSlotRepairLocal(teamId, plan) {
  var data = loadLocalData();
  data.coachVotes = data.coachVotes || [];
  var touched = 0;
  plan.moves.forEach(function (move) {
    if (!move.doc || !move.doc.id) return;
    for (var i = 0; i < data.coachVotes.length; i++) {
      var row = data.coachVotes[i];
      if (!row || row.id !== move.doc.id) continue;
      data.coachVotes[i] = Object.assign({}, row, { slot: move.toSlot });
      touched++;
      break;
    }
  });
  saveLocalData(data);
  return touched;
}

async function runCoachSlotRepair(teamId, plan) {
  if (!plan || !plan.moves.length) {
    return { updated: 0, message: "No coach slot changes needed." };
  }
  if (!isSuperAdminUnlocked()) {
    throw new Error("Unlock super admin first (Coach / admin → Super admin).");
  }

  var localUpdated = applyCoachSlotRepairLocal(teamId, plan);
  if (!window.__svFirebaseApp) {
    return {
      updated: localUpdated,
      localOnly: true,
      message: "Updated " + localUpdated + " coach ballot(s) in this browser (local only).",
    };
  }

  await ensureCloudAuth(true);
  var writes = plan.moves
    .filter(function (move) {
      return move.doc && move.doc.id;
    })
    .map(function (move) {
      return {
        docId: move.doc.id,
        data: { slot: move.toSlot },
      };
    });
  await batchWriteCoach(writes);

  try {
    if (window.__svAddDoc && window.__svAdminLogCol) {
      var auth = window.__svAuth;
      await window.__svAddDoc(window.__svAdminLogCol(), {
        action: "coachSlotRepair",
        teamId: teamId,
        movedCount: writes.length,
        rounds: plan.moves.map(function (m) {
          return m.round;
        }),
        adminEmail: auth && auth.currentUser ? auth.currentUser.email || "" : "",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn("[merge-rounds] coach slot repair audit log failed", e);
  }

  return {
    updated: writes.length,
    message:
      "Reassigned " +
      writes.length +
      " coach ballot(s) to " +
      plan.labels.slot2Label +
      ". " +
      plan.labels.slot1Label +
      " unchanged.",
  };
}

async function previewCoachSlotRepairForTeam(teamId) {
  var data = await loadData(teamId);
  var team = (data.teams || []).find(function (t) {
    return teamIdStr(t.id) === teamIdStr(teamId);
  });
  var coachVotes = [];
  if (window.__svFirebaseApp) {
    try {
      coachVotes = await fetchCoachVotesRest(teamId);
    } catch (e) {
      console.warn("[merge-rounds] coachVotes fetch failed", e);
    }
  }
  var localData = loadLocalData();
  var localCoach = (localData.coachVotes || []).filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId);
  });
  var byId = Object.create(null);
  coachVotes.concat(localCoach).forEach(function (v) {
    if (!v) return;
    var id = v.id || teamId + "|s" + v.slot + "|" + voteRoundLabel(v);
    byId[id] = v;
  });
  return planCoachSlotRepair(
    teamId,
    Object.keys(byId).map(function (id) {
      return byId[id];
    }),
    team,
    localData
  );
}

function refreshChrisCoachSlotLabels() {
  var slotSel = document.getElementById("chrisCoachSlot");
  if (!slotSel) return;
  var teamId = getAdminTeamId();
  var data = loadLocalData();
  var team = (data.teams || []).find(function (t) {
    return teamIdStr(t.id) === teamIdStr(teamId);
  });
  var labels = teamCoachLabels(team);
  var opt1 = slotSel.querySelector('option[value="1"]');
  var opt2 = slotSel.querySelector('option[value="2"]');
  if (opt1) opt1.textContent = labels.slot1Label;
  if (opt2) opt2.textContent = labels.slot2Label;
  if (!slotSel.dataset.userPicked) {
    slotSel.value = String(resolveChrisCoachSlot(team));
  }
}

var lastCoachSlotPlan = null;

function applyMergedVotesLocal(teamId, plan, deleteSource) {
  var data = loadLocalData();
  data.votes = data.votes || [];
  plan.merged.forEach(function (v) {
    var key = voterDocKey(v);
    var newId = "t" + teamId + "_r" + plan.dstRoundKey + "_v" + key;
    var row = {
      id: newId,
      teamId: teamId,
      voterName: canonicalPlayerName(v.voterName) || v.voterName,
      voterNameKey: key,
      round: plan.dstLabel,
      picks: (Array.isArray(v.picks) ? v.picks.slice() : []).map(function (p) {
        return canonicalPlayerName(p) || p;
      }),
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

function ensureManualRoundFieldsVisible() {
  ["mergeSourceRoundManual", "mergeDestRoundManual"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = "";
    el.removeAttribute("hidden");
    var label = document.querySelector('label[for="' + id + '"]');
    if (label) {
      label.style.display = "";
      label.removeAttribute("hidden");
    }
  });
}

function localRoundsFallback(teamId) {
  var localData = loadLocalData();
  return collectRounds(teamId, localData.teams || [], (localData.votes || []).filter(function (v) {
    return v && teamIdStr(v.teamId) === teamIdStr(teamId);
  }));
}

function fillRoundSelects(srcSel, dstSel, rounds, team) {
  var current = team && team.round ? normalizeRoundLabel(team.round) || team.round : "";
  if (!rounds.length) rounds = ["Round 1"];
  var srcDefault = rounds.length > 1 ? rounds[rounds.length - 1] : current;
  var dstDefault = current || rounds[0];
  var srcPreferred =
    userRoundSelections.src && rounds.indexOf(userRoundSelections.src) !== -1
      ? userRoundSelections.src
      : srcDefault;
  var dstPreferred =
    userRoundSelections.dst && rounds.indexOf(userRoundSelections.dst) !== -1
      ? userRoundSelections.dst
      : dstDefault;
  fillSelect(srcSel, rounds, srcPreferred);
  fillSelect(dstSel, rounds, dstPreferred);
  if (userRoundSelections.src && rounds.indexOf(userRoundSelections.src) !== -1) {
    srcSel.value = userRoundSelections.src;
  }
  if (userRoundSelections.dst && rounds.indexOf(userRoundSelections.dst) !== -1) {
    dstSel.value = userRoundSelections.dst;
  }
  syncManualFieldsFromDropdowns();
}

var unlockPollTimer = null;
var lastUnlockState = false;
var refreshDebounceTimer = null;
var roundsLoadedSuccessfully = false;
var lastRefreshTeamId = null;
var userRoundSelections = { src: null, dst: null };
var userEditedManual = { src: false, dst: false };

function stopUnlockPolling() {
  if (!unlockPollTimer) return;
  clearInterval(unlockPollTimer);
  unlockPollTimer = null;
}

function selectsPopulated() {
  var srcSel = document.getElementById("mergeSourceRound");
  return !!(srcSel && srcSel.options.length > 0);
}

function userHasRoundSelection() {
  var srcSel = document.getElementById("mergeSourceRound");
  var dstSel = document.getElementById("mergeDestRound");
  return (
    !!(srcSel && srcSel.value) ||
    !!(dstSel && dstSel.value) ||
    !!userRoundSelections.src ||
    !!userRoundSelections.dst
  );
}

function shouldSkipPassiveRefresh() {
  return roundsLoadedSuccessfully && selectsPopulated() && userHasRoundSelection();
}

function syncManualFromDropdown(selectId, manualId) {
  var sel = document.getElementById(selectId);
  var manual = document.getElementById(manualId);
  if (!sel || !manual) return;
  manual.value = sel.value || "";
}

function syncManualFieldsFromDropdowns() {
  if (!userEditedManual.src) syncManualFromDropdown("mergeSourceRound", "mergeSourceRoundManual");
  if (!userEditedManual.dst) syncManualFromDropdown("mergeDestRound", "mergeDestRoundManual");
}

function wireRoundSelectSync() {
  var pairs = [
    ["mergeSourceRound", "mergeSourceRoundManual", "src"],
    ["mergeDestRound", "mergeDestRoundManual", "dst"],
  ];
  pairs.forEach(function (p) {
    var sel = document.getElementById(p[0]);
    var manual = document.getElementById(p[1]);
    var key = p[2];
    if (!sel || sel._svRoundSync) return;
    sel._svRoundSync = true;
    sel.addEventListener("change", function () {
      userRoundSelections[key] = sel.value || null;
      if (manual) {
        manual.value = sel.value || "";
        userEditedManual[key] = false;
      }
    });
    if (manual && !manual._svRoundSync) {
      manual._svRoundSync = true;
      manual.addEventListener("input", function () {
        userEditedManual[key] = !!manual.value.trim();
        if (manual.value.trim()) userRoundSelections[key] = null;
      });
    }
  });
}

function scheduleRefreshRoundSelects(immediate) {
  if (!immediate && shouldSkipPassiveRefresh()) return;
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  if (immediate) {
    refreshRoundSelects().catch(function () {});
    return;
  }
  refreshDebounceTimer = setTimeout(function () {
    refreshDebounceTimer = null;
    if (shouldSkipPassiveRefresh()) return;
    refreshRoundSelects().catch(function () {});
  }, 300);
}

function scheduleUnlockRefresh() {
  if (unlockPollTimer || roundsLoadedSuccessfully) return;
  var attempts = 0;
  unlockPollTimer = setInterval(function () {
    if (roundsLoadedSuccessfully) {
      stopUnlockPolling();
      return;
    }
    attempts++;
    var unlocked = isSuperAdminUnlocked();
    if (unlocked !== lastUnlockState) {
      lastUnlockState = unlocked;
      if (unlocked) scheduleRefreshRoundSelects();
    }
    if (attempts > 24 || roundsLoadedSuccessfully) stopUnlockPolling();
  }, 500);
}

function triggerUnlockRefresh() {
  refreshChrisCoachSlotLabels();
  if (shouldSkipPassiveRefresh()) return;
  scheduleRefreshRoundSelects();
}

async function refreshRoundSelects() {
  var srcSel = document.getElementById("mergeSourceRound");
  var dstSel = document.getElementById("mergeDestRound");
  var errEl = document.getElementById("mergeRoundsErr");
  if (!srcSel || !dstSel) return;
  ensureManualRoundFieldsVisible();
  wireRoundSelectSync();
  var teamId = getAdminTeamId();
  if (lastRefreshTeamId !== null && teamIdStr(teamId) !== teamIdStr(lastRefreshTeamId)) {
    userRoundSelections.src = null;
    userRoundSelections.dst = null;
    userEditedManual.src = false;
    userEditedManual.dst = false;
    roundsLoadedSuccessfully = false;
  }
  lastRefreshTeamId = teamId;
  refreshChrisCoachSlotLabels();
  var unlocked = isSuperAdminUnlocked();
  lastUnlockState = unlocked;

  if (!unlocked) {
    roundsLoadedSuccessfully = false;
    var localRounds = localRoundsFallback(teamId);
    fillRoundSelects(srcSel, dstSel, localRounds, null);
    if (localRounds.length) roundsLoadedSuccessfully = true;
    setMergeHint(
      localRounds.length
        ? localRounds.length + " round(s) from local cache — unlock super admin to load cloud votes."
        : "Unlock super admin to load rounds from cloud (or type rounds manually below).",
      true
    );
    return;
  }

  setMergeHint("Loading rounds from cloud…");
  if (errEl) errEl.textContent = "";
  try {
    var data = await loadData(teamId);
    var team = (data.teams || []).find(function (t) {
      return teamIdStr(t.id) === teamIdStr(teamId);
    });
    var rounds = collectRounds(teamId, data.teams, data.votes);
    fillRoundSelects(srcSel, dstSel, rounds, team);
    roundsLoadedSuccessfully = rounds.length > 0;
    if (roundsLoadedSuccessfully) stopUnlockPolling();
    var authReady = !!(window.__svAuth && window.__svAuth.currentUser);
    var parts = [
      rounds.length + " round(s)",
      (data.votes || []).length + " vote(s) loaded",
      data.localOnly ? "local fallback" : "cloud",
      authReady ? "auth OK" : "auth optional for reads",
    ];
    if (data.warnings && data.warnings.length) parts.push("warn: " + data.warnings.join("; "));
    setMergeHint(parts.join(" · "), !!(data.warnings && data.warnings.length));
    if (!rounds.length) {
      if (errEl) errEl.textContent = "No rounds found — check team config, votes, or type rounds manually below.";
    }
  } catch (e) {
    console.warn("merge rounds: could not refresh selects", e);
    var fallback = localRoundsFallback(teamId);
    fillRoundSelects(srcSel, dstSel, fallback.length ? fallback : ["Round 1"], null);
    roundsLoadedSuccessfully = fallback.length > 0;
    if (roundsLoadedSuccessfully) stopUnlockPolling();
    setMergeHint("Could not load cloud rounds: " + (e.message || String(e)) + " — using fallback.", true);
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

  wireRoundSelectSync();

  var teamTabs = document.getElementById("adminTeamTabs");
  if (teamTabs) {
    teamTabs.addEventListener("click", function () {
      setTimeout(function () {
        scheduleRefreshRoundSelects(true);
      }, 80);
    });
  }
  var resultsTeamSel = document.getElementById("resultsTeamSelect");
  if (resultsTeamSel) {
    resultsTeamSel.addEventListener("change", function () {
      scheduleRefreshRoundSelects(true);
    });
  }
  var unlockBtn = document.getElementById("unlockAdmin");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", function () {
      triggerUnlockRefresh();
    });
  }
  var superContent = document.getElementById("superAdminContent");
  if (superContent) {
    var unlockObs = new MutationObserver(function () {
      if (!isSuperAdminUnlocked()) return;
      triggerUnlockRefresh();
    });
    unlockObs.observe(superContent, { attributes: true, attributeFilter: ["style"] });
  }
  scheduleUnlockRefresh();

  var migrateChrisBtn = document.getElementById("migrateChrisCoachVotes");
  if (migrateChrisBtn && !migrateChrisBtn._svBound) {
    migrateChrisBtn._svBound = true;
    migrateChrisBtn.addEventListener("click", async function () {
      var hintEl = document.getElementById("migrateChrisHint");
      var errElChris = document.getElementById("migrateChrisErr");
      if (hintEl) hintEl.textContent = "";
      if (errElChris) errElChris.textContent = "";
      migrateChrisBtn.disabled = true;
      try {
        if (!isSuperAdminUnlocked()) {
          throw new Error("Unlock super admin first (Coach / admin → Super admin).");
        }
        var teamId = getAdminTeamId();
        var slotSel = document.getElementById("chrisCoachSlot");
        var slot = slotSel && slotSel.value ? parseInt(slotSel.value, 10) : CHRIS_COACH_SLOT;
        if (
          !confirm(
            "Move all Chris player votes to " +
              (slotSel && slotSel.options[slotSel.selectedIndex]
                ? slotSel.options[slotSel.selectedIndex].textContent
                : "coach slot " + slot) +
              "? Public votes will be removed from the player pool."
          )
        ) {
          return;
        }
        var result = await runMigrateChrisCoachVotes(teamId, slot);
        if (hintEl) hintEl.textContent = result.message || "Done.";
        if (errElChris && !result.moved && !result.removed) {
          errElChris.textContent = result.message || "Nothing to move.";
        }
        scheduleRefreshRoundSelects(true);
      } catch (e) {
        console.error("[merge-rounds] Chris migration failed", e);
        if (errElChris) errElChris.textContent = e.message || String(e);
      } finally {
        migrateChrisBtn.disabled = false;
      }
    });
  }

  var chrisSlotSel = document.getElementById("chrisCoachSlot");
  if (chrisSlotSel && !chrisSlotSel._svBound) {
    chrisSlotSel._svBound = true;
    chrisSlotSel.addEventListener("change", function () {
      chrisSlotSel.dataset.userPicked = "1";
    });
    refreshChrisCoachSlotLabels();
  }

  var coachRepairPreviewBtn = document.getElementById("coachSlotRepairPreview");
  var coachRepairRunBtn = document.getElementById("coachSlotRepairRun");
  if (coachRepairPreviewBtn && !coachRepairPreviewBtn._svBound) {
    coachRepairPreviewBtn._svBound = true;
    coachRepairPreviewBtn.addEventListener("click", async function () {
      var previewEl = document.getElementById("coachSlotRepairPreviewPanel");
      var hintEl = document.getElementById("coachSlotRepairHint");
      var errEl = document.getElementById("coachSlotRepairErr");
      if (hintEl) hintEl.textContent = "";
      if (errEl) errEl.textContent = "";
      coachRepairPreviewBtn.disabled = true;
      if (coachRepairRunBtn) coachRepairRunBtn.disabled = true;
      lastCoachSlotPlan = null;
      try {
        if (!isSuperAdminUnlocked()) {
          throw new Error("Unlock super admin first (Coach / admin → Super admin).");
        }
        var teamId = getAdminTeamId();
        lastCoachSlotPlan = await previewCoachSlotRepairForTeam(teamId);
        renderCoachSlotRepairPreview(previewEl, lastCoachSlotPlan);
        if (coachRepairRunBtn) coachRepairRunBtn.disabled = !lastCoachSlotPlan.moves.length;
        if (hintEl) {
          hintEl.textContent = lastCoachSlotPlan.moves.length
            ? lastCoachSlotPlan.moves.length + " ballot(s) ready to reassign."
            : "No mistaken slot 1 Chris ballots found.";
        }
      } catch (e) {
        console.error("[merge-rounds] coach slot preview failed", e);
        if (errEl) errEl.textContent = e.message || String(e);
        if (previewEl) previewEl.style.display = "none";
      } finally {
        coachRepairPreviewBtn.disabled = false;
      }
    });
  }

  if (coachRepairRunBtn && !coachRepairRunBtn._svBound) {
    coachRepairRunBtn._svBound = true;
    coachRepairRunBtn.addEventListener("click", async function () {
      var hintEl = document.getElementById("coachSlotRepairHint");
      var errEl = document.getElementById("coachSlotRepairErr");
      if (hintEl) hintEl.textContent = "";
      if (errEl) errEl.textContent = "";
      coachRepairRunBtn.disabled = true;
      try {
        if (!isSuperAdminUnlocked()) {
          throw new Error("Unlock super admin first (Coach / admin → Super admin).");
        }
        if (!lastCoachSlotPlan || !lastCoachSlotPlan.moves.length) {
          throw new Error("Run preview first — nothing to repair.");
        }
        var labels = lastCoachSlotPlan.labels;
        if (
          !confirm(
            "Reassign " +
              lastCoachSlotPlan.moves.length +
              " ballot(s) to " +
              labels.slot2Label +
              "? " +
              labels.slot1Label +
              " stays on slot " +
              WILL_COACH_SLOT +
              "."
          )
        ) {
          return;
        }
        var teamId = getAdminTeamId();
        var result = await runCoachSlotRepair(teamId, lastCoachSlotPlan);
        if (hintEl) hintEl.textContent = result.message || "Done.";
        lastCoachSlotPlan = await previewCoachSlotRepairForTeam(teamId);
        renderCoachSlotRepairPreview(
          document.getElementById("coachSlotRepairPreviewPanel"),
          lastCoachSlotPlan
        );
        coachRepairRunBtn.disabled = !lastCoachSlotPlan.moves.length;
      } catch (e) {
        console.error("[merge-rounds] coach slot repair failed", e);
        if (errEl) errEl.textContent = e.message || String(e);
      } finally {
        coachRepairRunBtn.disabled = !lastCoachSlotPlan || !lastCoachSlotPlan.moves.length;
      }
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
      var srcRound = getRoundFromUi("mergeSourceRound", "mergeSourceRoundManual");
      var dstRound = getRoundFromUi("mergeDestRound", "mergeDestRoundManual");
      if (!srcRound || !dstRound) throw new Error("Select or type valid source and destination rounds.");
      if (voteRoundLabel({ round: srcRound }) === voteRoundLabel({ round: dstRound })) {
        throw new Error("Source and destination rounds must be different.");
      }
      var data = await loadData(teamId);
      var team = (data.teams || []).find(function (t) {
        return teamIdStr(t.id) === teamIdStr(teamId);
      });
      var strict = !!document.getElementById("mergeStrictSquad")?.checked;
      lastPlan = planMerge(teamId, data.teams, data.votes, srcRound, dstRound, {
        strictSquadCheck: strict,
      });
      lastPlan.teamId = teamId;
      lastPlan.teams = data.teams;
      lastPlan.votes = data.votes;
      lastPlan.srcRound = srcRound;
      lastPlan.dstRound = dstRound;
      lastPlan.localOnly = !!data.localOnly;
      renderSummary(summaryEl, lastPlan, (team && team.name) || "Team " + teamId);
      runBtn.disabled = !lastPlan.merged.length;
      if (data.localOnly && errEl) {
        errEl.textContent =
          "Using local cache only — cloud votes may be incomplete. Refresh after unlock if preview looks wrong.";
      }
      if (!lastPlan.merged.length && errEl) {
        errEl.textContent =
          "Nothing selected — tick voters to include, or use Force include for flagged names.";
      }
    } catch (e) {
      console.error(e);
      if (errEl) errEl.textContent = e.message || String(e);
    }
  });

  runBtn.addEventListener("click", async function () {
    if (errEl) errEl.textContent = "";
    if (lastPlan) {
      var refreshed = rebuildPlanFromUi(lastPlan);
      if (refreshed) {
        refreshed.teamId = lastPlan.teamId;
        refreshed.teams = lastPlan.teams;
        refreshed.votes = lastPlan.votes;
        refreshed.srcRound = lastPlan.srcRound;
        refreshed.dstRound = lastPlan.dstRound;
        refreshed.localOnly = lastPlan.localOnly;
        lastPlan = refreshed;
      }
    }
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
      if (!isSuperAdminUnlocked()) {
        throw new Error("Unlock super admin first (Coach / admin → Super admin).");
      }
      lastMergeRunAt = Date.now();
      var mergedCount = 0;
      var deletedCount = 0;
      if (lastPlan.localOnly) {
        var res = runMergeLocal(lastPlan.teamId, lastPlan, deleteSource);
        mergedCount = res.merged;
        deletedCount = res.removed;
      } else {
        await ensureCloudAuth(true);
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
      userRoundSelections.src = null;
      userRoundSelections.dst = null;
      userEditedManual.src = false;
      userEditedManual.dst = false;
      roundsLoadedSuccessfully = false;
      setTimeout(function () {
        scheduleRefreshRoundSelects(true);
      }, 500);
    } catch (e) {
      console.error("[merge-rounds] run merge failed", e);
      if (errEl) errEl.textContent = e.message || String(e);
      runBtn.disabled = !!(lastPlan && lastPlan.merged.length);
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
    scheduleRefreshRoundSelects(true);
  }
  var obs = new MutationObserver(wireOnce);
  obs.observe(mount, { childList: true, subtree: true });
  wireOnce();
}

try {
  window.__svRefreshMergeRounds = function () {
    return scheduleRefreshRoundSelects(true);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeAdminMount, { once: true });
  } else {
    observeAdminMount();
  }
} catch (e) {
  console.warn("merge-rounds: init failed", e);
}
