/**
 * Load before app.min.js so vote tally / doc keys can canonicalize aliases.
 */
import { canonicalPlayerName, normalizeName, formatGoalScorerList } from "./name-match.js?tag=v171";

window.__svCanonicalPlayerName = canonicalPlayerName;
window.__svNormalizeName = normalizeName;
window.__svFormatGoalScorerList = formatGoalScorerList;
