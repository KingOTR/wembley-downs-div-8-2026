/**
 * Admin diagnostics: round dropdown count, voted/hasn't counts, squad, auth state.
 * Usage: node tools/admin-check.js [baseUrl]
 */
const { chromium } = require("playwright");

const base = process.argv[2] || "https://wembley-downs-div-8-2026.web.app";

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
      /* try next */
    }
  }
  if (!browser) throw new Error("No Playwright browser available");

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(base + "/?t=" + Date.now(), {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(6000);

  await page.click("#showAdminBtn").catch((e) => errors.push("admin open: " + e.message));
  await page.waitForTimeout(1500);

  const report = await page.evaluate(async () => {
    const out = {
      fatalVisible: false,
      adminPanelVisible: false,
      superAdminUnlocked: false,
      firebaseApp: !!window.__svFirebaseApp,
      authUser: !!(window.__svAuth && window.__svAuth.currentUser),
      mergeSourceRoundCount: 0,
      mergeDestRoundCount: 0,
      mergeHint: "",
      resultsTeamOptions: 0,
      resultsRoundOptions: 0,
      whoVotedBlock: false,
      whoHasntBlock: false,
      squadCount: 0,
      localVoteCount: 0,
    };

    try {
      out.fatalVisible =
        document.getElementById("fatalBanner") &&
        getComputedStyle(document.getElementById("fatalBanner")).display !== "none";
    } catch {}

    const panel = document.getElementById("adminPanel");
    out.adminPanelVisible = !!(panel && panel.classList.contains("visible"));

    try {
      out.superAdminUnlocked = sessionStorage.getItem("soccerVoteAdminUnlock") === "1";
    } catch {}

    const src = document.getElementById("mergeSourceRound");
    const dst = document.getElementById("mergeDestRound");
    if (src) out.mergeSourceRoundCount = src.options.length;
    if (dst) out.mergeDestRoundCount = dst.options.length;
    const hint = document.getElementById("mergeRoundsHint");
    if (hint) out.mergeHint = hint.textContent || "";

    const rTeam = document.getElementById("resultsTeamSelect");
    const rRound = document.getElementById("resultsRoundSelect");
    if (rTeam) out.resultsTeamOptions = rTeam.options.length;
    if (rRound) out.resultsRoundOptions = rRound.options.length;

    out.whoVotedBlock = !!document.getElementById("whoVotedList");
    out.whoHasntBlock = !!document.getElementById("whoHasntVotedList");

    try {
      const raw = localStorage.getItem("soccerVoteApp_v2");
      const data = raw ? JSON.parse(raw) : { teams: [], votes: [] };
      out.localVoteCount = (data.votes || []).length;
      const teamId = rTeam ? parseInt(rTeam.value, 10) || 1 : 1;
      const team = (data.teams || []).find((t) => String(t.id) === String(teamId));
      out.squadCount = team && team.players ? team.players.filter(Boolean).length : 0;
    } catch {}

    return out;
  });

  console.log(JSON.stringify({ base, report, errors }, null, 2));
  await browser.close();

  const ok =
    !report.fatalVisible &&
    report.adminPanelVisible &&
    report.firebaseApp &&
    report.mergeSourceRoundCount > 0;

  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error("ADMIN_CHECK_FAIL", e.message);
  process.exit(1);
});
