/**
 * Smoke test: Rosalie Park kickoff weather uses Perth local hours.
 */
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const MATCH_TZ = "Australia/Perth";
const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;
const LAT = -31.96;
const LNG = 115.82;
const KICKOFF = "2026-06-21T10:00";

function parsePerthWallIso(s) {
  const m = String(s)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +(m[6] || 0)));
  return isNaN(d.getTime()) ? null : d;
}

function toPerthHourIso(d) {
  const t = d.getTime() + PERTH_OFFSET_MS;
  const u = new Date(t);
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${u.getUTCFullYear()}-${p(u.getUTCMonth() + 1)}-${p(u.getUTCDate())}T${p(u.getUTCHours())}:00`;
}

(async () => {
  const kickoff = parsePerthWallIso(KICKOFF);
  const end = new Date(kickoff.getTime() + 90 * 60 * 1000);
  const url =
    `${FORECAST_URL}?latitude=${LAT}&longitude=${LNG}` +
    `&hourly=temperature_2m,weather_code` +
    `&timezone=${encodeURIComponent(MATCH_TZ)}` +
    `&start_hour=${encodeURIComponent(toPerthHourIso(kickoff))}` +
    `&end_hour=${encodeURIComponent(toPerthHourIso(end))}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const times = data.hourly?.time || [];
  const temps = data.hourly?.temperature_2m || [];

  const kickMs = kickoff.getTime();
  const endMs = end.getTime();
  const slots = [];
  for (let i = 0; i < times.length; i++) {
    const t = parsePerthWallIso(times[i]);
    if (!t) continue;
    const ms = t.getTime();
    if (ms >= kickMs && ms <= endMs) {
      slots.push({ time: times[i], temp: temps[i] });
    }
  }

  console.log("URL:", url);
  console.log("Kickoff Perth:", KICKOFF, "->", kickoff.toISOString());
  console.log("API hours:", times.join(", "));
  console.log("Match slots:", slots);

  if (!slots.length) {
    console.error("FAIL: no slots in kickoff window");
    process.exit(1);
  }
  if (!times[0]?.startsWith("2026-06-21T10")) {
    console.error("FAIL: first hour not 10:00 Perth", times[0]);
    process.exit(1);
  }
  const avg = slots.reduce((a, s) => a + s.temp, 0) / slots.length;
  if (avg < 5 || avg > 35) {
    console.warn("WARN: unusual morning temp", avg);
  }
  console.log("OK: Perth weather window", slots.length, "hours, avg", avg.toFixed(1) + "°C");
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
