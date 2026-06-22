const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const FIREBASE_CLI_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

function firebaseToolsConfigPath() {
  const home = os.homedir();
  const paths = [
    path.join(home, ".config", "configstore", "firebase-tools.json"),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, "configstore", "firebase-tools.json")
      : "",
  ].filter(Boolean);
  return paths.find((p) => fs.existsSync(p));
}

function firebaseAdcDir() {
  if (process.platform.startsWith("win") && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "firebase");
  }
  return path.join(os.homedir(), ".config", "firebase");
}

function emailSlug(email) {
  return String(email || "unknown_user").replace("@", "_").replace(/\./g, "_");
}

function ensureFirestoreAdc() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;

  const gcloudAdc = path.join(
    os.homedir(),
    ".config",
    "gcloud",
    "application_default_credentials.json"
  );
  if (fs.existsSync(gcloudAdc)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = gcloudAdc;
    return;
  }

  const fbDir = firebaseAdcDir();
  if (fs.existsSync(fbDir)) {
    const hit = fs
      .readdirSync(fbDir)
      .find((f) => f.endsWith("_application_default_credentials.json"));
    if (hit) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(fbDir, hit);
      return;
    }
  }

  const storePath = firebaseToolsConfigPath();
  if (!storePath) return;
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const refresh = store.tokens && store.tokens.refresh_token;
  const email = store.user && store.user.email;
  if (!refresh || !email) return;

  if (!fs.existsSync(fbDir)) fs.mkdirSync(fbDir, { recursive: true });
  const credPath = path.join(
    fbDir,
    emailSlug(email) + "_application_default_credentials.json"
  );
  const cred = {
    type: "authorized_user",
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: refresh,
  };
  fs.writeFileSync(credPath, JSON.stringify(cred, null, 2));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}

module.exports = { ensureFirestoreAdc };
