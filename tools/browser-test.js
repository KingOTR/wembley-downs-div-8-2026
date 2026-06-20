const { chromium } = require("playwright");

(async () => {
  let browser;
  for (const channel of ["msedge", "chrome", undefined]) {
    try {
      browser = await chromium.launch({
        headless: true,
        ...(channel ? { channel } : {}),
      });
      break;
    } catch {
      /* try next channel */
    }
  }
  if (!browser) throw new Error("No Playwright browser available");

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  await page.goto("https://wembley-downs-div-8-2026.web.app/?t=" + Date.now(), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(3000);

  const fatal = await page.locator("#fatalBanner").isVisible();
  const fatalMsg = (await page.locator("#fatalBannerMsg").textContent()) || "";

  const logo = page.locator(".brand-logo img");
  const logoVisible = await logo.isVisible();
  const logoSrc = await logo.getAttribute("src");
  const logoAlt = await logo.getAttribute("alt");
  const logoBox = logoVisible ? await logo.boundingBox() : null;
  const logoNatural = logoVisible
    ? await logo.evaluate((img) => ({
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      }))
    : null;

  const admin = await page.evaluate(() => {
    const btn = document.getElementById("showAdminBtn");
    const panel = document.getElementById("adminPanel");
    if (!btn || !panel) return { ok: false, reason: "missing elements" };
    btn.click();
    return {
      ok: true,
      panelVisible: panel.classList.contains("visible"),
      panelDisplay: getComputedStyle(panel).display,
      unlockVisible: !!document.getElementById("unlockAdmin")?.offsetParent,
      adminPassVisible: !!document.getElementById("adminPass")?.offsetParent,
    };
  });

  await page.waitForTimeout(500);

  const voteSectionVisible = await page.locator("#voteSection").isVisible();
  const voteHeading = await page.locator("#voteSection h2").textContent();
  const playerListVisible = await page.locator("#playerList").isVisible();
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");

  const pass =
    !fatal &&
    logoVisible &&
    logoNatural &&
    logoNatural.complete &&
    logoNatural.naturalWidth > 0 &&
    admin.ok &&
    admin.panelVisible &&
    voteSectionVisible;

  console.log(
    JSON.stringify(
      {
        pass,
        fatal,
        fatalMsg: fatalMsg.trim(),
        logo: {
          visible: logoVisible,
          src: logoSrc,
          alt: logoAlt,
          box: logoBox,
          natural: logoNatural,
        },
        admin,
        vote: {
          sectionVisible: voteSectionVisible,
          heading: (voteHeading || "").trim(),
          playerListVisible,
        },
        favicon,
        errors,
      },
      null,
      2
    )
  );

  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error("PLAYWRIGHT_FAIL", e.message);
  process.exit(1);
});
