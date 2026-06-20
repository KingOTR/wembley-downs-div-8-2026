const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" }).catch(() =>
    chromium.launch({ headless: true })
  );
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("https://wembley-downs-div-8-2026.web.app/?t=" + Date.now(), {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(5000);

  await page.click("#showAdminBtn");
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    sessionStorage.setItem("soccerVoteAdminUnlock", "1");
  });

  await page.evaluate(async () => {
    if (window.__svRefreshMergeRounds) await window.__svRefreshMergeRounds();
  });
  await page.waitForTimeout(4000);

  const report = await page.evaluate(() => {
    const src = document.getElementById("mergeSourceRound");
    const dst = document.getElementById("mergeDestRound");
    const hint = document.getElementById("mergeRoundsHint");
    const err = document.getElementById("mergeRoundsErr");
    const opts = src
      ? Array.from(src.options).map((o) => o.value)
      : [];
    return {
      mergeSourceRoundCount: src ? src.options.length : 0,
      mergeDestRoundCount: dst ? dst.options.length : 0,
      rounds: opts,
      hint: hint ? hint.textContent : "",
      err: err ? err.textContent : "",
      hasRefreshFn: typeof window.__svRefreshMergeRounds === "function",
    };
  });

  console.log(JSON.stringify({ report, errors }, null, 2));
  await browser.close();
  process.exit(report.mergeSourceRoundCount > 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
