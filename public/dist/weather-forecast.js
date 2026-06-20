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
    var d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  if (dateFallback) {
    var d2 = new Date(dateFallback + "T10:00:00");
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
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

async function geocode(suburb, groundName) {
  var candidates = [];
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

  for (var i = 0; i < queries.length; i++) {
    var q = queries[i];
    var key = cacheKey(["geo", q]);
    if (GEO_CACHE[key]) return GEO_CACHE[key];

    var url =
      GEO_URL +
      "?name=" +
      encodeURIComponent(q) +
      "&count=5&language=en&format=json&countryCode=AU";
    try {
      var res = await fetch(url);
      if (!res.ok) continue;
      var data = await res.json();
      var results = data.results || [];
      var hit =
        results.find(function (r) {
          return r.admin1 === "Western Australia";
        }) || results[0];
      if (hit && hit.latitude != null && hit.longitude != null) {
        var out = { lat: hit.latitude, lon: hit.longitude, label: formatPlaceLabel(hit) };
        GEO_CACHE[key] = out;
        return out;
      }
    } catch (e) {
      console.warn("[weather] geocode failed", q, e);
    }
  }
  return null;
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
  var geo = null;
  if (isFinite(lat) && isFinite(lng)) {
    geo = {
      lat: lat,
      lon: lng,
      label: match.locationLabel || groundName || suburb || "Selected location",
    };
  } else {
    if (!suburb && !groundName) {
      return {
        ok: false,
        reason: "no_location",
        message: "Search for a ground location in Coach / admin (Team & Match tab).",
      };
    }
    geo = await geocode(suburb, groundName);
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

  if (!data || !data.ok) {
    return (
      "<div class='lineup-weather lineup-weather--empty'>" +
      "<div class='lineup-weather-head'>" +
      "<div class='lineup-weather-title'>Match weather</div>" +
      weatherUnitsToggleHtml(units) +
      "</div>" +
      "<p class='hint' style='margin:0'>" +
      escapeHtml((data && data.message) || "Weather unavailable.") +
      "</p></div>"
    );
  }

  var s = data.summary || {};
  var tempRange =
    s.tempMin != null && s.tempMax != null && s.tempMin !== s.tempMax
      ? fmtTemp(s.tempMin, units) + " – " + fmtTemp(s.tempMax, units)
      : fmtTemp(s.tempMax, units);
  var feels =
    s.feelsMin != null && s.feelsMax != null
      ? "Feels " +
        (s.feelsMin !== s.feelsMax
          ? fmtTemp(s.feelsMin, units) + "–" + fmtTemp(s.feelsMax, units)
          : fmtTemp(s.feelsMax, units))
      : "";
  var rain = s.rainMax != null ? Math.round(s.rainMax) + "% rain chance" : "";
  var precip = s.precipMax != null && s.precipMax > 0 ? fmtRainMm(s.precipMax, units) + " expected" : "";
  var wind =
    s.windMax != null
      ? fmtWind(s.windMax, units) + (s.windDir != null ? " " + windDir(s.windDir) : "")
      : "";
  var humid = s.humidity != null ? s.humidity + "% humidity" : "";

  var stats =
    "<div class='lineup-weather-stats'>" +
    statRow("Temperature", tempRange) +
    (feels ? statRow("Feels like", feels.replace(/^Feels /, "")) : "") +
    statRow("Conditions", s.condition || "—") +
    (rain ? statRow("Rain", rain) : "") +
    (precip ? statRow("Precipitation", precip) : "") +
    (wind ? statRow("Wind", wind) : "") +
    (humid ? statRow("Humidity", humid) : "") +
    (s.halftime && s.halftime.temp != null
      ? statRow(
          "Halftime (~45′)",
          fmtTemp(s.halftime.temp, units) +
            (s.halftime.rain != null ? ", " + Math.round(s.halftime.rain) + "% rain" : "") +
            (s.halftime.wind != null ? ", " + fmtWind(s.halftime.wind, units) : "")
        )
      : "") +
    "</div>";

  var hourly = "";
  if (data.slots && data.slots.length) {
    hourly =
      "<div class='lineup-weather-hourly-label'>Hourly (kickoff → full time)</div>" +
      "<div class='lineup-weather-hourly'>" +
      data.slots
        .slice(0, 10)
        .map(function (slot) {
          var t = new Date(slot.time);
          var label = t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
          return (
            "<span class='lineup-weather-hour'>" +
            "<span class='lineup-weather-hour-time'>" +
            escapeHtml(label) +
            "</span>" +
            "<span class='lineup-weather-hour-temp'>" +
            (slot.temp != null ? fmtTemp(slot.temp, units) : "—") +
            "</span>" +
            (slot.rain != null ? "<span class='lineup-weather-hour-rain'>" + Math.round(slot.rain) + "%</span>" : "") +
            (slot.wind != null ? "<span class='lineup-weather-hour-wind'>" + fmtWind(slot.wind, units) + "</span>" : "") +
            "</span>"
          );
        })
        .join("") +
      "</div>";
  }

  return (
    "<div class='lineup-weather'>" +
    "<div class='lineup-weather-head'>" +
    "<div class='lineup-weather-title'>Match weather" +
    (data.kickoffLabel ? " · " + escapeHtml(data.kickoffLabel) : "") +
    "</div>" +
    weatherUnitsToggleHtml(units) +
    "</div>" +
    "<div class='lineup-weather-loc hint'>" +
    escapeHtml(data.location || "") +
    "</div>" +
    stats +
    hourly +
    "</div>"
  );
}

function statRow(label, value) {
  return (
    "<div class='lineup-weather-stat'><span class='lineup-weather-stat-label'>" +
    escapeHtml(label) +
    "</span><span class='lineup-weather-stat-value'>" +
    escapeHtml(value) +
    "</span></div>"
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
