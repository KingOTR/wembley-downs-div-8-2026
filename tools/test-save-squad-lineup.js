/**
 * Test squad + lineup save binding and localStorage.
 */
const { chromium } = require("playwright");

const base = process.argv[2] || "https://wembley-downs-div-8-2026.web.app";

(async () => {
  const browser = await chromium
    .launch({ headless: true, channel: "msedge" })
    .catch(() => chromium.launch({ headless: true, channel: "chrome" }))
    .catch(() => chromium.launch({ headless: true }));

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(base + "/?t=" + Date.now(), {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(5000);

  await page.click("#showAdminBtn").catch(() => {});
  await page.waitForTimeout(2000);

  // Unlock super admin session (local only, no Firebase auth)
  await page.evaluate(() => {
    sessionStorage.setItem("soccerVoteAdminUnlock", "1");
    const panel = document.getElementById("adminPanel");
    if (panel) panel.classList.add("visible");
    const sa = document.getElementById("superAdminContent");
    if (sa) sa.style.display = "block";
  });
  await page.waitForTimeout(1500);

  const squadResult = await page.evaluate(async () => {
    const btn = document.getElementById("savePlayers");
    const editor = document.getElementById("playerEditor");
    if (!btn || !editor) return { ok: false, reason: "missing elements", bound: btn?._svBound };
    const before = localStorage.getItem("soccerVoteApp_v2");
    const marker = "TEST_SQUAD_" + Date.now();
    editor.value = marker + "\nPlayer Two\nPlayer Three";
    btn.click();
    await new Promise((r) => setTimeout(r, 2000));
    const after = localStorage.getItem("soccerVoteApp_v2");
    let parsed = null;
    try {
      parsed = JSON.parse(after || "{}");
    } catch {}
    const team = parsed?.teams?.[0];
    const hasMarker = (team?.players || []).some((p) => String(p).includes("TEST_SQUAD_"));
    const err = document.getElementById("adminOpErr");
    return {
      bound: !!btn._svBound,
      storageChanged: before !== after,
      hasMarker,
      players: team?.players?.slice(0, 3),
      adminOpErr: err?.textContent || "",
      toast: document.querySelector("[class*='toast']")?.textContent || "",
    };
  });

  // Switch to lineup tab and try a lineup change
  const lineupResult = await page.evaluate(async () => {
    const lineupTab = document.querySelector('[data-admin-tab="lineup"]');
    if (lineupTab) lineupTab.click();
    await new Promise((r) => setTimeout(r, 800));
    const msg = document.getElementById("lineupEditorMsg");
    const authLine = document.getElementById("authStatusLine");
    const before = localStorage.getItem("soccerVoteApp_v2");
    // Trigger lineup save via gn - find if F exists and modify
  const hasF = typeof window !== "undefined";
    // Click a starter chip if any
    const chip = document.querySelector("#lineupEditorGrid .player-chip, #lineupEditorGrid .lineup-mini-row");
    if (chip) chip.click();
    await new Promise((r) => setTimeout(r, 2500));
    const after = localStorage.getItem("soccerVoteApp_v2");
    return {
      lineupTab: !!lineupTab,
      chip: !!chip,
      storageChanged: before !== after,
      lineupMsg: msg?.textContent || "",
      authLine: authLine?.textContent || "",
      hasGn: false,
    };
  });

  console.log(JSON.stringify({ squadResult, lineupResult, errors }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
