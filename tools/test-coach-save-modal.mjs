import { readFileSync } from "fs";
import { resolveCoachSlotForVoterName } from "../public/dist/name-match.js";

const enh = readFileSync("public/dist/voter-enhancements.js", "utf8");
if (!enh.includes("wireCoachVoteSaveModal")) {
  throw new Error("voter-enhancements missing wireCoachVoteSaveModal");
}
if (!enh.includes('addEventListener("sv-coach-vote-saved"')) {
  throw new Error("voter-enhancements missing sv-coach-vote-saved listener");
}

const html = readFileSync("public/index.html", "utf8");
if (!html.includes("sv-coach-save-modal")) {
  throw new Error("index.html missing coach save modal CSS");
}
if (!html.includes("--content-max")) {
  throw new Error("index.html missing centered content column token");
}

var team = { coach1Name: "Will", coach2Name: "Chris" };
var willSlot = resolveCoachSlotForVoterName("Will", team);
var chrisSlot = resolveCoachSlotForVoterName("Chris", team);
if (!willSlot || willSlot.slot !== 1) throw new Error("Will should be coach slot 1");
if (!chrisSlot || chrisSlot.slot !== 2) throw new Error("Chris should be coach slot 2");
if (resolveCoachSlotForVoterName("Jordan", team)) {
  throw new Error("normal player should not resolve coach slot");
}

console.log("coach-save-modal smoke test OK");
