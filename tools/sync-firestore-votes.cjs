const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const root = join(__dirname, "..");
const PROJECT = "wembley-downs-div-8-2026";

function voteRoundLabel(v) {
  const r = String((v && v.round) || "").trim();
  const m = r.match(/round\s*(\d+)/i);
  return m ? "round-" + m[1] : r.toLowerCase().replace(/\s+/g, "-");
}

(async () => {
  const nm = await import(pathToFileURL(join(root, "public/dist/name-match.js")).href);
  const { dedupeBallotDocsOnePerVoter, voterNameKey } = nm;

  if (!admin.getApps().length) admin.initializeApp({ projectId: PROJECT });
  const db = getFirestore();
  const archive = JSON.parse(readFileSync(join(root, "data/restored-votes.json"), "utf8"));
  let votes = archive.votes || [];

  const byRound = Object.create(null);
  votes.forEach((v) => {
    if (!v) return;
    const rk = voteRoundLabel(v);
    const key = String(v.teamId != null ? v.teamId : 1) + "|" + rk;
    if (!byRound[key]) byRound[key] = { teamId: v.teamId != null ? v.teamId : 1, round: v.round, list: [] };
    byRound[key].list.push(v);
  });
  const deduped = [];
  Object.keys(byRound).forEach((key) => {
    const bucket = byRound[key];
    const out = dedupeBallotDocsOnePerVoter(bucket.list, bucket.teamId, bucket.round, voteRoundLabel);
    deduped.push(...(out.votesForTally || []));
  });
  votes = deduped;
  const wantIds = new Set(votes.map((v) => v.id));

  let uploaded = 0;
  let updated = 0;
  for (const v of votes) {
    const ref = db.collection("votes").doc(v.id);
    const snap = await ref.get();
    const payload = {
      teamId: v.teamId,
      voterName: v.voterName,
      voterNameKey: v.voterNameKey || voterNameKey(v.voterName),
      round: v.round,
      picks: v.picks,
      submittedAt: v.submittedAt,
      nameMatchStatus: v.nameMatchStatus,
      tallyExcluded: v.tallyExcluded,
      recoveredFrom: v.recoveredFrom,
    };
    if (!snap.exists) {
      await ref.set(payload);
      uploaded++;
    } else {
      await ref.set(payload);
      updated++;
    }
  }

  const snap = await db.collection("votes").where("teamId", "==", 1).get();
  let deleted = 0;
  for (const doc of snap.docs) {
    if (!wantIds.has(doc.id)) {
      await doc.ref.delete();
      deleted++;
    }
  }
  console.log(JSON.stringify({ uploaded, updated, deleted, total: votes.length }));

  const elke = await db.collection("votes").doc("t1_rround-9_velke").get();
  console.log(
    "t1_rround-9_velke:",
    elke.exists,
    elke.exists ? elke.data().voterName : null,
    elke.exists ? elke.data().picks : null
  );
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
