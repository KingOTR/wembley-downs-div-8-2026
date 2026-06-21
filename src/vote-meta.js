/**
 * Vote metadata per round (exclusions + ballot→squad aliases).
 * Source of truth for migration off app.min.js patch hooks (__svPatchVoteMeta).
 *
 * @typedef {{ excluded: string[], aliases: Record<string, string> }} VoteMetaRound
 * @typedef {Record<string, VoteMetaRound>} VoteMetaByRound
 */

/** Normalize ballot alias key (matches app.min.js / name-match strip). */
export function ballotAliasKey(name) {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+(goalkeeper|gk|captain|capt|c)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function displayName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** @returns {VoteMetaRound} */
export function emptyVoteMetaRound() {
  return { excluded: [], aliases: {} };
}

/** @returns {VoteMetaRound} */
export function getVoteMetaRound(team, roundKey) {
  if (!team || !team.voteMetaByRound) return emptyVoteMetaRound();
  const meta = team.voteMetaByRound[roundKey] || {};
  return {
    excluded: Array.isArray(meta.excluded) ? meta.excluded.slice() : [],
    aliases:
      meta.aliases && typeof meta.aliases === "object"
        ? { ...meta.aliases }
        : {},
  };
}

/**
 * Apply patch to team.voteMetaByRound[roundKey] (mutates team).
 * @param {object} team
 * @param {string} roundKey
 * @param {{ excluded?: string[], aliases?: Record<string,string>, addAlias?: { from: string, to: string } }} patch
 */
export function patchVoteMeta(team, roundKey, patch) {
  if (!team) return;
  team.voteMetaByRound = team.voteMetaByRound || {};
  const cur = getVoteMetaRound(team, roundKey);
  if (patch.excluded) cur.excluded = patch.excluded.slice();
  if (patch.aliases) Object.assign(cur.aliases, patch.aliases);
  if (patch.addAlias?.from && patch.addAlias?.to) {
    cur.aliases[ballotAliasKey(patch.addAlias.from)] = displayName(patch.addAlias.to);
  }
  team.voteMetaByRound[roundKey] = cur;
}

/**
 * Browser hook shape (drop-in for window.__svPatchVoteMeta).
 * @param {object} ctx — { getTeam, normalizeRound, saveLocal }
 */
export function createVoteMetaHook(ctx) {
  return function patchVoteMetaHook(teamId, round, patch) {
    try {
      const team = ctx.getTeam(teamId);
      if (!team) return;
      const rk = ctx.normalizeRound(round) || round;
      patchVoteMeta(team, rk, patch);
      ctx.saveLocal();
    } catch (e) {
      console.warn("[sv] patch voteMeta", e);
    }
  };
}
