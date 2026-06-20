/**
 * FotMob-style public lineup view (single team, dark pitch, circular nodes).
 * Shared display logic for public tab + PNG export.
 */
import { displayPlayerName, canonicalPlayerName } from "./name-match.js?tag=v145";
import { fetchMatchWeather, weatherPanelHtml, getWeatherUnits, wireWeatherUnitsToggle } from "./weather-forecast.js?tag=v145";

export const FORMATION_ROLES = {
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LWB", "CM", "CM", "CM", "RWB", "ST", "ST"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LM", "CAM", "RM", "ST"],
};

export const FORMATION_SPLITS = {
  "4-3-3": [1, 4, 3, 3],
  "4-4-2": [1, 4, 4, 2],
  "3-5-2": [1, 3, 5, 2],
  "4-2-3-1": [1, 4, 2, 3, 1],
};

export function clamp01(v) {
  var n = Number(v);
  if (!isFinite(n)) return 0.5;
  return Math.max(0.05, Math.min(0.95, n));
}

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Number + surname (trimmed, no double spaces). */
export function lineupLabel(name, number) {
  var clean = canonicalPlayerName(displayPlayerName(name));
  var parts = clean.split(/\s+/).filter(Boolean);
  var surname = parts.length > 1 ? parts[parts.length - 1] : clean;
  var num = String(number || "").trim();
  return num ? num + " " + surname : surname;
}

/** C / VC / GK badge from squad config (team.squadBadges). */
export function resolvePlayerBadge(player, badgesMap) {
  if (!player) return "";
  var name = canonicalPlayerName(displayPlayerName(player.name || ""));
  var b = "";
  if (typeof window !== "undefined" && window.__svSquadBadgeForName) {
    b = window.__svSquadBadgeForName(name) || "";
  }
  if (!b && badgesMap && name) {
    if (badgesMap[name]) b = badgesMap[name];
    else if (badgesMap[player.name]) b = badgesMap[player.name];
  }
  if (!b && player.badge) b = player.badge;
  b = String(b || "")
    .trim()
    .toUpperCase();
  if (b === "CAPTAIN" || b === "CAPT") b = "C";
  if (b === "VICE" || b === "VICE CAPTAIN" || b === "VICECAPTAIN") b = "VC";
  if (b === "GOALKEEPER" || b === "GOALIE") b = "GK";
  return b === "C" || b === "VC" || b === "GK" ? b : "";
}

function sortedIndices(starters, clamp) {
  return starters
    .map(function (_, i) {
      return i;
    })
    .filter(function (i) {
      return starters[i];
    })
    .sort(function (a, b) {
      var ya = clamp(starters[a].y);
      var yb = clamp(starters[b].y);
      if (yb !== ya) return yb - ya;
      return clamp(starters[a].x) - clamp(starters[b].x);
    });
}

export function assignRoles(starters, formation, clamp) {
  var roles = FORMATION_ROLES[formation];
  var splits = FORMATION_SPLITS[formation] || [1, 4, 3, 3];
  var indices = sortedIndices(starters, clamp);
  var result = starters.map(function () {
    return "";
  });

  if (roles && formation !== "custom") {
    indices.forEach(function (idx, order) {
      result[idx] = roles[order] || "CM";
    });
    return result;
  }

  var cursor = 0;
  for (var r = 0; r < splits.length && cursor < indices.length; r++) {
    var count = splits[r] || 0;
    var rowPlayers = indices.slice(cursor, cursor + count);
    cursor += count;
    var tmpl = ROW_ROLE_TEMPLATES[r] || ["CM"];
    rowPlayers.sort(function (a, b) {
      return clamp(starters[a].x) - clamp(starters[b].x);
    });
    rowPlayers.forEach(function (idx, j) {
      result[idx] = tmpl[j] || tmpl[tmpl.length - 1] || "CM";
    });
  }
  while (cursor < indices.length) {
    result[indices[cursor]] = "CM";
    cursor++;
  }
  return result;
}

const ROW_ROLE_TEMPLATES = [
  ["GK"],
  ["LB", "CB", "CB", "RB"],
  ["LM", "CM", "CM", "RM"],
  ["LW", "ST", "RW"],
  ["ST"],
];

const GUIDES_MARKUP =
  "<div class='pitch-guides' aria-hidden='true'>" +
  "<div class='pitch-guide' style='left:20%'></div>" +
  "<div class='pitch-guide pitch-guide--center' style='left:50%'></div>" +
  "<div class='pitch-guide' style='left:80%'></div>" +
  "<span class='pitch-zone-label' style='left:10%'>Wing</span>" +
  "<span class='pitch-zone-label' style='left:28%'>Half</span>" +
  "<span class='pitch-zone-label' style='left:50%'>Centre</span>" +
  "<span class='pitch-zone-label' style='left:72%'>Half</span>" +
  "<span class='pitch-zone-label' style='left:90%'>Wing</span>" +
  "</div>" +
  "<div class='pitch-adv-guides' aria-hidden='true'>" +
  "<div class='pitch-adv-line v' style='left:20.35%'></div>" +
  "<div class='pitch-adv-line v seg-between-boxes' style='left:36.55%'></div>" +
  "<div class='pitch-adv-line v seg-between-boxes' style='left:63.45%'></div>" +
  "<div class='pitch-adv-line v' style='left:79.65%'></div>" +
  "<div class='pitch-adv-line h' style='top:50%'></div>" +
  "<div class='pitch-adv-line h' style='top:15.7%; left:0; right:79.65%'></div>" +
  "<div class='pitch-adv-line h' style='top:84.3%; left:0; right:79.65%'></div>" +
  "<div class='pitch-adv-line v seg-top' style='left:50%'></div>" +
  "<div class='pitch-adv-line v seg-bot' style='left:50%'></div>" +
  "<span class='pitch-zone-label pitch-zone-label--adv' style='left:28%;top:8%'>Final third</span>" +
  "<span class='pitch-zone-label pitch-zone-label--adv' style='left:28%;top:42%'>Middle third</span>" +
  "<span class='pitch-zone-label pitch-zone-label--adv' style='left:28%;top:76%'>Defensive third</span>" +
  "</div>";

export function pitchMarkup() {
  return (
    "<div class='pitch-markings' aria-hidden='true'>" +
    "<div class='pitch-halfway'></div>" +
    "<div class='pitch-centre-circle'></div>" +
    "<div class='pitch-centre-spot'></div>" +
    "<div class='pitch-box pitch-box--top-pen'></div>" +
    "<div class='pitch-box pitch-box--bottom-pen'></div>" +
    "<div class='pitch-box pitch-box--top-six'></div>" +
    "<div class='pitch-box pitch-box--bottom-six'></div>" +
    "<div class='pitch-spot pitch-spot--top'></div>" +
    "<div class='pitch-spot pitch-spot--bottom'></div>" +
    "<div class='pitch-arc pitch-arc--top'></div>" +
    "<div class='pitch-arc pitch-arc--bottom'></div>" +
    "<div class='pitch-corner-arc tl'></div>" +
    "<div class='pitch-corner-arc tr'></div>" +
    "<div class='pitch-corner-arc bl'></div>" +
    "<div class='pitch-corner-arc br'></div>" +
    "</div>" +
    "<div class='pitch-lines' aria-hidden='true'>" +
    GUIDES_MARKUP +
    "</div>"
  );
}

export function applySetup(lineup, setupKey, clamp) {
  var formation = String(lineup.formation || "4-3-3").trim() || "4-3-3";
  var starters = (lineup.starters || []).slice(0, 11).map(function (s) {
    return {
      name: (s && s.name) || "",
      number: (s && s.number) || "",
      x: clamp(s && s.x),
      y: clamp(s && s.y),
      role: (s && s.role) || "",
      badge: (s && s.badge) || "",
      badges: s && s.badges,
    };
  });

  var setup = lineup.setups && lineup.setups[setupKey];
  if (setup) {
    if (setup.formation) formation = String(setup.formation);
    if (Array.isArray(setup.starters)) {
      setup.starters.forEach(function (pos, i) {
        if (starters[i] && pos) {
          starters[i].x = clamp(pos.x);
          starters[i].y = clamp(pos.y);
        }
      });
    }
  }

  return {
    formation: formation,
    starters: starters,
    subs: lineup.subs || [],
    badges: lineup.badges || null,
  };
}

export function subName(sub) {
  if (!sub) return "";
  if (typeof sub === "string") return canonicalPlayerName(displayPlayerName(sub));
  return canonicalPlayerName(displayPlayerName(sub.name || ""));
}

var DISPLAY_GK_Y = 0.8;
var DISPLAY_TOP_Y = 0.13;
var DISPLAY_BOTTOM_Y = 0.8;

function spreadDataY(starters, playerIdx, gkIdx, clamp) {
  var ys = [];
  starters.forEach(function (p, i) {
    if (i !== gkIdx) ys.push(clamp(p.y));
  });
  if (!ys.length) return 0.5;
  var minY = Math.min.apply(null, ys);
  var maxY = Math.max.apply(null, ys);
  var y = clamp(starters[playerIdx].y);
  var t = maxY > minY ? (y - minY) / (maxY - minY) : 0.5;
  return DISPLAY_BOTTOM_Y - 0.12 - t * (DISPLAY_BOTTOM_Y - 0.12 - DISPLAY_TOP_Y);
}

/** Even row spacing for public pitch (does not mutate stored coords). */
export function displayRowY(starters, formation, playerIdx, gkIdx, clamp) {
  if (playerIdx === gkIdx) return DISPLAY_GK_Y;

  var splits = FORMATION_SPLITS[formation];
  if (!splits || formation === "custom") {
    return spreadDataY(starters, playerIdx, gkIdx, clamp);
  }

  var indices = sortedIndices(starters, clamp);
  var order = indices.indexOf(playerIdx);
  if (order < 0) order = playerIdx;

  var row = 0;
  var cursor = 0;
  for (var r = 0; r < splits.length; r++) {
    if (order < cursor + splits[r]) {
      row = r;
      break;
    }
    cursor += splits[r];
  }

  var numRows = splits.length;
  if (row === 0) return DISPLAY_GK_Y;
  var steps = numRows - 1;
  var rowFromTop = numRows - 1 - row;
  return DISPLAY_TOP_Y + (rowFromTop / steps) * (DISPLAY_BOTTOM_Y - DISPLAY_TOP_Y);
}

export function findGkIndex(starters, clamp) {
  var gkIdx = 0;
  var maxY = -1;
  starters.forEach(function (p, i) {
    var y = clamp(p.y);
    if (y > maxY) {
      maxY = y;
      gkIdx = i;
    }
  });
  return gkIdx;
}

/** Unified lineup view model for public tab + export. */
export function prepareLineupDisplay(lineup, setupKey, clamp) {
  var applied = applySetup(lineup, setupKey, clamp);
  var formation = applied.formation;
  var starters = applied.starters;
  var roles = assignRoles(starters, formation, clamp);
  var gkIdx = findGkIndex(starters, clamp);
  var setupLabel = setupKey === "att" ? "Attacking" : "Defensive";
  var formLabel = formation === "custom" ? "Custom" : formation;
  var badgesMap = applied.badges;

  var units = starters.map(function (p, i) {
    var role = (p.role && String(p.role).trim()) || roles[i] || "";
    var badge = resolvePlayerBadge(p, badgesMap);
    return {
      index: i,
      name: p.name,
      number: p.number,
      role: role,
      badge: badge,
      label: lineupLabel(p.name, p.number),
      leftPct: clamp(p.x) * 100,
      topPct: clamp(p.y) * 100,
      ringText: role || String(p.number || "").trim() || "—",
      isGk: role === "GK" || i === gkIdx || badge === "GK",
    };
  });

  var subList = (applied.subs || []).map(subName).filter(Boolean);

  return {
    setupLabel: setupLabel,
    formLabel: formLabel,
    formation: formation,
    starters: starters,
    units: units,
    subs: subList,
  };
}

export function subsMarkup(subList, esc) {
  if (!subList.length) return "";
  return (
    "<div class='lineup-fotmob-subs'>" +
    "<div class='lineup-fotmob-subs-title'>Substitutes</div>" +
    "<div class='lineup-fotmob-subs-list'>" +
    subList
      .map(function (name) {
        return "<span class='lineup-fotmob-sub-chip'>" + esc(name) + "</span>";
      })
      .join("") +
    "</div></div>"
  );
}

export function chipsMarkup(units, esc) {
  return units
    .map(function (u) {
      var gkClass = u.isGk ? " is-gk" : "";
      var badgeHtml = u.badge
        ? "<span class='fotmob-unit__badge fotmob-unit__badge--" +
          esc(u.badge.toLowerCase()) +
          "'>" +
          esc(u.badge) +
          "</span>"
        : "";
      return (
        "<div class='player-chip player-chip--fotmob-unit" +
        gkClass +
        "' style='left:" +
        u.leftPct.toFixed(2) +
        "%;top:" +
        u.topPct.toFixed(2) +
        "%' data-idx='" +
        u.index +
        "'>" +
        badgeHtml +
        "<span class='fotmob-unit__ring'>" +
        esc(u.ringText) +
        "</span>" +
        "<span class='fotmob-unit__name'>" +
        esc(u.label) +
        "</span></div>"
      );
    })
    .join("");
}

/** Sync pitch overlay visibility (guides / advanced) on the public FotMob pitch. */
export function syncPitchOverlay(wrap) {
  if (!wrap) return;
  var pitch = wrap.querySelector(".lineup-pitch-fotmob");
  if (!pitch) return;
  var guidesOn = document.body.classList.contains("pitch-guides-on");
  var advOn = document.body.classList.contains("pitch-adv-guides-on");
  pitch.classList.toggle("pitch-overlay-guides", guidesOn && !advOn);
  pitch.classList.toggle("pitch-overlay-adv", advOn);
}

/**
 * @param {object} ctx - deps from app.min.js Bo()
 * @param {number|string} teamId
 */
export function renderLineupTab(ctx, teamId) {
  var wrap = ctx.lineupPublicWrap;
  if (!wrap) return;

  var esc = ctx.escapeHtml || escapeHtml;
  var clamp = ctx.clamp01 || clamp01;
  var setupKey = ctx.lineupPublicSetup === "att" ? "att" : "def";

  var team = ctx.getTeam(teamId);
  var round = ctx.getPublicRoundLabel(team);
  var entry = ctx.matchEntryForRound(team, round);
  var lineup = entry && entry.lineup;

  if (!lineup || !lineup.starters || !lineup.starters.length) {
    wrap.innerHTML = "<p class='hint' style='margin:0'>No lineup yet for this round.</p>";
    return;
  }

  var view = prepareLineupDisplay(lineup, setupKey, clamp);

  wrap.innerHTML =
    "<div class='lineup-fotmob'>" +
    "<div class='lineup-fotmob-header'>" +
    "<div class='lineup-fotmob-setup'>" +
    esc(view.setupLabel) +
    "</div>" +
    "<div class='lineup-fotmob-formation'>" +
    esc(view.formLabel) +
    "</div>" +
    "</div>" +
    "<div id='lineupWeatherMount' class='lineup-weather-mount' aria-live='polite'></div>" +
    "<div class='pitch pitch--public lineup-pitch-fotmob' aria-label='Starting lineup'>" +
    pitchMarkup() +
    chipsMarkup(view.units, esc) +
    "</div>" +
    subsMarkup(view.subs, esc) +
    "</div>";

  syncPitchOverlay(wrap);

  var weatherMount = document.getElementById("lineupWeatherMount");
  if (weatherMount && entry) {
    weatherMount.innerHTML = "<p class='hint' style='margin:0'>Loading weather…</p>";
    fetchMatchWeather({
      suburb: entry.suburb,
      groundName: entry.groundName || entry.venue,
      kickoff: entry.kickoff,
      date: entry.date,
      venue: entry.venue,
      lat: entry.lat,
      lng: entry.lng,
      locationLabel: entry.locationLabel,
    })
      .then(function (data) {
        if (!weatherMount.parentNode) return;
        weatherMount.innerHTML = weatherPanelHtml(data, getWeatherUnits());
        wireWeatherUnitsToggle(weatherMount, function () {
          try {
            renderLineupTab(ctx, teamId);
          } catch {}
        });
      })
      .catch(function () {
        if (weatherMount.parentNode) {
          weatherMount.innerHTML =
            "<div class='lineup-weather lineup-weather--empty'><p class='hint' style='margin:0'>Weather unavailable.</p></div>";
        }
      });
  }

  try {
    window.dispatchEvent(new CustomEvent("sv-lineup-rendered"));
  } catch {}
}
