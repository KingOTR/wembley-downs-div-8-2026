const { chromium } = require("playwright");

(async () => {
  const browser = await chromium
    .launch({ headless: true, channel: "msedge" })
    .catch(() => chromium.launch({ headless: true, channel: "chrome" }))
    .catch(() => chromium.launch({ headless: true }));

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  await page.goto("https://wembley-downs-div-8-2026.web.app/?t=" + Date.now(), {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(5000);

  const fatalMsg = (await page.locator("#fatalBannerMsg").textContent()) || "";
  const fatal = await page
    .locator("#fatalBanner")
    .evaluate((el) => window.getComputedStyle(el).display !== "none");

  await page.click("#showAdminBtn").catch((e) => errors.push("click fail: " + e.message));
  await page.waitForTimeout(2000);

  const adminState = await page.evaluate(() => ({
    panelVisible: !!document.getElementById("adminPanel")?.classList.contains("visible"),
    mergeRoundCount: document.getElementById("mergeSourceRound")?.options?.length || 0,
    firebaseApp: !!window.__svFirebaseApp,
    authUser: !!(window.__svAuth && window.__svAuth.currentUser),
  }));

  console.log(
    JSON.stringify({ fatal, fatalMsg: fatalMsg.trim(), adminState, errors }, null, 2)
  );
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
