/**
 * Load before app.min.js so vote tally / doc keys can canonicalize aliases.
 */
import { canonicalPlayerName, normalizeName } from "./name-match.js?tag=v139";

window.__svCanonicalPlayerName = canonicalPlayerName;
window.__svNormalizeName = normalizeName;
