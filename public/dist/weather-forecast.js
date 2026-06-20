/**
 * Match weather via Open-Meteo (free, no API key).
 * Geocoding: https://open-meteo.com/en/docs/geocoding-api
 * Forecast: https://open-meteo.com/en/docs
 */

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const MATCH_MINUTES = 90;
const GEO_CACHE = Object.create(null);
const FORECAST_CACHE = Object.create(null);

function cacheKey(parts) {
  return parts.filter(Boolean).join("|").toLowerCase();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wmoLabel(code) {
  var c = Number(code);
  if (c === 0) return "Clear";
  if (c <= 3) return "Partly cloudy";
  if (c <= 48) return "Fog";
  if (c <= 57) return "Drizzle";
  if (c <= 67) return "Rain";
  if (c <= 77) return "Snow";
  if (c <= 82) return "Showers";
  if (c <= 86) return "Snow showers";
  if (c <= 99) return "Thunderstorm";
  return "Mixed";
}

function formatKickoffLocal(iso) {
  if (!iso) return "";
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function parseKickoff(iso, dateFallback) {
  if (iso) {
    var d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  if (dateFallback) {
    var d2 = new Date(dateFallback + "T10:00:00");
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

async function geocode(suburb, groundName) {
  var candidates = [];
  if (groundName && suburb) {
    candidates.push([groundName, suburb, "Western Australia, Australia"].join(", "));
    candidates.push([groundName, suburb, "Australia"].join(", "));
  }
  if (groundName) {
    candidates.push([groundName, "Perth, Western Australia, Australia"].join(", "));
    candidates.push([groundName, "Western Australia, Australia"].join(", "));
  }
  if (suburb) {
    candidates.push([suburb, "Western Australia, Australia"].join(", "));
    candidates.push([suburb, "Australia"].join(", "));
  }
  var seen = Object.create(null);
  var queries = candidates.filter(function (q) {
    q = String(q || "").trim();
    if (!q || seen[q]) return false;
    seen[q] = true;
    return true;
  });

  for (var i = 0; i < queries.length; i++) {
    var q = queries[i];
    var key = cacheKey(["geo", q]);
    if (GEO_CACHE[key]) return GEO_CACHE[key];

    var url =
      GEO_URL +
      "?name=" +
      encodeURIComponent(q) +
      "&count=3&language=en&format=json";
    try {
      var res = await fetch(url);
      if (!res.ok) continue;
      var data = await res.json();
      var hit = data.results && data.results[0];
      if (hit && hit.latitude != null && hit.longitude != null) {
        var out = { lat: hit.latitude, lon: hit.longitude, label: hit.name || q };
        GEO_CACHE[key] = out;
        return out;
      }
    } catch (e) {
      console.warn("[weather] geocode failed", q, e);
    }
  }
  return null;
}

/**
 * @param {{ suburb?: string, groundName?: string, kickoff?: string, date?: string, venue?: string }} match
 */
export async function fetchMatchWeather(match) {
  var suburb = String((match && match.suburb) || "").trim();
  var groundName = String((match && match.groundName) || "").trim();
  var venue = String((match && match.venue) || "").trim();
  if (!groundName && venue) groundName = venue;

  var kickoff = parseKickoff(match && match.kickoff, match && match.date);
  if (!kickoff) {
    return { ok: false, reason: "no_kickoff", message: "Set kickoff time in Coach / admin to see match weather." };
  }
  if (!suburb && !groundName) {
    return { ok: false, reason: "no_location", message: "Set suburb or ground in Coach / admin for weather." };
  }

  var geo = await geocode(suburb, groundName);
  if (!geo) {
    return { ok: false, reason: "geocode_failed", message: "Could not locate " + (groundName && suburb ? groundName + ", " + suburb : groundName || suburb || "venue") + "." };
  }

  var start = new Date(kickoff.getTime());
  start.setMinutes(start.getMinutes() - 30);
  var end = new Date(kickoff.getTime() + MATCH_MINUTES * 60 * 1000);

  var fKey = cacheKey([
    "fc",
    geo.lat,
    geo.lon,
    start.toISOString().slice(0, 13),
    end.toISOString().slice(0, 13),
  ]);
  if (FORECAST_CACHE[fKey]) return FORECAST_CACHE[fKey];

  var url =
    FORECAST_URL +
    "?latitude=" +
    encodeURIComponent(geo.lat) +
    "&longitude=" +
    encodeURIComponent(geo.lon) +
    "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m" +
    "&timezone=auto" +
    "&start_hour=" +
    encodeURIComponent(start.toISOString().slice(0, 13) + ":00") +
    "&end_hour=" +
    encodeURIComponent(end.toISOString().slice(0, 13) + ":00");

  try {
    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    var hourly = data.hourly || {};
    var times = hourly.time || [];
    var kickMs = kickoff.getTime();
    var endMs = kickoff.getTime() + MATCH_MINUTES * 60 * 1000;
    var slots = [];

    for (var i = 0; i < times.length; i++) {
      var t = new Date(times[i]).getTime();
      if (t >= kickMs - 15 * 60 * 1000 && t <= endMs) {
        slots.push({
          time: times[i],
          temp: hourly.temperature_2m ? hourly.temperature_2m[i] : null,
          rain: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null,
          wind: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
          code: hourly.weather_code ? hourly.weather_code[i] : null,
        });
      }
    }

    if (!slots.length) {
      return { ok: false, reason: "no_forecast", message: "Forecast not available for this kickoff window." };
    }

    var temps = slots.map(function (s) {
      return s.temp;
    }).filter(function (v) {
      return v != null;
    });
    var rains = slots.map(function (s) {
      return s.rain;
    }).filter(function (v) {
      return v != null;
    });
    var winds = slots.map(function (s) {
      return s.wind;
    }).filter(function (v) {
      return v != null;
    });
    var maxRain = rains.length ? Math.max.apply(null, rains) : null;
    var mid = slots[Math.floor(slots.length / 2)] || slots[0];

    var out = {
      ok: true,
      location: geo.label,
      kickoffLabel: formatKickoffLocal(match.kickoff || kickoff.toISOString()),
      summary: {
        tempMin: temps.length ? Math.min.apply(null, temps) : null,
        tempMax: temps.length ? Math.max.apply(null, temps) : null,
        rainMax: maxRain,
        windMax: winds.length ? Math.max.apply(null, winds) : null,
        condition: wmoLabel(mid.code),
      },
      slots: slots,
    };
    FORECAST_CACHE[fKey] = out;
    return out;
  } catch (e) {
    console.warn("[weather] forecast failed", e);
    return { ok: false, reason: "forecast_error", message: "Weather lookup failed. Try again later." };
  }
}

export function weatherPanelHtml(data) {
  if (!data || !data.ok) {
    return (
      "<div class='lineup-weather lineup-weather--empty'>" +
      "<div class='lineup-weather-title'>Match weather</div>" +
      "<p class='hint' style='margin:0'>" +
      escapeHtml((data && data.message) || "Weather unavailable.") +
      "</p></div>"
    );
  }

  var s = data.summary || {};
  var temp =
    s.tempMin != null && s.tempMax != null && s.tempMin !== s.tempMax
      ? Math.round(s.tempMin) + "–" + Math.round(s.tempMax) + "°C"
      : s.tempMax != null
        ? Math.round(s.tempMax) + "°C"
        : "—";
  var rain = s.rainMax != null ? Math.round(s.rainMax) + "% rain" : "";
  var wind = s.windMax != null ? Math.round(s.windMax) + " km/h wind" : "";
  var chips = [temp, s.condition || "", rain, wind].filter(Boolean);

  var hourly = "";
  if (data.slots && data.slots.length) {
    hourly =
      "<div class='lineup-weather-hourly'>" +
      data.slots
        .slice(0, 8)
        .map(function (slot) {
          var t = new Date(slot.time);
          var label = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
          return (
            "<span class='lineup-weather-hour'>" +
            "<span class='lineup-weather-hour-time'>" +
            escapeHtml(label) +
            "</span>" +
            "<span class='lineup-weather-hour-temp'>" +
            (slot.temp != null ? Math.round(slot.temp) + "°" : "—") +
            "</span>" +
            (slot.rain != null ? "<span class='lineup-weather-hour-rain'>" + Math.round(slot.rain) + "%</span>" : "") +
            "</span>"
          );
        })
        .join("") +
      "</div>";
  }

  return (
    "<div class='lineup-weather'>" +
    "<div class='lineup-weather-title'>Match weather" +
    (data.kickoffLabel ? " · " + escapeHtml(data.kickoffLabel) : "") +
    "</div>" +
    "<div class='lineup-weather-loc hint'>" +
    escapeHtml(data.location || "") +
    "</div>" +
    "<div class='lineup-weather-chips'>" +
    chips
      .map(function (c) {
        return "<span class='lineup-weather-chip'>" + escapeHtml(c) + "</span>";
      })
      .join("") +
    "</div>" +
    hourly +
    "</div>"
  );
}
