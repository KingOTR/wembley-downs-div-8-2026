/**
 * Squadi public API client + mapping to app matchesByRound schema.
 * API docs: undocumented public endpoints used by registration.squadi.com (Football West).
 */

export const SQUADI_LIVE_BASE = "https://api.squadi.com/livescores";

/** Football West default organisation key */
export const FOOTBALL_WEST_ORG = "27a1f3ab-90c1-4412-853f-d85c9b27967c";

export function parseSquadiFixtureUrl(url) {
  try {
    var u = new URL(String(url || "").trim());
    if (!/squadi\.com/i.test(u.hostname)) return null;
    return {
      organisationKey: u.searchParams.get("organisationKey") || u.searchParams.get("organisationUniqueKey") || "",
      yearId: parseInt(u.searchParams.get("yearId") || u.searchParams.get("yearRefId") || "0", 10) || 0,
      competitionUniqueKey: u.searchParams.get("competitionUniqueKey") || "",
      divisionId: u.searchParams.get("divisionId") || "All",
    };
  } catch {
    return null;
  }
}

export function normalizeSquadiConfig(raw) {
  var c = raw || {};
  var fromUrl = c.fixtureUrl ? parseSquadiFixtureUrl(c.fixtureUrl) : null;
  return {
    organisationKey: c.organisationKey || (fromUrl && fromUrl.organisationKey) || FOOTBALL_WEST_ORG,
    yearId: Number(c.yearId || (fromUrl && fromUrl.yearId) || 0),
    competitionUniqueKey: c.competitionUniqueKey || (fromUrl && fromUrl.competitionUniqueKey) || "",
    divisionId: c.divisionId != null && c.divisionId !== "" ? c.divisionId : fromUrl ? fromUrl.divisionId : "All",
    teamNameFilter: String(c.teamNameFilter || c.squadiTeamName || "Wembley Downs").trim(),
    fixtureUrl: c.fixtureUrl || "",
  };
}

function cleanTeamName(name) {
  return String(name || "")
    .replace(/\s+-\s+Reserves\s*$/i, "")
    .replace(/\s+SC\s*$/i, " SC")
    .trim();
}

function teamMatchesFilter(name, filter) {
  var n = String(name || "").toLowerCase();
  var f = String(filter || "").toLowerCase();
  return f && n.indexOf(f) >= 0;
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

export function mapSquadiMatchToApp(match, roundName, teamFilter, scorers) {
  var t1 = match.team1 || {};
  var t2 = match.team2 || {};
  var wembleyIsTeam1 = teamMatchesFilter(t1.name, teamFilter);
  var wembleyIsTeam2 = teamMatchesFilter(t2.name, teamFilter);
  if (!wembleyIsTeam1 && !wembleyIsTeam2) return null;

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
    lat: vc.lat != null && vc.lat !== "" ? parseFloat(vc.lat) : null,
    lng: vc.lng != null && vc.lng !== "" ? parseFloat(vc.lng) : null,
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

export async function fetchWembleyFixtures(cfg, opts) {
  var c = normalizeSquadiConfig(cfg);
  var fetchImpl = opts && opts.fetch;
  var includeScorers = !(opts && opts.skipScorers);
  var data = await fetchRoundMatches(c, fetchImpl);
  var results = [];

  for (var ri = 0; ri < (data.rounds || []).length; ri++) {
    var round = data.rounds[ri];
    for (var mi = 0; mi < (round.matches || []).length; mi++) {
      var m = round.matches[mi];
      var t1 = m.team1 && m.team1.name;
      var t2 = m.team2 && m.team2.name;
      if (!teamMatchesFilter(t1, c.teamNameFilter) && !teamMatchesFilter(t2, c.teamNameFilter)) continue;

      var wembleyTeamId =
        teamMatchesFilter(t1, c.teamNameFilter) ? m.team1Id : teamMatchesFilter(t2, c.teamNameFilter) ? m.team2Id : null;

      var scorers = [];
      if (includeScorers && m.resultStatus === "FINAL" && m.id) {
        try {
          var events = await fetchMatchEvents(m.id, fetchImpl);
          scorers = extractGoalScorers(events, wembleyTeamId);
        } catch (e) {
          /* non-fatal */
        }
      }

      var mapped = mapSquadiMatchToApp(m, round.name, c.teamNameFilter, scorers);
      if (mapped) results.push(mapped);
    }
  }

  return results;
}

/** Merge Squadi fixtures into matchesByRound; preserve lineup/review/manual fields. */
export function mergeFixturesIntoMatchesByRound(existing, fixtures) {
  var out = Object.assign({}, existing || {});
  (fixtures || []).forEach(function (fx) {
    var key = fx.round;
    if (!key) return;
    var prev = out[key] || {};
    out[key] = Object.assign({}, prev, {
      opponent: fx.opponent,
      date: fx.date || prev.date,
      kickoff: fx.kickoff || prev.kickoff,
      suburb: fx.suburb || prev.suburb,
      groundName: fx.groundName || prev.groundName,
      pitchNumber: fx.pitchNumber || prev.pitchNumber,
      venue: fx.venue || prev.venue,
      lat: fx.lat != null ? fx.lat : prev.lat,
      lng: fx.lng != null ? fx.lng : prev.lng,
      ourScore: fx.ourScore != null ? fx.ourScore : prev.ourScore,
      oppScore: fx.oppScore != null ? fx.oppScore : prev.oppScore,
      scorers: fx.scorers && fx.scorers.length ? fx.scorers : prev.scorers,
      squadiMatchId: fx.squadiMatchId,
      squadiSyncedAt: fx.squadiSyncedAt,
    });
  });
  return out;
}
