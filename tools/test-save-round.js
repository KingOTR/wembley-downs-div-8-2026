/**
 * Test save team & round button — click handler, errors, localStorage.
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
  await page.waitForTimeout(1500);

  const before = await page.evaluate(() => ({
    saveExists: !!document.getElementById("saveRound"),
    adminVisible: document.getElementById("adminPanel")?.classList.contains("visible"),
    superUnlocked: sessionStorage.getItem("soccerVoteAdminUnlock") === "1",
    deferredMounted: !!document.getElementById("teamNameInput"),
    authUser: !!(window.__svAuth && window.__svAuth.currentUser),
  }));

  // Mount deferred template without Firebase auth (simulate super admin session flag)
  await page.evaluate(() => {
    sessionStorage.setItem("soccerVoteAdminUnlock", "1");
    if (typeof window.requestIdleCallback === "function") {
      return new Promise((resolve) => {
        const tryMount = () => {
          const mount = document.getElementById("adminDeferredMount");
          const tpl = document.getElementById("adminDeferredTemplate");
          if (mount && tpl && !document.getElementById("saveRound")) {
            mount.appendChild(tpl.content.cloneNode(true));
          }
          const panel = document.getElementById("adminPanel");
          if (panel) panel.classList.add("visible");
          const sa = document.getElementById("superAdminContent");
          if (sa) sa.style.display = "block";
          resolve();
        };
        requestIdleCallback(tryMount, { timeout: 500 });
        setTimeout(tryMount, 600);
      });
    }
  });

  await page.waitForTimeout(2000);

  const mid = await page.evaluate(() => ({
    saveExists: !!document.getElementById("saveRound"),
    teamInput: !!document.getElementById("teamNameInput"),
    saveBound: document.getElementById("saveRound")?._svBound,
  }));

  // Try clicking save — may fail if listeners not wired without full unlock flow
  const clickResult = await page.evaluate(async () => {
    const btn = document.getElementById("saveRound");
    if (!btn) return { clicked: false, reason: "no button" };
    const before = localStorage.getItem("soccerVoteApp_v2");
    btn.click();
    await new Promise((r) => setTimeout(r, 1500));
    const after = localStorage.getItem("soccerVoteApp_v2");
    const err = document.getElementById("adminOpErr");
    const toast = document.querySelector(".toast, [class*='toast']");
    return {
      clicked: true,
      storageChanged: before !== after,
      adminOpErr: err ? err.textContent : "",
      hasXi: typeof window.__svXiSave === "function",
    };
  });

  console.log(JSON.stringify({ before, mid, clickResult, errors }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
