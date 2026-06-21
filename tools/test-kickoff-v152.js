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

const KICKOFF = "2026-07-12T10:30";

(async () => {
  const server = await serve(8767);
  const base = "http://127.0.0.1:8767";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(base + "/?t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("booting"), { timeout: 60000 });
  await page.click("#showAdminBtn");
  await page.waitForTimeout(500);
  await page.fill("#adminPass", "admin26");
  await page.click("#unlockAdmin");
  await page.waitForFunction(() => !!document.getElementById("matchKickoffInput"), { timeout: 15000 });

  const result = await page.evaluate(async (KICKOFF) => {
    window.__svMatchSavedPromise = new Promise((resolve) => {
      window.addEventListener("sv-match-saved", (e) => resolve(e.detail || {}), { once: true });
    });
    document.getElementById("matchKickoffInput").value = KICKOFF;
    document.getElementById("matchReviewInput").value = "kickoff v152 test";
    document.getElementById("saveRound").click();
    const ev = await Promise.race([
      window.__svMatchSavedPromise,
      new Promise((r) => setTimeout(() => r({ timeout: true }), 8000)),
    ]);
    const data = JSON.parse(localStorage.getItem("soccerVoteApp_v2") || "{}");
    const m = data.teams?.[0]?.matchesByRound?.["Round 1"];
    return {
      ev,
      saveBound: !!document.getElementById("saveRound")._svBound,
      kickoff: m?.kickoff,
      review: m?.review,
    };
  }, KICKOFF);

  const pass = result.kickoff === KICKOFF && result.review === "kickoff v152 test";
  console.log(JSON.stringify({ pass, result }, null, 2));
  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
