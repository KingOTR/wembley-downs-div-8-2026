/**
 * Location search — curated WA grounds + Open-Meteo, Nominatim, Photon (all free).
 */
import { searchCuratedGrounds } from "./wa-grounds-data.js?tag=v188";

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PHOTON_URL = "https://photon.komoot.io/api/";
const SEARCH_DEBOUNCE_MS = 320;
const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 15;
const USER_AGENT = "WembleyDownsVoter/1.0 (wembley-downs-div-8-2026.web.app)";

var searchTimer = null;
var inflight = null;
var lastResults = [];
var lastQuery = "";

function els() {
  return {
    search: document.getElementById("matchLocationSearch"),
    results: document.getElementById("matchLocationResults"),
    selected: document.getElementById("matchLocationSelected"),
    label: document.getElementById("matchLocationLabel"),
    lat: document.getElementById("matchLatInput"),
    lng: document.getElementById("matchLngInput"),
    suburb: document.getElementById("matchSuburbInput"),
    ground: document.getElementById("matchGroundInput"),
  };
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normKey(hit) {
  var lat = Math.round(Number(hit.latitude) * 1000);
  var lng = Math.round(Number(hit.longitude) * 1000);
  var name = String(hit.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return name + "|" + lat + "|" + lng;
}

function formatDisplay(hit) {
  if (!hit) return "";
  var suburb = String(hit.admin2 || hit.admin1 || "").trim();
  if (suburb === "Western Australia") suburb = "";
  if (suburb) return hit.name + " · " + suburb + ", WA";
  return hit.name + ", WA";
}

function formatMeta(hit) {
  if (!hit) return "";
  if (hit.source === "curated") return "Saved WA ground";
  if (hit.source === "typed") return "Use this address";
  var parts = [];
  if (hit.admin2 && hit.admin2 !== hit.name) parts.push(hit.admin2);
  if (hit.admin1) parts.push(hit.admin1);
  if (hit.country_code === "AU" && parts.indexOf("Western Australia") < 0) parts.push("Australia");
  return parts.join(", ") || "Western Australia";
}

function extractSuburb(hit) {
  if (!hit) return "";
  var s = String(hit.admin2 || "").trim();
  if (s && s !== "Western Australia") return s;
  return String(hit.admin1 === "Western Australia" ? "" : hit.admin1 || "").trim();
}

function scoreHit(hit, query) {
  var q = String(query || "").toLowerCase();
  var score = hit.score || 0;
  if (hit.admin1 === "Western Australia") score += 45;
  else if (hit.country_code === "AU") score += 20;
  if (hit.admin2 && /perth|subiaco|fremantle|joondalup|mandurah|rockingham/i.test(hit.admin2)) score += 12;
  var name = String(hit.name || "").toLowerCase();
  if (name.indexOf(q) >= 0) score += 35;
  if (/park|reserve|oval|stadium|ground|recreation|sport|complex|field/i.test(name)) score += 18;
  if (hit.source === "curated") score += 55;
  if (hit.source === "openmeteo") score += 8;
  hit.score = score;
  return score;
}

function dedupeMerge(lists, query) {
  var seen = Object.create(null);
  var all = [];
  lists.forEach(function (list) {
    (list || []).forEach(function (hit) {
      if (!hit || hit.latitude == null || hit.longitude == null) return;
      var key = normKey(hit);
      if (seen[key]) {
        if ((hit.score || 0) > (seen[key].score || 0)) seen[key] = hit;
        return;
      }
      seen[key] = hit;
    });
  });
  Object.keys(seen).forEach(function (k) {
    all.push(seen[k]);
  });
  all.forEach(function (h) {
    scoreHit(h, query);
  });
  all.sort(function (a, b) {
    return (b.score || 0) - (a.score || 0);
  });
  return all.slice(0, MAX_RESULTS);
}

async function fetchOpenMeteo(query, signal) {
  var url =
    GEO_URL +
    "?name=" +
    encodeURIComponent(query + " Western Australia") +
    "&count=15&language=en&format=json&countryCode=AU";
  var res = await fetch(url, { signal: signal });
  if (!res.ok) return [];
  var data = await res.json();
  return (data.results || []).map(function (r) {
    return {
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      admin1: r.admin1,
      admin2: r.admin2,
      country_code: r.country_code,
      source: "openmeteo",
    };
  });
}

async function fetchNominatim(query, signal) {
  var url =
    NOMINATIM_URL +
    "?q=" +
    encodeURIComponent(query + ", Western Australia, Australia") +
    "&format=json&limit=15&countrycodes=au&addressdetails=1";
  var res = await fetch(url, {
    signal: signal,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return [];
  var data = await res.json();
  return (data || []).map(function (r) {
    var addr = r.address || {};
    return {
      name: r.name || addr.leisure || addr.road || addr.suburb || query,
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      admin1: addr.state || "Western Australia",
      admin2: addr.suburb || addr.city || addr.town || addr.village || "",
      country_code: "AU",
      source: "nominatim",
    };
  });
}

async function fetchPhoton(query, signal) {
  var url =
    PHOTON_URL +
    "?q=" +
    encodeURIComponent(query + " Perth WA") +
    "&limit=15&lang=en";
  var res = await fetch(url, { signal: signal });
  if (!res.ok) return [];
  var data = await res.json();
  return (data.features || []).map(function (f) {
    var p = f.properties || {};
    var coords = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : [];
    return {
      name: p.name || p.street || query,
      latitude: coords[1],
      longitude: coords[0],
      admin1: p.state || "Western Australia",
      admin2: p.city || p.district || p.locality || "",
      country_code: (p.countrycode || "au").toUpperCase(),
      source: "photon",
    };
  });
}

function setSelected(hit, labelOverride) {
  var e = els();
  var label = labelOverride || (hit ? formatDisplay(hit) : "");
  if (e.label) e.label.value = label;
  if (e.selected) {
    e.selected.textContent = label ? "📍 " + label : "";
    e.selected.hidden = !label;
  }
  var latVal = null;
  var lngVal = null;
  var groundVal = "";
  var subVal = "";
  if (hit) {
    latVal = Number(hit.latitude);
    lngVal = Number(hit.longitude);
    if (e.lat && isFinite(latVal)) e.lat.value = String(latVal.toFixed(6));
    if (e.lng && isFinite(lngVal)) e.lng.value = String(lngVal.toFixed(6));
    if (e.ground && hit.name) {
      groundVal = String(hit.name);
      e.ground.value = groundVal;
    }
    subVal = extractSuburb(hit);
    if (e.suburb && subVal) e.suburb.value = subVal;
  }
  hideResults();
  if (e.search && label && !e.search.value.trim()) e.search.value = hit ? hit.name : label;
  if (hit && isFinite(latVal) && isFinite(lngVal)) {
    try {
      if (typeof window.__svPatchMatchLocationFields === "function") {
        window.__svPatchMatchLocationFields({
          lat: latVal,
          lng: lngVal,
          locationLabel: label,
          groundName: groundVal || undefined,
          suburb: subVal || undefined,
        });
      }
    } catch (err) {
      console.warn("[location-autocomplete] patch match", err);
    }
  }
}

function hideResults() {
  var e = els();
  if (e.results) {
    e.results.hidden = true;
    e.results.innerHTML = "";
  }
}

function showResults(items, query) {
  var e = els();
  if (!e.results) return;
  if (!items.length) {
    e.results.hidden = true;
    e.results.innerHTML = "";
    return;
  }
  e.results.hidden = false;
  var html = items
    .map(function (hit, idx) {
      return (
        "<button type='button' class='location-result' data-idx='" +
        idx +
        "'>" +
        "<span class='location-result-name'>" +
        escapeHtml(formatDisplay(hit)) +
        "</span>" +
        "<span class='location-result-meta'>" +
        escapeHtml(formatMeta(hit)) +
        "</span></button>"
      );
    })
    .join("");

  var q = String(query || "").trim();
  if (q.length >= MIN_QUERY_LEN) {
    html +=
      "<button type='button' class='location-result location-result--typed' data-use-typed='1'>" +
      "<span class='location-result-name'>Use typed address</span>" +
      "<span class='location-result-meta'>" +
      escapeHtml(q + ", WA") +
      "</span></button>";
  }

  e.results.innerHTML = html;
  e.results.querySelectorAll(".location-result").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.getAttribute("data-use-typed") === "1") {
        setSelected(
          {
            name: q,
            latitude: null,
            longitude: null,
            admin1: "Western Australia",
            admin2: "",
            source: "typed",
          },
          q + ", WA"
        );
        return;
      }
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      if (isFinite(idx) && lastResults[idx]) setSelected(lastResults[idx]);
    });
  });
}

async function searchPlaces(query) {
  var q = String(query || "").trim();
  lastQuery = q;
  if (q.length < MIN_QUERY_LEN) {
    hideResults();
    return;
  }
  if (inflight) {
    try {
      inflight.abort();
    } catch {}
  }
  inflight = new AbortController();
  var signal = inflight.signal;

  try {
    var curated = searchCuratedGrounds(q, MAX_RESULTS);
    var results = await Promise.allSettled([
      fetchOpenMeteo(q, signal),
      fetchNominatim(q, signal),
      fetchPhoton(q, signal),
    ]);
    if (signal.aborted) return;

    var apiLists = results
      .filter(function (r) {
        return r.status === "fulfilled";
      })
      .map(function (r) {
        return r.value;
      });

    var merged = dedupeMerge([curated].concat(apiLists), q);
    lastResults = merged;
    showResults(merged, q);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.warn("[location-autocomplete] search failed", err);
    var fallback = searchCuratedGrounds(q, MAX_RESULTS);
    if (fallback.length) {
      lastResults = fallback;
      showResults(fallback, q);
    } else {
      hideResults();
    }
  } finally {
    inflight = null;
  }
}

function syncFromMatchEntry(entry) {
  var e = els();
  if (!entry) {
    if (e.selected) {
      e.selected.textContent = "";
      e.selected.hidden = true;
    }
    if (e.label && document.activeElement !== e.label) e.label.value = "";
    return;
  }
  var lat = entry.lat != null ? Number(entry.lat) : NaN;
  var lng = entry.lng != null ? Number(entry.lng) : NaN;
  var ground = String(entry.groundName || entry.venue || "").trim();
  var suburb = String(entry.suburb || "").trim();
  var label = String(entry.locationLabel || "").trim();
  if (!label) {
    if (ground && suburb) label = ground + " · " + suburb + ", WA";
    else if (ground) label = ground + ", WA";
    else if (suburb) label = suburb + ", WA";
  }
  if (e.label && document.activeElement !== e.label) e.label.value = label;
  if (e.selected) {
    e.selected.textContent = label ? "📍 " + label : "";
    e.selected.hidden = !label;
  }
  if (isFinite(lat) && isFinite(lng)) {
    if (e.lat) e.lat.value = String(lat.toFixed(6));
    if (e.lng) e.lng.value = String(lng.toFixed(6));
  } else {
    if (e.lat && document.activeElement !== e.lat) e.lat.value = "";
    if (e.lng && document.activeElement !== e.lng) e.lng.value = "";
  }
  if (e.ground && ground && document.activeElement !== e.ground) e.ground.value = ground;
  if (e.suburb && suburb && document.activeElement !== e.suburb) e.suburb.value = suburb;
  if (e.search && document.activeElement !== e.search && !e.search.value.trim() && (ground || label)) {
    e.search.value = ground || label.split("·")[0].split(",")[0].trim() || "";
  }
}

window.__svSyncLocationFromMatch = syncFromMatchEntry;

export function initLocationAutocomplete() {
  var e = els();
  if (!e.search || e.search._svLocInit) return;
  e.search._svLocInit = true;

  e.search.addEventListener("input", function () {
    if (searchTimer) clearTimeout(searchTimer);
    var q = e.search.value;
    searchTimer = setTimeout(function () {
      searchPlaces(q);
    }, SEARCH_DEBOUNCE_MS);
  });

  e.search.addEventListener("focus", function () {
    if (e.search.value.trim().length >= MIN_QUERY_LEN) searchPlaces(e.search.value);
    else if (lastResults.length) showResults(lastResults, lastQuery);
  });

  document.addEventListener("click", function (ev) {
    if (!e.results || !e.search) return;
    if (e.results.contains(ev.target) || e.search.contains(ev.target)) return;
    hideResults();
  });

  e.search.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") hideResults();
  });
}

export function syncLocationFromMatch(entry) {
  syncFromMatchEntry(entry);
}

export function syncLocationFromInputs() {
  var e = els();
  syncFromMatchEntry({
    lat: e.lat && e.lat.value ? parseFloat(e.lat.value) : null,
    lng: e.lng && e.lng.value ? parseFloat(e.lng.value) : null,
    groundName: e.ground ? e.ground.value : "",
    suburb: e.suburb ? e.suburb.value : "",
    locationLabel: e.label ? e.label.value : "",
  });
}
