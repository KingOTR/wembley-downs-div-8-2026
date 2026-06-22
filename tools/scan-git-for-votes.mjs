/**
 * Scan entire git history for player vote payloads (voterName + picks + round).
 * Usage: node tools/scan-git-for-votes.mjs [--write data/votes-git-scan.json]
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const writePath = process.argv.includes("--write")
  ? process.argv[process.argv.indexOf("--write") + 1]
  : null;

function nameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function roundKey(round) {
  const h = String(round || "Round 1").trim();
  const m = h.match(/^round\s*(\d+(?:\.\d+)?)$/i) || h.match(/^(\d+(?:\.\d+)?)$/);
  return m ? "Round " + m[1] : h;
}

function voteDocId(v) {
  const teamId = v.teamId != null ? v.teamId : 1;
  const rk = nameKey(roundKey(v.round));
  const vk = v.voterNameKey || nameKey(v.voterName);
  return "t" + teamId + "_r" + rk + "_v" + vk;
}

function looksLikeVote(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!obj.voterName || typeof obj.voterName !== "string") return false;
  if (!Array.isArray(obj.picks) || obj.picks.length !== 3) return false;
  if (!obj.round) return false;
  return true;
}

function extractVotesFromText(text, source) {
  const found = [];
  const re = /\{[^{}]*"voterName"\s*:\s*"[^"]+"[^{}]*"picks"\s*:\s*\[[^\]]+\][^{}]*\}/g;
  let m;
  while ((m = re.exec(text))) {
    try {
      const obj = JSON.parse(m[0]);
      if (looksLikeVote(obj)) {
        found.push({ ...obj, _source: source });
      }
    } catch {}
  }
  return found;
}

console.log("Scanning git history for vote payloads…");
const log = execSync("git log --all -p --no-color", {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 200 * 1024 * 1024,
});

const raw = extractVotesFromText(log, "git-log-p");
const byId = Object.create(null);
for (const v of raw) {
  const norm = {
    teamId: v.teamId != null ? v.teamId : 1,
    round: roundKey(v.round),
    voterName: v.voterName,
    voterNameKey: v.voterNameKey || nameKey(v.voterName),
    picks: v.picks.map(String),
    submittedAt: v.submittedAt || "2026-01-01T00:00:00.000Z",
    nameMatchStatus: v.nameMatchStatus || "matched",
    tallyExcluded: !!v.tallyExcluded,
    recoveredFrom: v._source,
  };
  norm.id = voteDocId(norm);
  byId[norm.id] = norm;
}

const votes = Object.values(byId);
const byRound = {};
votes.forEach((v) => {
  byRound[v.round] = (byRound[v.round] || 0) + 1;
});

const report = {
  scannedAt: new Date().toISOString(),
  totalUnique: votes.length,
  byRound,
  votes,
  note:
    votes.length === 0
      ? "No player vote payloads with picks found in git history."
      : "Votes extracted from git log -p; verify before production restore.",
};

console.log("Unique votes found:", votes.length);
console.log("By round:", JSON.stringify(byRound, null, 2));

if (writePath) {
  writeFileSync(writePath, JSON.stringify(report, null, 2) + "\n");
  console.log("Wrote", writePath);
}
