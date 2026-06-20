/**
 * Location search autocomplete (Open-Meteo Geocoding, no API key).
 * Replaces Leaflet map picker — stores lat/lng for accurate weather.
 */
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LEN = 2;

var searchTimer = null;
var inflight = null;
var lastResults = [];

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

function formatPlace(hit) {
  if (!hit) return "";
  var parts = [hit.name];
  if (hit.admin2 && hit.admin2 !== hit.name) parts.push(hit.admin2);
  else if (hit.admin1) parts.push(hit.admin1);
  if (hit.country_code === "AU") parts.push("WA");
  else if (hit.country) parts.push(hit.country);
  return parts.filter(Boolean).join(", ");
}

function extractSuburb(hit) {
  if (!hit) return "";
  return String(hit.admin2 || hit.admin1 || "").trim();
}

function setSelected(hit, labelOverride) {
  var e = els();
  var label = labelOverride || (hit ? formatPlace(hit) : "");
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

function showResults(items) {
  var e = els();
  if (!e.results) return;
  if (!items.length) {
    e.results.hidden = true;
    e.results.innerHTML = "";
    return;
  }
  e.results.hidden = false;
  e.results.innerHTML = items
    .map(function (hit, idx) {
      return (
        "<button type='button' class='location-result' data-idx='" +
        idx +
        "'>" +
        "<span class='location-result-name'>" +
        escapeHtml(hit.name) +
        "</span>" +
        "<span class='location-result-meta'>" +
        escapeHtml(formatPlace(hit)) +
        "</span></button>"
      );
    })
    .join("");
  e.results.querySelectorAll(".location-result").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      if (isFinite(idx) && lastResults[idx]) setSelected(lastResults[idx]);
    });
  });
}

async function searchPlaces(query) {
  var q = String(query || "").trim();
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
  var url =
    GEO_URL +
    "?name=" +
    encodeURIComponent(q) +
    "&count=10&language=en&format=json&countryCode=AU";
  try {
    var res = await fetch(url, { signal: inflight.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    var hits = (data.results || []).slice();
    hits.sort(function (a, b) {
      var aw = a.admin1 === "Western Australia" ? 0 : 1;
      var bw = b.admin1 === "Western Australia" ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return (b.population || 0) - (a.population || 0);
    });
    lastResults = hits;
    showResults(hits);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.warn("[location-autocomplete] search failed", err);
    hideResults();
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
    if (ground && suburb) label = ground + ", " + suburb + ", WA";
    else if (ground) label = ground + (suburb ? ", " + suburb : "") + ", WA";
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
    e.search.value = ground || label.split(",")[0] || "";
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
    if (lastResults.length && e.search.value.trim().length >= MIN_QUERY_LEN) showResults(lastResults);
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
