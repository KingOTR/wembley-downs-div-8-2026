const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const root = join(__dirname, "..");
const PROJECT = "wembley-downs-div-8-2026";

if (!admin.getApps().length) admin.initializeApp({ projectId: PROJECT });
const db = getFirestore();
const votes = JSON.parse(readFileSync(join(root, "data/restored-votes.json"), "utf8")).votes;
const wantIds = new Set(votes.map((v) => v.id));

(async () => {
  let uploaded = 0;
  let updated = 0;
  for (const v of votes) {
    const ref = db.collection("votes").doc(v.id);
    const snap = await ref.get();
    const payload = {
      teamId: v.teamId,
      voterName: v.voterName,
      voterNameKey: v.voterNameKey,
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
