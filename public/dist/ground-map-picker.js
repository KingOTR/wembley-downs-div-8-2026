/**
 * Leaflet ground picker for admin match location (lat/lng).
 */
var mapInstance = null;
var mapMarker = null;
var mapReady = false;

function readInputs() {
  return {
    lat: document.getElementById("matchLatInput"),
    lng: document.getElementById("matchLngInput"),
    suburb: document.getElementById("matchSuburbInput"),
    ground: document.getElementById("matchGroundInput"),
  };
}

function setCoords(lat, lng) {
  var els = readInputs();
  if (els.lat) els.lat.value = String(lat.toFixed(6));
  if (els.lng) els.lng.value = String(lng.toFixed(6));
  var hint = document.getElementById("groundMapHint");
  if (hint) hint.textContent = "Pin set: " + lat.toFixed(5) + ", " + lng.toFixed(5);
}

function defaultCenter() {
  return { lat: -31.934, lng: 115.796 };
}

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    if (!document.getElementById("leaflet-css")) {
      var link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    var script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function placeMarker(lat, lng) {
  if (!mapInstance || !window.L) return;
  if (mapMarker) mapMarker.setLatLng([lat, lng]);
  else {
    mapMarker = window.L.marker([lat, lng], { draggable: true }).addTo(mapInstance);
    mapMarker.on("dragend", function () {
      var p = mapMarker.getLatLng();
      setCoords(p.lat, p.lng);
    });
  }
}

export async function initGroundMapPicker() {
  var mount = document.getElementById("groundMapPicker");
  if (!mount || mount._svMapInit) return;
  mount._svMapInit = true;

  try {
    await loadLeaflet();
  } catch (e) {
    mount.innerHTML = "<p class='hint' style='margin:0'>Map unavailable (check connection).</p>";
    return;
  }

  var els = readInputs();
  var center = defaultCenter();
  var lat = els.lat && els.lat.value ? parseFloat(els.lat.value) : NaN;
  var lng = els.lng && els.lng.value ? parseFloat(els.lng.value) : NaN;
  if (isFinite(lat) && isFinite(lng)) center = { lat: lat, lng: lng };

  mapInstance = window.L.map(mount, { scrollWheelZoom: true }).setView([center.lat, center.lng], 14);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  }).addTo(mapInstance);

  placeMarker(center.lat, center.lng);
  setCoords(center.lat, center.lng);

  mapInstance.on("click", function (ev) {
    placeMarker(ev.latlng.lat, ev.latlng.lng);
    setCoords(ev.latlng.lat, ev.latlng.lng);
  });

  var locateBtn = document.getElementById("groundMapLocate");
  if (locateBtn && !locateBtn._svWired) {
    locateBtn._svWired = true;
    locateBtn.addEventListener("click", function () {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var la = pos.coords.latitude;
          var ln = pos.coords.longitude;
          mapInstance.setView([la, ln], 15);
          placeMarker(la, ln);
          setCoords(la, ln);
        },
        function () {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  mapReady = true;
  setTimeout(function () {
    try {
      mapInstance.invalidateSize();
    } catch {}
  }, 200);
}

export function syncMapFromInputs() {
  if (!mapReady || !mapInstance) return;
  var els = readInputs();
  var lat = els.lat && els.lat.value ? parseFloat(els.lat.value) : NaN;
  var lng = els.lng && els.lng.value ? parseFloat(els.lng.value) : NaN;
  if (isFinite(lat) && isFinite(lng)) {
    mapInstance.setView([lat, lng], 15);
    placeMarker(lat, lng);
  }
}
