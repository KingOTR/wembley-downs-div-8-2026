/**
 * FotMob-style public lineup view (single team, dark pitch, circular nodes).
 * Loaded by app.min.js via chunk-HQEVIJDY.js.
 */
import { displayPlayerName, canonicalPlayerName } from "./name-match.js?tag=v133";

const FORMATION_ROLES = {
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LWB", "CM", "CM", "CM", "RWB", "ST", "ST"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LM", "CAM", "RM", "ST"],
};

const FORMATION_SPLITS = {
  "4-3-3": [1, 4, 3, 3],
  "4-4-2": [1, 4, 4, 2],
  "3-5-2": [1, 3, 5, 2],
  "4-2-3-1": [1, 4, 2, 3, 1],
};

const ROW_ROLE_TEMPLATES = [
  ["GK"],
  ["LB", "CB", "CB", "RB"],
  ["LM", "CM", "CM", "RM"],
  ["LW", "ST", "RW"],
  ["ST"],
];

function clamp01(v) {
  var n = Number(v);
  if (!isFinite(n)) return 0.5;
  return Math.max(0.05, Math.min(0.95, n));
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Number + surname (trimmed, no double spaces). */
function lineupLabel(name, number) {
  var clean = canonicalPlayerName(displayPlayerName(name));
  var parts = clean.split(/\s+/).filter(Boolean);
  var surname = parts.length > 1 ? parts[parts.length - 1] : clean;
  var num = String(number || "").trim();
  return num ? num + " " + surname : surname;
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

function assignRoles(starters, formation, clamp) {
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

function pitchMarkup() {
  return (
    "<div class='pitch-lines' aria-hidden='true'>" +
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
    "</div>"
  );
}

function applySetup(lineup, setupKey, clamp) {
  var formation = String(lineup.formation || "4-3-3").trim() || "4-3-3";
  var starters = (lineup.starters || []).slice(0, 11).map(function (s) {
    return {
      name: (s && s.name) || "",
      number: (s && s.number) || "",
      x: clamp(s && s.x),
      y: clamp(s && s.y),
      role: (s && s.role) || "",
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
  };
}

function subName(sub) {
  if (!sub) return "";
  if (typeof sub === "string") return canonicalPlayerName(displayPlayerName(sub));
  return canonicalPlayerName(displayPlayerName(sub.name || ""));
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

  var applied = applySetup(lineup, setupKey, clamp);
  var formation = applied.formation;
  var starters = applied.starters;
  var roles = assignRoles(starters, formation, clamp);
  var setupLabel = setupKey === "att" ? "Attacking" : "Defensive";
  var formLabel = formation === "custom" ? "Custom" : formation;

  var gkIdx = 0;
  var maxY = -1;
  starters.forEach(function (p, i) {
    var y = clamp(p.y);
    if (y > maxY) {
      maxY = y;
      gkIdx = i;
    }
  });

  var chips = "";
  starters.forEach(function (p, i) {
    var role = (p.role && String(p.role).trim()) || roles[i] || "";
    var num = String(p.number || "").trim();
    var inner = num ? esc(num) : esc(role || "—");
    var isGk = role === "GK" || i === gkIdx;
    var cls = "player-chip player-chip--public-circle" + (isGk ? " is-gk" : "");
    var left = (clamp(p.x) * 100).toFixed(2);
    var top = (clamp(p.y) * 100).toFixed(2);
    chips +=
      "<div class='" +
      cls +
      "' style='left:" +
      left +
      "%;top:" +
      top +
      "%' data-idx='" +
      i +
      "'>" +
      "<span class='pos'>" +
      inner +
      "</span>" +
      "<span class='nm'>" +
      esc(lineupLabel(p.name, p.number)) +
      "</span>" +
      "</div>";
  });

  var subsHtml = "";
  var subList = (applied.subs || []).map(subName).filter(Boolean);
  if (subList.length) {
    subsHtml =
      "<div class='lineup-fotmob-subs'>" +
      "<div class='lineup-fotmob-subs-title'>Substitutes</div>" +
      "<div class='lineup-fotmob-subs-list'>" +
      subList
        .map(function (name) {
          return "<span class='lineup-fotmob-sub'>" + esc(name) + "</span>";
        })
        .join("") +
      "</div></div>";
  }

  wrap.innerHTML =
    "<div class='lineup-fotmob'>" +
    "<div class='lineup-fotmob-header'>" +
    "<div class='lineup-fotmob-setup'>" +
    esc(setupLabel) +
    "</div>" +
    "<div class='lineup-fotmob-formation'>" +
    esc(formLabel) +
    "</div>" +
    "</div>" +
    "<div class='pitch pitch--public lineup-pitch-fotmob' aria-label='Starting lineup'>" +
    pitchMarkup() +
    chips +
    "</div>" +
    subsHtml +
    "</div>";
}
