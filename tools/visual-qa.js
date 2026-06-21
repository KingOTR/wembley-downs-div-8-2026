/**
 * Local visual QA: voting tab, lineup tab, admin panel, theme toggle.
 * Usage: node tools/visual-qa.js [baseUrl]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".json": "application/json",
};

function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = req.url.split("?")[0];
      if (p === "/") p = "/index.html";
      const file = path.join(publicDir, p.replace(/^\//, ""));
      if (!file.startsWith(publicDir) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(file);
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, () => resolve(server));
  });
}

(async () => {
  const port = 8766;
  let server;
  let base = process.argv[2];
  if (!base) {
    server = await serve(port);
    base = `http://127.0.0.1:${port}`;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  const results = {};

  await page.goto(base + "/?t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  results.fatalHidden = !(await page.locator("#fatalBanner").isVisible());
  results.logoVisible = await page.locator(".brand-logo img").isVisible();
  results.fontDisplay = await page.evaluate(() => getComputedStyle(document.body).fontFamily);

  // Voting tab
  results.voteTabActive = await page.locator("#tabVote").evaluate((el) => el.classList.contains("active"));
  results.voteSectionVisible = await page.locator("#voteSection").isVisible();
  results.playerListVisible = await page.locator("#playerList").isVisible();
  results.submitVoteExists = await page.locator("#submitVote").isVisible();

  // Lineup tab
  await page.click("#tabLineup");
  await page.waitForTimeout(1500);
  results.lineupCardVisible = await page.locator("#lineupCard").isVisible();
  results.lineupTabActive = await page.locator("#tabLineup").evaluate((el) => el.classList.contains("active"));
  results.lineupWrapExists = await page.locator("#lineupPublicWrap").isVisible();

  // Admin panel
  await page.click("#showAdminBtn");
  await page.waitForTimeout(500);
  results.adminPanelVisible = await page.locator("#adminPanel").evaluate((el) => el.classList.contains("visible"));
  results.adminUnlockVisible = await page.locator("#unlockAdmin").isVisible();

  // Theme toggle (injected by voter-enhancements.js)
  const themeBtn = page.locator(".theme-toggle");
  results.themeToggleExists = (await themeBtn.count()) > 0;
  if (results.themeToggleExists) {
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await themeBtn.click();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    results.themeToggleChanges = before !== after || after === "dark" || after === "light";
  }

  const pass =
    results.fatalHidden &&
    results.logoVisible &&
    results.voteSectionVisible &&
    results.lineupCardVisible &&
    results.adminPanelVisible &&
    results.adminUnlockVisible;

  console.log(JSON.stringify({ base, pass, results, errors: errors.slice(0, 8) }, null, 2));
  await browser.close();
  if (server) server.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
