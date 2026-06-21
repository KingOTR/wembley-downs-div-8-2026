# Source migration (`src/`)

The live app still ships **`public/dist/app.min.js`** (minified, patched per release). New logic should be written here and built with esbuild — **not** via `tools/patch-app-vNNN.js`.

## Current modules

| File | Status | Notes |
|------|--------|-------|
| `vote-meta.js` | **Extracted** | `voteMetaByRound` patch logic; mirrors `__svPatchVoteMeta` in app.min.js v156 |

## Build

```bash
npm install          # installs esbuild
npm run build        # → public/dist-built/
```

Outputs are **not** wired into `index.html` until a module is ready to replace a dist bundle. That requires a version bump (`npm run bump -- NNN`).

## Migration order (suggested)

1. **vote-meta** — wire `dist-built/vote-meta.js` into app bootstrap; remove v156 patch hook
2. **voter-enhancements** — move from `public/dist/voter-enhancements.js` to `src/voter-enhancements/` (already ESM)
3. **name-match** — already ESM in dist; relocate to `src/name-match.js`
4. **app core** — largest piece; de-minify or rewrite admin/vote/lineup in `src/app/` with Firebase SDK imports
5. **Retire** `tools/patch-app-v*.js` and `tools/rebuild-app-v138.js`

## Future: Firestore `config/main` sharding

`config/main` holds all teams, squads, matches, and lineups in one document. At scale, shard by team or by round (e.g. `config/team1`, `config/team1_round9`). **Not implemented** — document-only; requires migration script + rules update.

## Editing workflow (target)

```
edit src/**/*.js  →  npm run build  →  npm run validate  →  npm run bump -- NNN  →  deploy
```

Do **not** edit `app.min.js` by hand or run patch scripts for new features.
