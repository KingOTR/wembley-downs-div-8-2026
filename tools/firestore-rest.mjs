/** Firestore REST helpers for audit scripts (public read). */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function firebaseConfigFromApp() {
  const s = readFileSync(join(root, "public/dist/app.min.js"), "utf8");
  return {
    apiKey: s.match(/apiKey:"([^"]+)"/)?.[1] || "",
    projectId: s.match(/projectId:"([^"]+)"/)?.[1] || "wembley-downs-div-8-2026",
  };
}

export async function fetchFirestoreCollection(collection, projectId, apiKey) {
  const docs = [];
  let pageToken = "";
  do {
    const q = pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "";
    const url =
      "https://firestore.googleapis.com/v1/projects/" +
      encodeURIComponent(projectId) +
      "/databases/(default)/documents/" +
      encodeURIComponent(collection) +
      "?pageSize=300" +
      q +
      "&key=" +
      encodeURIComponent(apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        "Firestore " + collection + " list " + res.status + ": " + (await res.text()).slice(0, 200)
      );
    }
    const data = await res.json();
    (data.documents || []).forEach((doc) => {
      const id = doc.name.split("/").pop();
      const fields = doc.fields || {};
      const row = { id };
      for (const [k, v] of Object.entries(fields)) {
        if (v.stringValue != null) row[k] = v.stringValue;
        else if (v.integerValue != null) row[k] = parseInt(v.integerValue, 10);
        else if (v.doubleValue != null) row[k] = v.doubleValue;
        else if (v.booleanValue != null) row[k] = v.booleanValue;
        else if (v.arrayValue && v.arrayValue.values) {
          row[k] = v.arrayValue.values.map((x) => x.stringValue || "");
        }
      }
      docs.push(row);
    });
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return docs;
}

export async function fetchFirestoreVotes(projectId, apiKey) {
  return fetchFirestoreCollection("votes", projectId, apiKey);
}

export async function fetchFirestoreCoachVotes(projectId, apiKey) {
  return fetchFirestoreCollection("coachVotes", projectId, apiKey);
}
