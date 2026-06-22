/**
 * Tests coach-vote latest-round copy plan/apply behavior.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const enhPath = join(here, "../public/dist/voter-enhancements.js");
const enh = fs.readFileSync(enhPath, "utf8");

function extractFn(name) {
  const start = enh.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  let depth = 0;
  let i = enh.indexOf("{", start);
  for (; i < enh.length; i++) {
    if (enh[i] === "{") depth++;
    else if (enh[i] === "}") {
      depth--;
      if (depth === 0) return enh.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

function normalizeRoundLabel(c) {
  var l = String(c ?? "").trim();
  if (!l) return "";
  l = l.replace(/\s+/g, " ").trim();
  var h = l.match(/^round\s*(\d+(?:\.\d+)?)$/i);
  if (h) return "Round " + h[1];
  var m = l.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return "Round " + m[1];
  var f = l.match(/^round\s+(\d+(?:\.\d+)?)(.*)$/i);
  return f ? ("Round " + f[1] + (f[2] || "")).replace(/\s+/g, " ").trim() : l;
}

function voteRoundLabel(vote) {
  var l = vote && vote.round;
  if (l == null || l === "") return "Round 1";
  return normalizeRoundLabel(l) || "Round 1";
}

const { planCoachVotesRoundCopy, applyCoachVotesLocalCopyPlan } = new Function(
  "normalizeRoundLabel",
  "voteRoundLabel",
  extractFn("planCoachVotesRoundCopy") +
    ";" +
    extractFn("applyCoachVotesLocalCopyPlan") +
    "; return { planCoachVotesRoundCopy, applyCoachVotesLocalCopyPlan };"
)(normalizeRoundLabel, voteRoundLabel);

function makeDocId(teamId, roundLabel, slot) {
  return (
    "c" +
    String(teamId) +
    "_r" +
    normalizeRoundLabel(roundLabel) +
    "_s" +
    parseInt(slot, 10)
  );
}

const coachVotes = [
  {
    teamId: 1,
    slot: 1,
    round: "Round 8",
    picks: ["Player A", "Player B", "Player C"],
    submittedAt: "2026-06-10T10:00:00.000Z",
    id: makeDocId(1, "Round 8", 1),
  },
  {
    teamId: 1,
    slot: 2,
    round: "Round 8",
    picks: ["Player D", "Player E", "Player F"],
    submittedAt: "2026-06-11T10:00:00.000Z",
    id: makeDocId(1, "Round 8", 2),
  },
  // Destination already has slot 1.
  {
    teamId: 1,
    slot: 1,
    round: "Round 9",
    picks: ["Player A2", "Player B2", "Player C2"],
    submittedAt: "2026-06-12T10:00:00.000Z",
    id: makeDocId(1, "Round 9", 1),
  },
];

const plan = planCoachVotesRoundCopy(1, "Round 8", "Round 9", coachVotes, makeDocId);
if (plan.fromRound !== "Round 8" || plan.toRound !== "Round 9") {
  throw new Error("Unexpected normalized from/to rounds");
}
if (plan.copies.length !== 1) {
  throw new Error("Expected exactly one copy (slot 2 only)");
}
if (plan.copies[0].slot !== 2) {
  throw new Error("Expected copy for slot 2");
}
if (!String(plan.copies[0].toDocId).includes("_s2")) {
  throw new Error("Expected doc id to include slot 2");
}

const next = applyCoachVotesLocalCopyPlan(coachVotes, plan, { deleteOld: false });
const hasNewSlot2 =
  next.find((v) => v && v.teamId === 1 && v.slot === 2 && voteRoundLabel(v) === "Round 9") != null;
if (!hasNewSlot2) throw new Error("Expected local slot-2 vote to be copied to Round 9");

const stillHasOldSlot2 =
  next.find((v) => v && v.teamId === 1 && v.slot === 2 && voteRoundLabel(v) === "Round 8") != null;
if (!stillHasOldSlot2) throw new Error("Expected old slot-2 vote to remain when deleteOld=false");

const nextMoved = applyCoachVotesLocalCopyPlan(coachVotes, plan, { deleteOld: true });
const hasOldSlot2AfterMove =
  nextMoved.find((v) => v && v.teamId === 1 && v.slot === 2 && voteRoundLabel(v) === "Round 8") != null;
if (hasOldSlot2AfterMove) throw new Error("Expected old slot-2 vote removed when deleteOld=true");

console.log("coach-votes-reschedule-mapping test OK");

