/**
 * Squadi public API client + mapping to app matchesByRound schema.
 * API docs: undocumented public endpoints used by registration.squadi.com (Football West).
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __squadiDir = dirname(fileURLToPath(import.meta.url));
const { formatGoalScorerList } = await import(
  pathToFileURL(join(__squadiDir, "../public/dist/name-match.js")).href
);

export const SQUADI_LIVE_BASE = "https://api.squadi.com/livescores";

/** Football West default organisation key */
export const FOOTBALL_WEST_ORG = "27a1f3ab-90c1-4412-853f-d85c9b27967c";

export function parseSquadiFixtureUrl(url) {
  try {
    var u = new URL(String(url || "").trim());
    if (!/squadi\.com/i.test(u.hostname)) return null;
    var teamIdRaw = u.searchParams.get("teamId") || u.searchParams.get("teamRefId") || "";
    var teamId = teamIdRaw ? parseInt(teamIdRaw, 10) : 0;
    return {
      organisationKey: u.searchParams.get("organisationKey") || u.searchParams.get("organisationUniqueKey") || "",
      yearId: parseInt(u.searchParams.get("yearId") || u.searchParams.get("yearRefId") || "0", 10) || 0,
      competitionUniqueKey: u.searchParams.get("competitionUniqueKey") || "",
      divisionId: u.searchParams.get("divisionId") || "All",
      teamId: isFinite(teamId) && teamId > 0 ? teamId : null,
    };
  } catch {
    return null;
  }
}

export function normalizeSquadiConfig(raw) {
  var c = raw || {};
  var fromUrl = c.fixtureUrl ? parseSquadiFixtureUrl(c.fixtureUrl) : null;
  var teamIdRaw = c.teamId != null && c.teamId !== "" ? c.teamId : c.squadiTeamId;
  if ((teamIdRaw == null || teamIdRaw === "") && fromUrl && fromUrl.teamId) teamIdRaw = fromUrl.teamId;
  var teamId = teamIdRaw != null && teamIdRaw !== "" ? parseInt(teamIdRaw, 10) : null;
  return {
    organisationKey: c.organisationKey || (fromUrl && fromUrl.organisationKey) || FOOTBALL_WEST_ORG,
    yearId: Number(c.yearId || (fromUrl && fromUrl.yearId) || 0),
    competitionUniqueKey: c.competitionUniqueKey || (fromUrl && fromUrl.competitionUniqueKey) || "",
    divisionId: c.divisionId != null && c.divisionId !== "" ? c.divisionId : fromUrl ? fromUrl.divisionId : "All",
    teamId: isFinite(teamId) && teamId > 0 ? teamId : null,
    teamNameFilter: String(c.teamNameFilter || c.squadiTeamName || "Wembley Downs").trim(),
    minRound: c.minRound != null && c.minRound !== "" ? Number(c.minRound) : 8,
    fixtureUrl: c.fixtureUrl || "",
  };
}

function cleanTeamName(name) {
  return String(name || "")
    .replace(/\s+-\s+WLN\s+D\d+\s*$/i, "")
    .replace(/\s+-\s+Reserves\s*$/i, "")
    .replace(/\s+SC\s*$/i, " SC")
    .trim();
}

function teamMatchesFilter(name, filter) {
  var n = String(name || "").toLowerCase();
  var f = String(filter || "").toLowerCase();
  return f && n.indexOf(f) >= 0;
}

function matchIncludesTeamId(match, teamId) {
  if (!teamId) return false;
  return match.team1Id === teamId || match.team2Id === teamId;
}

function ourTeamSide(match, cfg) {
  if (cfg.teamId && matchIncludesTeamId(match, cfg.teamId)) {
    return match.team1Id === cfg.teamId ? "team1" : "team2";
  }
  var t1 = match.team1 && match.team1.name;
  var t2 = match.team2 && match.team2.name;
  if (teamMatchesFilter(t1, cfg.teamNameFilter)) return "team1";
  if (teamMatchesFilter(t2, cfg.teamNameFilter)) return "team2";
  return null;
}

function ourTeamId(match, cfg, side) {
  if (side === "team1") return match.team1Id;
  if (side === "team2") return match.team2Id;
  return cfg.teamId || null;
}

/** UTC ISO → Perth wall YYYY-MM-DDTHH:mm (matches app kickoff storage). */
export function utcToPerthKickoff(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  var parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  function g(t) {
    var p = parts.find(function (x) {
      return x.type === t;
    });
    return p ? p.value : "";
  }
  return g("year") + "-" + g("month") + "-" + g("day") + "T" + g("hour") + ":" + g("minute");
}

export function perthDateFromKickoff(kickoff) {
  return kickoff ? kickoff.slice(0, 10) : "";
}

function isValidCoord(lat, lng) {
  var la = Number(lat);
  var ln = Number(lng);
  return (
    isFinite(la) &&
    isFinite(ln) &&
    Math.abs(la) <= 90 &&
    Math.abs(ln) <= 180 &&
    !(la === 0 && ln === 0)
  );
}

function squadiVenueCoords(vc, venue) {
  vc = vc || {};
  venue = venue || {};
  var latRaw = vc.lat != null && vc.lat !== "" ? vc.lat : venue.lat;
  var lngRaw = vc.lng != null && vc.lng !== "" ? vc.lng : venue.lng;
  if (latRaw == null || latRaw === "" || lngRaw == null || lngRaw === "") return { lat: null, lng: null };
  var lat = parseFloat(latRaw);
  var lng = parseFloat(lngRaw);
  return isValidCoord(lat, lng) ? { lat: lat, lng: lng } : { lat: null, lng: null };
}

function hasUserLocationPin(match) {
  if (!match) return false;
  if (match.locationLabel && String(match.locationLabel).trim()) return true;
  return isValidCoord(match.lat, match.lng);
}

export async function fetchRoundMatches(cfg, fetchImpl) {
  var c = normalizeSquadiConfig(cfg);
  if (!c.competitionUniqueKey || !c.yearId) {
    throw new Error("squadi config needs competitionUniqueKey and yearId (paste fixture URL or fill fields)");
  }
  var qs = new URLSearchParams({
    organisationUniqueKey: c.organisationKey,
    yearRefId: String(c.yearId),
    competitionUniqueKey: c.competitionUniqueKey,
    divisionId: String(c.divisionId),
  });
  var fn = fetchImpl || fetch;
  var res = await fn(SQUADI_LIVE_BASE + "/round/matches?" + qs.toString(), {
    headers: { Accept: "application/json", "User-Agent": "WDSquadiSync/1.0" },
  });
  if (!res.ok) throw new Error("Squadi round/matches HTTP " + res.status);
  return res.json();
}

export async function fetchMatchEvents(matchId, fetchImpl) {
  var fn = fetchImpl || fetch;
  var res = await fn(
    SQUADI_LIVE_BASE + "/matches/public/matchEvents?matchId=" + encodeURIComponent(String(matchId)),
    { headers: { Accept: "application/json", "User-Agent": "WDSquadiSync/1.0" } }
  );
  if (!res.ok) return [];
  var data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function extractGoalScorers(events, wembleyTeamId) {
  var out = [];
  (events || []).forEach(function (ev) {
    if (ev.type !== "G" && ev.publicDisplayName !== "Goal") return;
    if (wembleyTeamId && ev.teamId !== wembleyTeamId) return;
    var name = [ev.firstName, ev.lastName].filter(Boolean).join(" ").trim();
    if (name) out.push(name);
  });
  return out;
}

export function mapSquadiMatchToApp(match, roundName, cfg, scorers) {
  var c = typeof cfg === "string" ? { teamNameFilter: cfg } : normalizeSquadiConfig(cfg || {});
  var side = ourTeamSide(match, c);
  if (!side) return null;

  var t1 = match.team1 || {};
  var t2 = match.team2 || {};
  var wembleyIsTeam1 = side === "team1";

  var opponent = wembleyIsTeam1 ? cleanTeamName(t2.name) : cleanTeamName(t1.name);
  if (!opponent || /^bye$/i.test(opponent)) return null;

  var ourScore = wembleyIsTeam1 ? match.team1Score : match.team2Score;
  var oppScore = wembleyIsTeam1 ? match.team2Score : match.team1Score;
  var kickoff = utcToPerthKickoff(match.startTime);
  var vc = match.venueCourt || {};
  var venue = vc.venue || {};
  var groundName = venue.name || venue.shortName || "";
  var pitch = vc.name || (vc.courtNumber != null ? "Field " + vc.courtNumber : "");
  var suburb = venue.suburb || venue.city || "";
  var coords = squadiVenueCoords(vc, venue);

  return {
    round: normalizeRoundLabel(roundName),
    squadiMatchId: match.id,
    opponent: opponent,
    date: perthDateFromKickoff(kickoff),
    kickoff: kickoff,
    suburb: suburb,
    groundName: groundName,
    pitchNumber: pitch.replace(/^Field\s+/i, "") || "",
    venue: groundName && pitch ? groundName + "-" + pitch : groundName || pitch,
    lat: coords.lat,
    lng: coords.lng,
    ourScore: ourScore != null ? ourScore : null,
    oppScore: oppScore != null ? oppScore : null,
    scorers: scorers || [],
    squadiSyncedAt: new Date().toISOString(),
  };
}

function normalizeRoundLabel(c) {
  var l = String(c ?? "").trim();
  if (!l) return "Round 1";
  var h = l.match(/^round\s*(\d+(?:\.\d+)?)$/i);
  if (h) return "Round " + h[1];
  return l.replace(/\s+/g, " ").trim();
}

/** Parse "Round 9" → 9; null if not a numbered round (e.g. "Semi Final"). */
export function parseRoundNumber(roundName) {
  var l = String(roundName || "").trim();
  var m = l.match(/^round\s*(\d+(?:\.\d+)?)$/i);
  if (m) return parseFloat(m[1]);
  m = l.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[1]);
  return null;
}

export function isCompetitiveRound(roundName, minRound) {
  var n = parseRoundNumber(roundName);
  if (n == null) return true;
  return n >= minRound;
}

export async function fetchWembleyFixtures(cfg, opts) {
  var c = normalizeSquadiConfig(cfg);
  var fetchImpl = opts && opts.fetch;
  var includeScorers = !(opts && opts.skipScorers);
  var minRound = c.minRound != null && !isNaN(c.minRound) ? c.minRound : 8;
  var data = await fetchRoundMatches(c, fetchImpl);
  var results = [];
  var skippedGradingRounds = 0;

  for (var ri = 0; ri < (data.rounds || []).length; ri++) {
    var round = data.rounds[ri];
    var isGrading = !isCompetitiveRound(round.name, minRound);
    var hadOurMatch = false;

    for (var mi = 0; mi < (round.matches || []).length; mi++) {
      var m = round.matches[mi];
      var side = ourTeamSide(m, c);
      if (!side) continue;

      hadOurMatch = true;
      if (isGrading) continue;

      var wembleyTeamId = ourTeamId(m, c, side);

      var scorers = [];
      if (includeScorers && m.resultStatus === "FINAL" && m.id) {
        try {
          var events = await fetchMatchEvents(m.id, fetchImpl);
          scorers = extractGoalScorers(events, wembleyTeamId);
          var squad = (opts && opts.squad) || [];
          if (scorers.length && squad.length) scorers = formatGoalScorerList(scorers, squad);
        } catch (e) {
          /* non-fatal */
        }
      }

      var mapped = mapSquadiMatchToApp(m, round.name, c, scorers);
      if (mapped) results.push(mapped);
    }

    if (isGrading && hadOurMatch) skippedGradingRounds++;
  }

  return { fixtures: results, skippedGradingRounds: skippedGradingRounds, minRound: minRound };
}

/** Merge Squadi fixtures into matchesByRound; preserve lineup/review/manual fields. */
export function mergeFixturesIntoMatchesByRound(existing, fixtures) {
  var out = Object.assign({}, existing || {});
  (fixtures || []).forEach(function (fx) {
    var key = fx.round;
    if (!key) return;
    var prev = out[key] || {};
    var userPin = hasUserLocationPin(prev);
    var squadiCoords = isValidCoord(fx.lat, fx.lng);
    var next = Object.assign({}, prev, {
      opponent: fx.opponent,
      date: fx.date || prev.date,
      kickoff: fx.kickoff || prev.kickoff,
      ourScore: fx.ourScore != null ? fx.ourScore : prev.ourScore,
      oppScore: fx.oppScore != null ? fx.oppScore : prev.oppScore,
      scorers: prev.goalscorersManual
        ? prev.scorers
        : fx.scorers && fx.scorers.length
          ? fx.scorers
          : prev.scorers,
      squadiMatchId: fx.squadiMatchId,
      squadiSyncedAt: fx.squadiSyncedAt,
    });
    if (userPin) {
      /* keep suburb/ground/venue/lat/lng/locationLabel from prev */
    } else if (squadiCoords) {
      next.suburb = fx.suburb || prev.suburb;
      next.groundName = fx.groundName || prev.groundName;
      next.pitchNumber = fx.pitchNumber || prev.pitchNumber;
      next.venue = fx.venue || prev.venue;
      next.lat = fx.lat;
      next.lng = fx.lng;
    } else {
      next.suburb = prev.suburb || fx.suburb || "";
      next.groundName = prev.groundName || fx.groundName || "";
      next.pitchNumber = prev.pitchNumber || fx.pitchNumber || "";
      next.venue = prev.venue || fx.venue || "";
      next.lat = isValidCoord(prev.lat, prev.lng) ? prev.lat : null;
      next.lng = isValidCoord(prev.lat, prev.lng) ? prev.lng : null;
    }
    out[key] = next;
  });
  return out;
}
