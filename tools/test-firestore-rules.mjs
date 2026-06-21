/**
 * Firestore security rules unit tests (votes identity / doc-id binding).
 * Run: npm run test:rules
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(path.join(__dirname, "../firestore.rules"), "utf8");

const PROJECT = "wembley-downs-rules-test";

function emulatorHostPort() {
  const env = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  const [host, portStr] = env.split(":");
  return { host, port: parseInt(portStr, 10) || 8080 };
}

function validVote(overrides = {}) {
  return {
    teamId: 1,
    voterName: "Anna Smith",
    voterNameKey: "anna-smith",
    round: "Round 9",
    picks: ["Jay", "Uli", "Sarah"],
    submittedAt: new Date().toISOString(),
    ...overrides,
  };
}

const VOTE_ID = "t1_rround-9_vanna-smith";

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log("  OK", name);
}

function fail(name, err) {
  failed++;
  console.error("  FAIL", name, err?.message || err);
}

async function run() {
  const { host, port } = emulatorHostPort();
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules, host, port },
  });

  try {
    // --- unauthenticated voter ---
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "votes", VOTE_ID), validVote());
    });

    const anon = testEnv.unauthenticatedContext();

    try {
      await assertSucceeds(
        getDoc(doc(anon.firestore(), "votes", VOTE_ID))
      );
      ok("anonymous can read votes");
    } catch (e) {
      fail("anonymous can read votes", e);
    }

    try {
      await assertSucceeds(
        setDoc(
          doc(anon.firestore(), "votes", "t1_rround-9_vbob-jones"),
          validVote({
            voterName: "Bob Jones",
            voterNameKey: "bob-jones",
          })
        )
      );
      ok("create vote when doc id matches voterNameKey");
    } catch (e) {
      fail("create vote when doc id matches voterNameKey", e);
    }

    try {
      await assertFails(
        setDoc(
          doc(anon.firestore(), "votes", "t1_rround-9_vanna-smith"),
          validVote({
            voterName: "Impostor",
            voterNameKey: "impostor",
          })
        )
      );
      ok("create rejected when voterNameKey mismatches doc id suffix");
    } catch (e) {
      fail("create rejected when voterNameKey mismatches doc id suffix", e);
    }

    try {
      await assertFails(
        setDoc(
          doc(anon.firestore(), "votes", "t2_rround-9_vanna-smith"),
          validVote({ teamId: 1, voterNameKey: "anna-smith" })
        )
      );
      ok("create rejected when teamId mismatches doc id prefix");
    } catch (e) {
      fail("create rejected when teamId mismatches doc id prefix", e);
    }

    try {
      await assertSucceeds(
        updateDoc(doc(anon.firestore(), "votes", VOTE_ID), {
          picks: ["Jay", "Sarah", "Uli"],
          submittedAt: new Date().toISOString(),
          voterName: "Anna Smith",
          voterNameKey: "anna-smith",
          teamId: 1,
          round: "Round 9",
        })
      );
      ok("voter can update own ballot (same voterNameKey)");
    } catch (e) {
      fail("voter can update own ballot (same voterNameKey)", e);
    }

    try {
      await assertFails(
        updateDoc(doc(anon.firestore(), "votes", VOTE_ID), {
          picks: ["Jay", "Sarah", "Uli"],
          submittedAt: new Date().toISOString(),
          voterName: "Hacker",
          voterNameKey: "hacker",
          teamId: 1,
          round: "Round 9",
        })
      );
      ok("update rejected when changing voterNameKey");
    } catch (e) {
      fail("update rejected when changing voterNameKey", e);
    }

    try {
      await assertFails(
        deleteDoc(doc(anon.firestore(), "votes", VOTE_ID))
      );
      ok("anonymous cannot delete votes");
    } catch (e) {
      fail("anonymous cannot delete votes", e);
    }

    // --- super admin ---
    const admin = testEnv.authenticatedContext("admin1", {
      email: "sydneywilliam29@gmail.com",
    });

    try {
      await assertSucceeds(
        deleteDoc(doc(admin.firestore(), "votes", VOTE_ID))
      );
      ok("super admin can delete votes");
    } catch (e) {
      fail("super admin can delete votes", e);
    }
  } finally {
    await testEnv.cleanup();
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failed) process.exit(1);
  console.log("Firestore rules tests OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
