/**
 * Playwright smoke: admin exclusion checkboxes visible and toggleable.
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

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
      const mime = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json" };
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, () => resolve(server));
  });
}

const port = 8777;
const server = await serve(port);
const base = `http://127.0.0.1:${port}`;

try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    localStorage.setItem(
      "soccerVoteApp_v2",
      JSON.stringify({
        teams: [
          {
            id: 1,
            name: "Test Team",
            round: "Round 1",
            players: ["Alice", "Bob", "Carol"],
            voteMetaByRound: {},
          },
        ],
        votes: [],
        coachVotes: [],
      })
    );
    sessionStorage.setItem("soccerVoteAdminUnlock", "1");
  });

  await page.goto(base + "/?t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);

  await page.click("#showAdminBtn");
  await page.waitForTimeout(500);

  const adminMount = page.locator("#adminDeferredMount");
  const mountCv = await adminMount.evaluate((el) => getComputedStyle(el).contentVisibility);
  console.log("adminDeferredMount content-visibility:", mountCv);

  await page.evaluate(() => {
    var tpl = document.getElementById("adminDeferredTemplate");
    var mount = document.getElementById("adminDeferredMount");
    if (tpl && mount && !mount.querySelector("#superAdminContent")) {
      mount.appendChild(tpl.content.cloneNode(true));
    }
    var sc = document.getElementById("superAdminContent");
    if (sc) sc.style.display = "";
    document.getElementById("adminLoginBlock").style.display = "none";
  });
  await page.waitForTimeout(300);

  await page.click('button[data-tab="votes"]');
  await page.waitForTimeout(500);

  const whoBlock = page.locator("#whoHasntVotedBlock");
  if (!(await whoBlock.count())) {
    throw new Error("whoHasntVotedBlock missing — wireWhoHasntVoted may not have run");
  }

  const isOpen = await whoBlock.evaluate((el) => el.open);
  if (!isOpen) {
    await page.locator("#whoHasntVotedBlock summary").click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);

  const exclBox = page.locator("#whoVoteExclusions");
  const exclHtml = await exclBox.innerHTML();
  console.log("exclusions html length:", exclHtml.length);
  if (!exclHtml.includes("Excluded this round")) {
    throw new Error("Exclusion UI not rendered (super admin? squad?)");
  }

  const firstRow = page.locator(".who-vote-excl-row").first();
  if (!(await firstRow.count())) throw new Error("No exclusion checkboxes");
  await firstRow.scrollIntoViewIfNeeded();
  const firstCb = firstRow.locator("input[data-excl-player]");
  const before = await firstCb.isChecked();
  await firstRow.click();
  await page.waitForTimeout(400);
  const after = await firstCb.isChecked();
  if (before === after) {
    throw new Error("Checkbox did not toggle (before=" + before + " after=" + after + ")");
  }

  await page.waitForTimeout(500);

  const stored = await page.evaluate(() => {
    var data = JSON.parse(localStorage.getItem("soccerVoteApp_v2") || "{}");
    var team = (data.teams || []).find((t) => String(t.id) === "1");
    return team && team.voteMetaByRound;
  });
  console.log("voteMetaByRound after save:", JSON.stringify(stored));

  await browser.close();
  console.log("exclusion UI test OK");
} finally {
  server.close();
}
