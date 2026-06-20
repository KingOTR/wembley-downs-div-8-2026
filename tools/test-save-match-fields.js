/**
 * Test kickoff, review, scores persist via Save team & round (localStorage).
 */
const { chromium } = require("playwright");

const base = process.argv[2] || "http://127.0.0.1:4173";

const ROUND = "Round 1";
const KICKOFF = "2026-07-12T10:30";
const REVIEW = "E2E match review v147 " + Date.now();
const OPP = "Test Opponent FC v147";
const OUR = "5";
const OPP_SC = "2";

(async () => {
  const browser = await chromium
    .launch({ headless: true, channel: "msedge" })
    .catch(() => chromium.launch({ headless: true, channel: "chrome" }))
    .catch(() => chromium.launch({ headless: true }));

  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(base + "/?t=" + Date.now(), {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(4000);

  await page.click("#showAdminBtn").catch(() => {});
  await page.evaluate(() => {
    sessionStorage.setItem("soccerVoteAdminUnlock", "1");
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.__svMatchSavedPromise = new Promise((resolve) => {
      window.addEventListener(
        "sv-match-saved",
        (e) => resolve(e.detail || {}),
        { once: true }
      );
    });
  });

  const fillAndSave = await page.evaluate(
    ({ ROUND, KICKOFF, REVIEW, OPP, OUR, OPP_SC }) => {
      const kick = document.getElementById("matchKickoffInput");
      const review = document.getElementById("matchReviewInput");
      const opp = document.getElementById("matchOpponentInput");
      const our = document.getElementById("matchOurScoreInput");
      const oppSc = document.getElementById("matchOppScoreInput");
      const save = document.getElementById("saveRound");
      const roundSel = document.getElementById("adminMatchRoundSelect");
      if (!kick || !review || !save) {
        return {
          ok: false,
          reason: "missing inputs",
          kick: !!kick,
          review: !!review,
          save: !!save,
        };
      }
      if (roundSel) {
        const want = ROUND;
        let matched = false;
        for (let i = 0; i < roundSel.options.length; i++) {
          if (roundSel.options[i].value === want) {
            roundSel.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) roundSel.value = want;
        roundSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      kick.value = KICKOFF;
      review.value = REVIEW;
      if (opp) opp.value = OPP;
      if (our) our.value = OUR;
      if (oppSc) oppSc.value = OPP_SC;
      const before = localStorage.getItem("soccerVoteApp_v2");
      const roundAtSave =
        (document.getElementById("adminMatchRoundSelect") || {}).value || "";
      save.click();
      return {
        ok: true,
        saveBound: !!save._svBound,
        kickVal: kick.value,
        reviewVal: review.value,
        roundAtSave,
        beforeLen: before ? before.length : 0,
      };
    },
    { ROUND, KICKOFF, REVIEW, OPP, OUR, OPP_SC }
  );

  const saveEvent = await page.evaluate(async () => {
    if (!window.__svMatchSavedPromise) return { missing: true };
    return Promise.race([
      window.__svMatchSavedPromise,
      new Promise((r) => setTimeout(() => r({ timeout: true }), 8000)),
    ]);
  });

  const saveRound =
    (saveEvent && saveEvent.round && String(saveEvent.round)) || ROUND;

  const afterSave = await page.evaluate(
    ({ saveRound }) => {
      let data;
      try {
        data = JSON.parse(localStorage.getItem("soccerVoteApp_v2") || "{}");
      } catch {
        return { parseError: true };
      }
      const teamId = parseInt(
        (document.getElementById("adminTeamTabs") &&
          document.getElementById("adminTeamTabs").value) ||
          "1",
        10
      );
      const team =
        (data.teams || []).find((t) => t && t.id === teamId) ||
        (data.teams || [])[0];
      const m = team && team.matchesByRound && team.matchesByRound[saveRound];
      const err = document.getElementById("adminOpErr");
      return {
        teamId: team && team.id,
        kickoff: m && m.kickoff,
        review: m && m.review,
        opponent: m && m.opponent,
        ourScore: m && m.ourScore,
        oppScore: m && m.oppScore,
        saveRound,
        roundKeys: team && team.matchesByRound ? Object.keys(team.matchesByRound) : [],
        adminOpErr: err ? err.textContent : "",
      };
    },
    { saveRound }
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.click("#showAdminBtn").catch(() => {});
  await page.evaluate(() => {
    sessionStorage.setItem("soccerVoteAdminUnlock", "1");
  });
  await page.waitForTimeout(3000);

  const afterReload = await page.evaluate(
    ({ saveRound, KICKOFF, REVIEW, OPP, OUR, OPP_SC }) => {
      const kick = document.getElementById("matchKickoffInput");
      const review = document.getElementById("matchReviewInput");
      const opp = document.getElementById("matchOpponentInput");
      const our = document.getElementById("matchOurScoreInput");
      const oppSc = document.getElementById("matchOppScoreInput");
      const roundSel = document.getElementById("adminMatchRoundSelect");
      if (roundSel) {
        roundSel.value = saveRound;
        roundSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return {
        kickoff: kick && kick.value,
        review: review && review.value,
        opponent: opp && opp.value,
        ourScore: our && our.value,
        oppScore: oppSc && oppSc.value,
        kickMatch: kick && kick.value === KICKOFF,
        reviewMatch: review && review.value === REVIEW,
        oppMatch: opp && opp.value === OPP,
      };
    },
    { saveRound, KICKOFF, REVIEW, OPP, OUR, OPP_SC }
  );

  const pass =
    saveRound === ROUND &&
    afterSave.kickoff === KICKOFF &&
    afterSave.review === REVIEW &&
    afterSave.opponent === OPP &&
    afterSave.ourScore === 5 &&
    afterSave.oppScore === 2 &&
    afterReload.kickMatch &&
    afterReload.reviewMatch &&
    afterReload.oppMatch;

  console.log(
    JSON.stringify(
      { fillAndSave, saveEvent, afterSave, afterReload, pass, errors },
      null,
      2
    )
  );
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
