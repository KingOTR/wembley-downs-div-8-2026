/**
 * Match weather via Open-Meteo (free, no API key).
 */
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const MATCH_MINUTES = 90;
const UNITS_KEY = "svWeatherUnits";
const GEO_CACHE = Object.create(null);
const FORECAST_CACHE = Object.create(null);

export function getWeatherUnits() {
  try {
    return localStorage.getItem(UNITS_KEY) === "imperial" ? "imperial" : "metric";
  } catch {
    return "metric";
  }
}

export function setWeatherUnits(units) {
  try {
    localStorage.setItem(UNITS_KEY, units === "imperial" ? "imperial" : "metric");
  } catch {}
}

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

function wmoEmoji(code) {
  var c = Number(code);
  if (c === 0) return "\u2600\uFE0F";
  if (c === 1) return "\uD83C\uDF24\uFE0F";
  if (c === 2) return "\u26C5";
  if (c === 3) return "\u2601\uFE0F";
  if (c <= 48) return "\uD83C\uDF2B\uFE0F";
  if (c <= 57) return "\uD83C\uDF26\uFE0F";
  if (c <= 67) return "\uD83C\uDF27\uFE0F";
  if (c <= 77) return "\u2744\uFE0F";
  if (c <= 82) return "\uD83C\uDF27\uFE0F";
  if (c <= 86) return "\uD83C\uDF28\uFE0F";
  if (c <= 99) return "\u26C8\uFE0F";
  return "\uD83C\uDF21\uFE0F";
}

function windArrow(deg) {
  var d = Number(deg);
  if (!isFinite(d)) return "";
  var arrows = ["\u2191", "\u2197", "\u2192", "\u2198", "\u2193", "\u2199", "\u2190", "\u2196"];
  return arrows[Math.round(d / 45) % 8];
}

function windDir(deg) {
  var d = Number(deg);
  if (!isFinite(d)) return "";
  var dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(d / 45) % 8];
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
    var s = String(iso).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      var dl = new Date(s);
      if (!isNaN(dl.getTime())) return dl;
    }
    var d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  if (dateFallback) {
    var d2 = new Date(dateFallback + "T10:00:00");
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

function toLocalHourIso(d) {
  var p = function (n) {
    return n < 10 ? "0" + n : "" + n;
  };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":00";
}

function scoreGeocodeHit(hit, query) {
  if (!hit) return -1;
  var q = String(query || "").toLowerCase();
  var score = 0;
  if (hit.country_code === "AU") score += 40;
  if (hit.admin1 === "Western Australia") score += 35;
  if (hit.name && q.indexOf(String(hit.name).toLowerCase()) >= 0) score += 20;
  score += Math.min(15, (hit.population || 0) / 10000);
  return score;
}

function cToF(c) {
  return c * (9 / 5) + 32;
}

function kmhToMph(k) {
  return k * 0.621371;
}

function mmToIn(mm) {
  return mm / 25.4;
}

function fmtTemp(c, units) {
  if (c == null || !isFinite(c)) return "—";
  if (units === "imperial") return Math.round(cToF(c)) + "°F";
  return Math.round(c) + "°C";
}

function fmtWind(kmh, units) {
  if (kmh == null || !isFinite(kmh)) return "—";
  if (units === "imperial") return Math.round(kmhToMph(kmh)) + " mph";
  return Math.round(kmh) + " km/h";
}

function fmtRainMm(mm, units) {
  if (mm == null || !isFinite(mm)) return null;
  if (units === "imperial") return mmToIn(mm).toFixed(2) + " in";
  return mm.toFixed(1) + " mm";
}

async function geocode(suburb, groundName, locationLabel) {
  var candidates = [];
  if (locationLabel) candidates.push(String(locationLabel).trim());
  if (groundName && suburb) {
    candidates.push([groundName, suburb, "Western Australia, Australia"].join(", "));
    candidates.push([groundName, suburb, "Australia"].join(", "));
  }
  if (groundName) {
    candidates.push([groundName, "Subiaco, Western Australia, Australia"].join(", "));
    candidates.push([groundName, "Perth, Western Australia, Australia"].join(", "));
    candidates.push([groundName, "Western Australia, Australia"].join(", "));
  }
  if (suburb) {
    candidates.push([suburb, "Western Australia, Australia"].join(", "));
    candidates.push(String(suburb).trim());
  }
  var seen = Object.create(null);
  var queries = candidates.filter(function (q) {
    q = String(q || "").trim();
    if (!q || seen[q]) return false;
    seen[q] = true;
    return true;
  });

  var best = null;
  var bestScore = -1;

  for (var i = 0; i < queries.length; i++) {
    var q = queries[i];
    var key = cacheKey(["geo", q]);
    if (GEO_CACHE[key]) {
      if (GEO_CACHE[key].score > bestScore) {
        best = GEO_CACHE[key];
        bestScore = GEO_CACHE[key].score;
      }
      continue;
    }

    var url =
      GEO_URL +
      "?name=" +
      encodeURIComponent(q) +
      "&count=8&language=en&format=json&countryCode=AU";
    try {
      var res = await fetch(url);
      if (!res.ok) continue;
      var data = await res.json();
      var results = data.results || [];
      results.sort(function (a, b) {
        return scoreGeocodeHit(b, q) - scoreGeocodeHit(a, q);
      });
      var hit = results[0];
      if (hit && hit.latitude != null && hit.longitude != null) {
        var out = {
          lat: hit.latitude,
          lon: hit.longitude,
          label: formatPlaceLabel(hit),
          score: scoreGeocodeHit(hit, q),
        };
        GEO_CACHE[key] = out;
        if (out.score > bestScore) {
          best = out;
          bestScore = out.score;
        }
      }
    } catch (e) {
      console.warn("[weather] geocode failed", q, e);
    }
  }
  return best;
}

function formatPlaceLabel(hit) {
  if (!hit) return "";
  var parts = [hit.name];
  if (hit.admin2) parts.push(hit.admin2);
  else if (hit.admin1) parts.push(hit.admin1);
  return parts.join(", ");
}

/**
 * @param {{ suburb?: string, groundName?: string, kickoff?: string, date?: string, venue?: string, lat?: number, lng?: number, locationLabel?: string }} match
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

  var lat = match && match.lat != null ? Number(match.lat) : NaN;
  var lng = match && match.lng != null ? Number(match.lng) : NaN;
  var locationLabel = String((match && match.locationLabel) || "").trim();
  var geo = null;
  if (isFinite(lat) && isFinite(lng)) {
    geo = {
      lat: lat,
      lon: lng,
      label: locationLabel || groundName || suburb || "Selected location",
      source: "pin",
    };
  } else {
    if (!suburb && !groundName && !locationLabel) {
      return {
        ok: false,
        reason: "no_location",
        message: "Search for a ground location in Coach / admin (Team & Match tab).",
      };
    }
    geo = await geocode(suburb, groundName, locationLabel);
    if (geo) geo.source = "geocode";
  }
  if (!geo) {
    var label = groundName && suburb ? groundName + ", " + suburb : groundName || suburb || "venue";
    return {
      ok: false,
      reason: "geocode_failed",
      message: "Could not find weather for " + label + ". Pick a location from search suggestions.",
    };
  }

  var start = new Date(kickoff.getTime() - 30 * 60 * 1000);
  var end = new Date(kickoff.getTime() + MATCH_MINUTES * 60 * 1000);

  var fKey = cacheKey([
    "fc2",
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
    "&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m" +
    "&timezone=auto" +
    "&start_hour=" +
    encodeURIComponent(toLocalHourIso(start)) +
    "&end_hour=" +
    encodeURIComponent(toLocalHourIso(end));

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
          feels: hourly.apparent_temperature ? hourly.apparent_temperature[i] : null,
          rain: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null,
          precipMm: hourly.precipitation ? hourly.precipitation[i] : null,
          wind: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
          windDir: hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : null,
          humidity: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
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
    var feels = slots.map(function (s) {
      return s.feels;
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
    var humids = slots.map(function (s) {
      return s.humidity;
    }).filter(function (v) {
      return v != null;
    });
    var precips = slots.map(function (s) {
      return s.precipMm;
    }).filter(function (v) {
      return v != null;
    });
    var mid = slots[Math.floor(slots.length / 2)] || slots[0];
    var htSlot = slots.find(function (s) {
      var t = new Date(s.time).getTime();
      return t >= kickMs + 45 * 60 * 1000 - 30 * 60 * 1000 && t <= kickMs + 45 * 60 * 1000 + 30 * 60 * 1000;
    });

    var out = {
      ok: true,
      location: geo.label,
      locationSource: geo.source || "geocode",
      kickoffLabel: formatKickoffLocal(match.kickoff || kickoff.toISOString()),
      summary: {
        tempMin: temps.length ? Math.min.apply(null, temps) : null,
        tempMax: temps.length ? Math.max.apply(null, temps) : null,
        feelsMin: feels.length ? Math.min.apply(null, feels) : null,
        feelsMax: feels.length ? Math.max.apply(null, feels) : null,
        rainMax: rains.length ? Math.max.apply(null, rains) : null,
        precipMax: precips.length ? Math.max.apply(null, precips) : null,
        windMax: winds.length ? Math.max.apply(null, winds) : null,
        windDir: mid.windDir,
        humidity: humids.length ? Math.round(humids.reduce(function (a, b) { return a + b; }, 0) / humids.length) : null,
        condition: wmoLabel(mid.code),
        halftime: htSlot
          ? {
              temp: htSlot.temp,
              rain: htSlot.rain,
              wind: htSlot.wind,
            }
          : null,
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

export function weatherPanelHtml(data, units) {
  units = units || getWeatherUnits();
  var midCode =
    data && data.slots && data.slots.length
      ? data.slots[Math.floor(data.slots.length / 2)].code
      : null;

  if (!data || !data.ok) {
    return (
      "<div class='lineup-weather lineup-weather--compact lineup-weather--empty'>" +
      "<div class='lineup-weather-head'>" +
      "<div class='lineup-weather-title'>Match weather</div>" +
      weatherUnitsToggleHtml(units) +
      "</div>" +
      "<p class='lineup-weather-empty-msg'>" +
      escapeHtml((data && data.message) || "Weather unavailable.") +
      "</p></div>"
    );
  }

  var s = data.summary || {};
  var tempRange =
    s.tempMin != null && s.tempMax != null && s.tempMin !== s.tempMax
      ? fmtTemp(s.tempMin, units) + "–" + fmtTemp(s.tempMax, units)
      : fmtTemp(s.tempMax != null ? s.tempMax : s.tempMin, units);
  var feelsShort =
    s.feelsMin != null && s.feelsMax != null
      ? s.feelsMin !== s.feelsMax
        ? fmtTemp(s.feelsMin, units) + "–" + fmtTemp(s.feelsMax, units)
        : fmtTemp(s.feelsMax, units)
      : "";
  var rainPct = s.rainMax != null ? Math.round(s.rainMax) + "%" : "";
  var windStr =
    s.windMax != null
      ? fmtWind(s.windMax, units) + (s.windDir != null ? " " + windArrow(s.windDir) + " " + windDir(s.windDir) : "")
      : "";
  var humidStr = s.humidity != null ? s.humidity + "%" : "";
  var cond = s.condition || "—";
  var icon = wmoEmoji(midCode);

  var metrics = "";
  if (feelsShort) metrics += metricChip("\uD83C\uDF21\uFE0F", feelsShort + " feels");
  if (rainPct) metrics += metricChip("\uD83C\uDF27\uFE0F", rainPct);
  if (windStr) metrics += metricChip("\uD83D\uDCA8", windStr);
  if (humidStr) metrics += metricChip("\uD83D\uDCA7", humidStr);
  if (s.halftime && s.halftime.temp != null) {
    var ht =
      "HT " +
      fmtTemp(s.halftime.temp, units) +
      (s.halftime.rain != null ? " " + Math.round(s.halftime.rain) + "%" : "") +
      (s.halftime.wind != null ? " " + fmtWind(s.halftime.wind, units) : "");
    metrics += "<span class='lineup-weather-metric lineup-weather-metric--ht'>\u23F1\uFE0F " + escapeHtml(ht) + "</span>";
  }

  var hourly = "";
  if (data.slots && data.slots.length) {
    hourly =
      "<details class='lineup-weather-details'>" +
      "<summary>Hourly forecast</summary>" +
      "<div class='lineup-weather-hourly-strip'>" +
      data.slots
        .slice(0, 12)
        .map(function (slot) {
          var t = new Date(slot.time);
          var label = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
          return (
            "<span class='lineup-weather-hour-chip'>" +
            "<span class='lineup-weather-hour-chip-time'>" +
            escapeHtml(label) +
            "</span>" +
            "<span class='lineup-weather-hour-chip-icon' aria-hidden='true'>" +
            wmoEmoji(slot.code) +
            "</span>" +
            "<span class='lineup-weather-hour-chip-temp'>" +
            (slot.temp != null ? fmtTemp(slot.temp, units) : "—") +
            "</span>" +
            (slot.rain != null && slot.rain > 0
              ? "<span class='lineup-weather-hour-chip-rain'>" + Math.round(slot.rain) + "%</span>"
              : "") +
            "</span>"
          );
        })
        .join("") +
      "</div></details>";
  }

  return (
    "<div class='lineup-weather lineup-weather--compact'>" +
    "<div class='lineup-weather-head'>" +
    "<div class='lineup-weather-title'>Match weather" +
    (data.kickoffLabel ? " · " + escapeHtml(data.kickoffLabel) : "") +
    "</div>" +
    weatherUnitsToggleHtml(units) +
    "</div>" +
    "<div class='lineup-weather-loc'>Forecast for " +
    escapeHtml(data.location || "ground") +
    (data.locationSource === "pin" ? " (saved pin)" : "") +
    "</div>" +
    "<div class='lineup-weather-hero'>" +
    "<span class='lineup-weather-hero-icon' aria-hidden='true'>" +
    icon +
    "</span>" +
    "<span class='lineup-weather-hero-temp'>" +
    escapeHtml(tempRange) +
    "</span>" +
    "<span class='lineup-weather-hero-cond'>" +
    escapeHtml(cond) +
    "</span>" +
    "</div>" +
    (metrics ? "<div class='lineup-weather-metrics'>" + metrics + "</div>" : "") +
    hourly +
    "</div>"
  );
}

function metricChip(icon, text) {
  return (
    "<span class='lineup-weather-metric'>" +
    "<span class='lineup-weather-metric-ico' aria-hidden='true'>" +
    icon +
    "</span> " +
    escapeHtml(text) +
    "</span>"
  );
}

function weatherUnitsToggleHtml(units) {
  var mOn = units !== "imperial" ? " active" : "";
  var iOn = units === "imperial" ? " active" : "";
  return (
    "<div class='weather-units-toggle' role='group' aria-label='Weather units'>" +
    "<button type='button' class='weather-units-btn" +
    mOn +
    "' data-units='metric'>Metric</button>" +
    "<button type='button' class='weather-units-btn" +
    iOn +
    "' data-units='imperial'>Imperial</button>" +
    "</div>"
  );
}

export function wireWeatherUnitsToggle(container, onChange) {
  if (!container || container._svUnitsWired) return;
  container._svUnitsWired = true;
  container.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest(".weather-units-btn") : null;
    if (!btn) return;
    var u = btn.getAttribute("data-units");
    if (u !== "metric" && u !== "imperial") return;
    setWeatherUnits(u);
    if (typeof onChange === "function") onChange(u);
  });
}
