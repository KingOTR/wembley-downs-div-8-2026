/**
 * Reproduce 8→0 vote path: Ds() mv() drops votes without id;
 * Fa() round list omits rounds only in localStorage.
 */
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const nm = await import(pathToFileURL(join(here, "../public/dist/name-match.js")).href);

// Simulate Ds() mv() from v177
function dsMerge(teamId, cloudVotes, inMemoryVotes, localStorageVotes) {
  var byId = Object.create(null);
  function mv(v) {
    if (!v || !v.id || String(v.teamId) !== String(teamId)) return;
    byId[v.id] = v;
  }
  (inMemoryVotes || []).forEach(mv);
  (cloudVotes || []).forEach(mv);
  (localStorageVotes || []).forEach(mv);
  return Object.keys(byId).map(function (k) {
    return byId[k];
  });
}

const eightVotesNoId = ["Jay", "Anna", "Uli", "Bob", "Carol", "Dave", "Eve", "Frank"].map(
  function (name) {
    return {
      teamId: 1,
      round: "Round 9",
      voterName: name,
      submittedAt: "2026-06-01T10:00:00.000Z",
      picks: ["Bob", "Carol", "Dave"],
      nameMatchStatus: "matched",
      tallyExcluded: false,
    };
  }
);

const eightVotesWithId = eightVotesNoId.map(function (v) {
  return Object.assign({}, v, {
    id: "t1_rround-9_v" + v.voterName.toLowerCase(),
  });
});

const mergedNoId = dsMerge(1, [], [], eightVotesNoId);
const mergedWithId = dsMerge(1, [], [], eightVotesWithId);

console.log("Ds merge without ids:", mergedNoId.length, "(expected 0 — ROOT CAUSE)");
console.log("Ds merge with ids:", mergedWithId.length, "(expected 8)");

// Simulate Fa/Jh round list when U.votes empty
function We(v) {
  var l = v && v.round;
  if (l == null || l === "") return "Round 1";
  var h = String(l).trim().replace(/\s+/g, " ");
  var m = h.match(/^round\s*(\d+(?:\.\d+)?)$/i);
  if (m) return "Round " + m[1];
  m = h.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return "Round " + m[1];
  return h || "Round 1";
}

function Jh(teamId, votes) {
  var h = {};
  (votes || []).forEach(function (E) {
    if (!E || String(E.teamId) !== String(teamId)) return;
    var b = We(E) || "Round 1";
    h[b] = true;
  });
  return Object.keys(h).sort();
}

const roundsFromEmpty = Jh(1, []);
const roundsFromLocal = Jh(1, eightVotesWithId);
console.log("Jh rounds when U.votes empty:", roundsFromEmpty);
console.log("Jh rounds when U.votes has votes:", roundsFromLocal);
