/**
 * Vote recovery: scan git history, load seed JSON, snapshot Firestore, optional upload.
 *
 * Usage:
 *   node tools/restore-votes-from-git.mjs              # report only
 *   node tools/restore-votes-from-git.mjs --write-seed # write data/votes-seed.json + report
 *   node tools/restore-votes-from-git.mjs --upload     # upload seed to Firestore (needs ADC / gcloud auth)
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dataDir = join(root, "data");
const PROJECT = "wembley-downs-div-8-2026";
const writeSeed = process.argv.includes("--write-seed");
const doUpload = process.argv.includes("--upload");

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
  return (
    "t" +
    teamId +
    "_r" +
    nameKey(roundKey(v.round)) +
    "_v" +
    (v.voterNameKey || nameKey(v.voterName))
  );
}

function coachDocId(v) {
  const teamId = v.teamId != null ? v.teamId : 1;
  return (
    "c" +
    teamId +
    "_r" +
    nameKey(roundKey(v.round)) +
    "_s" +
    String(v.slot != null ? v.slot : 1)
  );
}

function normalizeVote(v, source) {
  if (!v || !v.voterName || !Array.isArray(v.picks) || v.picks.length !== 3) return null;
  const out = {
    teamId: v.teamId != null ? Number(v.teamId) : 1,
    round: roundKey(v.round),
    voterName: String(v.voterName),
    voterNameKey: v.voterNameKey || nameKey(v.voterName),
    picks: v.picks.map(String),
    submittedAt: v.submittedAt || new Date().toISOString(),
    nameMatchStatus: v.nameMatchStatus || "matched",
    tallyExcluded: v.tallyExcluded === true,
    recoveredFrom: source,
  };
  out.id = v.id && /^t\d+_r.+_v[a-z0-9-]+$/i.test(v.id) ? v.id : voteDocId(out);
  return out;
}

function normalizeCoach(v, source) {
  if (!v || v.slot == null || !Array.isArray(v.picks) || v.picks.length !== 3) return null;
  const out = {
    teamId: v.teamId != null ? Number(v.teamId) : 1,
    slot: parseInt(v.slot, 10) || 1,
    round: roundKey(v.round),
    picks: v.picks.map(String),
    submittedAt: v.submittedAt || new Date().toISOString(),
    recoveredFrom: source,
  };
  out.id =
    v.id && /^c\d+_r.+_s\d+$/i.test(v.id) ? v.id : coachDocId(out);
  return out;
}

function loadJsonSeeds() {
  const votes = [];
  const coachVotes = [];
  if (!existsSync(dataDir)) return { votes, coachVotes };
  for (const file of readdirSync(dataDir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dataDir, file);
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const list = raw.votes || (Array.isArray(raw) ? raw : []);
      const clist = raw.coachVotes || [];
      list.forEach((v) => {
        const n = normalizeVote(v, "data/" + file);
        if (n) votes.push(n);
      });
      clist.forEach((v) => {
        const n = normalizeCoach(v, "data/" + file);
        if (n) coachVotes.push(n);
      });
      if (raw.exportVersion && raw.votes) {
        raw.votes.forEach((v) => {
          const n = normalizeVote(v, "archive:" + file);
          if (n) votes.push(n);
        });
        (raw.coachVotes || []).forEach((v) => {
          const n = normalizeCoach(v, "archive:" + file);
          if (n) coachVotes.push(n);
        });
      }
    } catch (e) {
      console.warn("skip", file, e.message);
    }
  }
  return { votes, coachVotes };
}

function dedupeVotes(list) {
  const byId = Object.create(null);
  list.forEach((v) => {
    if (v && v.id) byId[v.id] = v;
  });
  return Object.values(byId);
}

function parseFsValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if (v.arrayValue?.values) return v.arrayValue.values.map(parseFsValue);
  if (v.mapValue?.fields) {
    const out = {};
    Object.keys(v.mapValue.fields).forEach((k) => {
      out[k] = parseFsValue(v.mapValue.fields[k]);
    });
    return out;
  }
  return null;
}

async function fetchCollection(col) {
  const all = [];
  let url =
    "https://firestore.googleapis.com/v1/projects/" +
    PROJECT +
    "/databases/(default)/documents/" +
    col +
    "?pageSize=300";
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    all.push(...(data.documents || []));
    url = data.nextPageToken
      ? "https://firestore.googleapis.com/v1/projects/" +
        PROJECT +
        "/databases/(default)/documents/" +
        col +
        "?pageSize=300&pageToken=" +
        data.nextPageToken
      : null;
  }
  return all;
}

async function snapshotFirestore() {
  const [voteDocs, coachDocs] = await Promise.all([
    fetchCollection("votes"),
    fetchCollection("coachVotes"),
  ]);
  const votes = voteDocs.map((d) => {
    const f = parseFsValue({ mapValue: { fields: d.fields } });
    return normalizeVote(
      Object.assign({}, f, { id: d.name.split("/").pop() }),
      "firestore-live"
    );
  }).filter(Boolean);
  const coachVotes = coachDocs.map((d) => {
    const f = parseFsValue({ mapValue: { fields: d.fields } });
    return normalizeCoach(
      Object.assign({}, f, { id: d.name.split("/").pop() }),
      "firestore-live"
    );
  }).filter(Boolean);
  return { votes, coachVotes };
}

function scanGitLog() {
  console.log("Scanning git log for vote payloads…");
  const log = execSync("git log --all -p --no-color", {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });
  const found = [];
  const re =
    /\{[^{}]*"voterName"\s*:\s*"[^"]+"[^{}]*"picks"\s*:\s*\[[^\]]+\][^{}]*\}/g;
  let m;
  while ((m = re.exec(log))) {
    try {
      const obj = JSON.parse(m[0]);
      const n = normalizeVote(obj, "git-log");
      if (n) found.push(n);
    } catch {}
  }
  return dedupeVotes(found);
}

function countByRound(votes) {
  const byRound = {};
  votes.forEach((v) => {
    byRound[v.round] = (byRound[v.round] || 0) + 1;
  });
  return byRound;
}

async function uploadVotes(votes, coachVotes) {
  let admin;
  try {
    const mod = await import("firebase-admin");
    admin = mod.default;
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT });
    }
  } catch (e) {
    throw new Error(
      "firebase-admin init failed — run: gcloud auth application-default login"
    );
  }
  const db = admin.firestore();
  let playerUploaded = 0;
  let coachUploaded = 0;
  for (const v of votes) {
    const ref = db.collection("votes").doc(v.id);
    const snap = await ref.get();
    if (snap.exists) continue;
    await ref.set({
      teamId: v.teamId,
      voterName: v.voterName,
      voterNameKey: v.voterNameKey,
      round: v.round,
      picks: v.picks,
      submittedAt: v.submittedAt,
      nameMatchStatus: v.nameMatchStatus,
      tallyExcluded: v.tallyExcluded,
      recoveredFrom: v.recoveredFrom,
    });
    playerUploaded++;
  }
  for (const cv of coachVotes) {
    const ref = db.collection("coachVotes").doc(cv.id);
    const snap = await ref.get();
    if (snap.exists) continue;
    await ref.set({
      teamId: cv.teamId,
      slot: cv.slot,
      round: cv.round,
      picks: cv.picks,
      submittedAt: cv.submittedAt,
      recoveredFrom: cv.recoveredFrom,
    });
    coachUploaded++;
  }
  return { playerUploaded, coachUploaded };
}

const gitVotes = scanGitLog();
const seedFiles = loadJsonSeeds();
const firestore = await snapshotFirestore();

const mergedVotes = dedupeVotes([
  ...gitVotes,
  ...seedFiles.votes,
  ...firestore.votes,
]);
const mergedCoach = dedupeVotes([
  ...seedFiles.coachVotes,
  ...firestore.coachVotes,
]);

const report = {
  generatedAt: new Date().toISOString(),
  project: PROJECT,
  sources: {
    gitLogPlayerVotes: gitVotes.length,
    dataDirPlayerVotes: seedFiles.votes.length,
    firestorePlayerVotes: firestore.votes.length,
    firestoreCoachVotes: firestore.coachVotes.length,
  },
  playerVotesByRound: countByRound(mergedVotes),
  coachVotesByRound: countByRound(mergedCoach),
  recoverablePlayerTotal: mergedVotes.length,
  recoverableCoachTotal: mergedCoach.length,
  gitSearchNote:
    gitVotes.length === 0
      ? "No player vote payloads (voterName + 3 picks) found anywhere in git history."
      : null,
  firestoreNote:
    firestore.votes.length === 0
      ? "Firestore votes/ collection is empty. Player ballots must be imported from a season archive JSON (Download season archive) or another device's localStorage."
      : null,
  rounds1to9Player: Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => {
      const rk = "Round " + (i + 1);
      return [rk, countByRound(mergedVotes)[rk] || 0];
    })
  ),
};

console.log(JSON.stringify(report, null, 2));

mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "votes-recovery-report.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(
  join(dataDir, "coach-votes-firestore-snapshot.json"),
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      coachVotes: firestore.coachVotes,
    },
    null,
    2
  ) + "\n"
);

const seed = {
  exportVersion: 1,
  exportedAt: new Date().toISOString(),
  source: "tools/restore-votes-from-git.mjs",
  recoveryNote:
    mergedVotes.length === 0
      ? "No player votes recovered from git or data/*.json. Import a season archive JSON via Admin → Import votes."
      : "Merged from git + data/ + Firestore snapshot.",
  votes: mergedVotes,
  coachVotes: mergedCoach.filter((c) => !/^c\d+_r.+_s\d+$/i.test(c.id)),
};

if (writeSeed || mergedVotes.length > 0) {
  mkdirSync(join(root, "public/data"), { recursive: true });
  writeFileSync(join(dataDir, "votes-seed.json"), JSON.stringify(seed, null, 2) + "\n");
  writeFileSync(
    join(root, "public/data/votes-seed.json"),
    JSON.stringify(seed, null, 2) + "\n"
  );
  console.log("Wrote data/votes-seed.json and public/data/votes-seed.json");
} else {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "votes-seed.json"),
    JSON.stringify(seed, null, 2) + "\n"
  );
  console.log("Wrote data/votes-seed.json (no player votes — import archive to restore)");
}

if (doUpload) {
  if (!mergedVotes.length && !seed.coachVotes.length) {
    console.error("Nothing to upload.");
    process.exit(1);
  }
  const up = await uploadVotes(mergedVotes, seed.coachVotes);
  console.log("Uploaded:", up);
}
