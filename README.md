# Wembley Downs Div 8 2026 — Team Player Vote

Static single-page app for team player-of-the-match voting, hosted on [Firebase Hosting](https://wembley-downs-div-8-2026.web.app/).

**Current version:** v168

## Build workflow (new — prefer over patch chain)

The **patch chain is frozen at v158** (`tools/patch-app-v*.js` — no new patch files). New logic goes in `src/`:

```bash
npm install
npm run build          # esbuild src/*.js → public/dist-built/ (not wired to index yet)
npm run validate
npm run bump -- 157    # when ready to ship dist/index changes
```

See `src/README.md` for migration order. Live app still uses `public/dist/app.min.js` until modules are wired.

| Script | Purpose |
|--------|---------|
| `npm run build` | esbuild compile `src/` → `public/dist-built/` |
| `npm run bump -- NNN` | Bump all `?tag=vNNN`, `CACHE_VERSION`, `sw.js?v=` |
| `npm run test:rules` | Firestore rules unit tests (vote doc-id binding) |

Legacy: `node tools/bump-version.js 157` (same as `npm run bump -- 157`). Old `bump-vNNN.js` / `patch-app-vNNN.js` are deprecated.

## Architecture

```
public/
  index.html              Shell: Iwanoff design tokens, boot skeleton, lazy admin template
  manifest.json           PWA manifest (name, theme #EE2B33, logo icons)
  sw.js                   Service worker (precache shell + network-first /dist/*)
  wembley-downs-logo.png  Club logo (header, favicon, PWA icons)
  dist/
    app.min.js            Main app (Firebase, voting, coach/admin, lineup)
    voter-enhancements.js Companion: already-voted, offline queue, who hasn't voted, participation, theme
    admin-merge-rounds.js Lazy-loaded super-admin round merge (REST batch writes)
    name-match.js         Shared fuzzy squad/voter name matching + aliases
    lineup-fotmob.js      Lineup tab (formation, weather, FotMob-style pitch)
    weather-forecast.js   Open-Meteo match-day weather panel
    location-autocomplete.js  WA grounds autocomplete for match venue
    wa-grounds-data.js    Curated Perth metro ground list
firestore.rules           Security rules (public vote create; super-admin delete/config)
firebase.json             Hosting + rules deploy config
tools/
  ci-validate.js          Version tag sync + required files + app.min.js syntax check
  bump-version.js         Bump ?tag=vNNN across public/ (replaces bump-v*.js)
  build-app.mjs           esbuild: src/ → public/dist-built/
  patch-app.mjs           Deprecation notice — patch chain frozen at v156
  test-firestore-rules.mjs  Rules unit tests (vote identity / doc-id binding)
  smoke-fetch.js          Live HTML/logo/manifest checks (no browser)
  browser-test.js         Playwright smoke test (logo, admin, vote tab)
  visual-qa.js            Playwright visual/UX checks (theme toggle, lineup, vote flow)
  test-name-match.mjs     Node smoke test for participation / alias matching logic
src/
  vote-meta.js            Extracted voteMetaByRound helpers (migration starter)
  README.md               src/ migration plan + config sharding note (future)
```

**Data flow**

- Voters submit ballots to Firestore `votes/{t{team}_r{round}_v{voter}}` (3 picks, weighted 3/2/1).
- Config (teams, squads, rounds, matches, lineups, `voteMetaByRound`) lives in `config/main`.
- Coach ballots in `coachVotes/`; destructive admin actions logged in `adminLog/`.
- Local `localStorage` mirrors cloud for fast UI and offline queue flush on reconnect.
- Super-admin sign-in pushes local config to cloud when newer (`vu()`); cloud wins on pull when `updatedAt` is newer (v155+).
- Service worker: network-first for HTML and versioned `dist/*` bundles; cache-first for logo/manifest.

**Modules**

| File | Load | Role |
|------|------|------|
| `app.min.js` | Immediate | Core UX, Firebase sync, admin unlock |
| `voter-enhancements.js` | Deferred module | Banners, offline queue, who-hasn't-voted, participation, theme |
| `admin-merge-rounds.js` | Dynamic import on admin open | Preview/run round merge with audit log |

**Observer hygiene**

- All `MutationObserver` instances disconnect after wiring (admin mount, merge rounds, voter enhancements).
- Companion module inits wrapped in `try/catch` so a failure never blocks the main app.

## Prerequisites

- **Node.js 20+** (for `npx` / CI scripts)
- **Java 21+** (required for `npm run test:rules` — Firestore emulator)
- Firebase CLI access to project `wembley-downs-div-8-2026` (`firebase login`) — only for deploy, not for rules tests

### Install Java 21 (Windows)

The Firestore emulator bundled with `firebase-tools` requires **JDK 21 or newer**. Java 17 will fail with:
`firebase-tools no longer supports Java version before 21`.

```powershell
winget install Microsoft.OpenJDK.21
```

Alternatives: `winget install EclipseAdoptium.Temurin.21.JDK` or `choco install temurin21`.

After install, **open a new terminal** and verify:

```powershell
java -version
# openjdk version "21.x" ...
```

If `java -version` still shows 17, ensure `C:\Program Files\Microsoft\jdk-21.*\bin` appears **before** any JDK 17 path in your user or system `PATH`.

### Credentials — what is and isn't needed

| Task | Credentials |
|------|-------------|
| `npm run test:rules` | **None** — local Firestore emulator only (`wembley-downs-rules-test` fake project) |
| `npm run validate`, `test:name-match`, `test:browser` | **None** |
| `firebase deploy` | Firebase CLI login (`firebase login`) |
| `tools/admin-check.js` | **None** — Playwright against live/local site; super-admin unlock is manual in browser |
| Production Firestore reads/writes in the app | Firebase web API key in `app.min.js` (public, restricted by rules) |

Do **not** commit `serviceAccount*.json`, `.env`, or credential JSON files. See `.env.example`.

## Local development

```bash
npx -y firebase-tools@latest emulators:start --only hosting
```

Open http://localhost:5000

## Validate (CI)

```bash
npm install
node tools/ci-validate.js
npm run test:rules           # Firestore rules — Java 21+ required (emulator, no prod creds)
node tools/test-name-match.mjs
node tools/test-tally.mjs
```

Checks required files exist, manifest theme color, version tags in sync, and `app.min.js` parses.

GitHub Actions runs `ci-validate.js` and `test:rules` on every push to `master`/`main` (CI installs Java 21 automatically).

## Security

### Vote documents

- Doc id format: `t{teamId}_r{roundKey}_v{voterNameKey}` (voter key = normalized name, `[a-z0-9-]`).
- Rules require `voterNameKey` in payload to **match the doc id suffix** and `teamId` to match the prefix — prevents overwriting another voter's ballot by guessing their name while using a different doc id.
- Voters can **update** their own ballot (same `voterNameKey`); only super admin can delete or change identity.
- **Limitation:** name-based voting is not cryptographic identity — anyone who knows a squad member's name can submit as them. Mitigations: App Check (below), squad-only context, admin review of who-voted panel.

### Coach slot passwords

Coach unlock compares passwords to **hashes stored in client-readable config** (`coach1PasswordHash` / `coach2PasswordHash`). This is obfuscation, not server-side auth — treat coach passwords as shared secrets among trusted coaches, not strong security boundaries.

### Firebase App Check (recommended for production)

App Check reduces automated abuse (vote spam, config scraping). Not enabled in repo yet — requires Firebase console setup:

1. Firebase Console → App Check → register web app.
2. Use **reCAPTCHA v3** (or reCAPTCHA Enterprise) — add site key to hosting env / build.
3. Enable enforcement for **Cloud Firestore** (start in monitor mode, then enforce).
4. In app bootstrap (`app.min.js` / future `src/app`), call `initializeAppCheck` before Firestore reads/writes.

Optional placeholder (do not commit real keys):

```html
<!-- App Check: set FIREBASE_APPCHECK_SITE_KEY at build time; see README Security -->
```

### config/main scaling (future)

All team config lives in one Firestore doc (`config/main`). For very large seasons, shard by team or round (e.g. `config/team1`, `lineups/team1_round9`). **Not implemented** — see `src/README.md`.

## Deploy

```bash
npx -y firebase-tools@latest deploy --only hosting,firestore:rules
```

Deploy Firestore rules whenever vote/config access changes.

Pre-deploy:

```bash
npm run validate
npm run test:rules
node tools/smoke-fetch.js   # optional: checks live site (run again after deploy)
```

## Staging preview

Preview hosting channel (expires in 7 days):

```bash
npx -y firebase-tools@latest hosting:channel:deploy preview --expires 7d
```

Use the channel URL from CLI output to QA before production deploy.

## Rollback

**Hosting:** redeploy a known-good commit:

```bash
git checkout f1d28eb    # or any commit with good public/
npm run validate
npx -y firebase-tools@latest deploy --only hosting
git checkout master
```

**Firestore rules:** same flow with `--only firestore:rules`. Rules changes are not version-tagged in the app — rollback rules separately if a deploy misbehaves.

**Git tag (optional):** tag releases (`git tag v156 && git push origin v156`) for faster rollbacks.

## Smoke test

Quick manual check after deploy (or against production):

1. Open https://wembley-downs-div-8-2026.web.app/ (hard-refresh if you recently deployed).
2. **No fatal banner** — red sticky bar at the top should stay hidden.
3. **Logo** — Wembley Downs club crest visible in the header beside the title; browser tab shows the club icon.
4. **Participation pill** — under "Your vote", shows "X of Y eligible squad members have voted" with progress bar.
5. **Coach / admin** — tap **Coach / admin** at the bottom; panel opens with Super admin / Team coach sign-in options.
6. **Vote section** — **Voting** tab shows name field and player list (or empty state while config loads).
7. **PWA** — `/manifest.json` returns 200; theme color `#EE2B33`.

Automated (requires Playwright):

```bash
npm install playwright
npx playwright install chromium
node tools/browser-test.js
node tools/visual-qa.js
```

## Debugging

| Tool | Command | What it reports |
|------|---------|-----------------|
| CI validate | `node tools/ci-validate.js` | Version tag sync across `index.html`, `sw.js`, dist bundles |
| Firestore rules | `npm run test:rules` | Vote doc-id binding via local emulator (Java 21+; no credentials) |
| Smoke fetch | `node tools/smoke-fetch.js` | Live HTML/logo/manifest checks (no browser) |
| Browser smoke | `node tools/browser-test.js` | Playwright: fatal banner, logo, admin panel, vote tab |
| Visual QA | `node tools/visual-qa.js` | Playwright: theme toggle, lineup/vote tabs, admin panel |
| Capture errors | `node tools/capture-error.js` | Playwright: console/page errors after opening admin |
| Admin check | `node tools/admin-check.js` | Round dropdown counts, squad/vote counts, Firebase auth state |

**Browser DevTools Console** (on the live or local site):

1. Open **Coach / admin** and unlock super admin.
2. Check `window.__svFirebaseApp` and `window.__svAuth.currentUser` — auth should exist after unlock.
3. Watch for `[merge-rounds]` or `[who-hasnt-voted]` warnings when using merge or results panels.
4. Inspect `#mergeRoundsHint` text for round/vote load status.

## Release checklist

When shipping a cache-breaking version:

```bash
npm run build              # if src/ changed
npm run bump -- 157        # bumps all tags in public/
npm run validate
npm run test:rules
npx -y firebase-tools@latest deploy --only hosting,firestore:rules
```

`bump-version.js` updates: `index.html` script `?tag=`, `sw.js` `CACHE_VERSION`, `sw.js?v=`, dist import paths, HTML version comments.

Do **not** add new `patch-app-vNNN.js` files — edit `src/` instead.

## Name aliases

**Built-in** (`NAME_ALIASES` in `public/dist/name-match.js`): lowercase stripped key → canonical display name (e.g. `ulrika: "Uli"`, `johanna: "Jay"`).

**Per-round admin aliases** (v156+): super admin confirms ballot → squad in **Results → Who has / hasn't voted?** Stored in `team.voteMetaByRound[round].aliases` on `config/main`.

## Participation exclusions (v156+)

Super admin can mark squad members **Excluded (didn't play / watch)** per round. Stored in `team.voteMetaByRound[round].excluded`. Participation pill and hasn't-voted denominator use eligible squad only.

## One ballot per squad member (v157+)

Results tally counts **at most one ballot per squad player**. If fuzzy matching links multiple ballot names to the same person, **only the latest ballot counts** (by timestamp).

Super admin sees a **duplicate ballots** warning in **Results → Who has / hasn't voted?** when two or more ballots map to one squad member (e.g. accidental double submit under different spellings).

## Coach vote routing (v158+)

When **Will** or **Chris** (or names matching `coach1Name` / `coach2Name` in config) vote via the normal player UI, their ballot is stored in **`coachVotes/`** (slot 1 or 2), not `votes/`. Other players continue to use `votes/`.

## Squadi fixture sync (v163+)

Auto-import **Wembley Downs** fixtures and results from [Squadi](https://registration.squadi.com) (Football West). No official public API docs — uses the same public JSON endpoints as the Squadi draws page.

### Point to your competition

1. Open Squadi → Football West → your competition → **Draws** (division filter).
2. Copy the browser URL (contains `organisationKey`, `yearId`, `competitionUniqueKey`, `divisionId`).
3. Coach / admin → **Team** tab → **Squadi sync** → paste URL → **Import from Squadi**.
4. Click **Save team & round** to push to Firestore.

Config is stored on the team as `team.squadi` in `config/main`:

| Field | Purpose |
|-------|---------|
| `fixtureUrl` | Full Squadi draws page URL |
| `teamNameFilter` | e.g. `Wembley Downs` (matches team name substring) |
| `competitionUniqueKey`, `yearId`, `divisionId` | Parsed from URL or advanced fields |

Imported per round into `matchesByRound`: opponent, date, kickoff (Perth), ground, pitch, lat/lng, our/opp score, **our goalscorers** (from public match events). Lineups and match reviews are preserved.

### CLI & daily automation

```bash
cp squadi-config.example.json squadi-config.json   # edit competition URL/IDs
npm run test:squadi                                 # smoke test (no creds)
npm run sync:squadi                                 # dry-run JSON
npm run sync:squadi:write                           # needs service account
```

**Credentials:** Squadi fetch needs **no** login. `--write` needs `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` (Firestore admin), not production user passwords.

**GitHub Actions:** `.github/workflows/squadi-sync.yml` runs daily (~6am Perth) + manual dispatch. Set repo secret `FIREBASE_SERVICE_ACCOUNT_JSON` to enable Firestore push; otherwise dry-run test only.

**Legal:** Squadi has no documented third-party API. This uses public read endpoints the web app calls. Respect Squadi/Football West terms; rate-limit (sync once daily). [FixtureSync](https://fixturesync.com) is a commercial alternative if policies change.

## Coach slots

Each team has coach **slot 1** and **slot 2** (`coach1PasswordHash` / `coach2PasswordHash` in config). Coach votes are stored in `coachVotes/` with a `slot` field. Super admin can run the Chris coach-slot repair from the admin panel (v136+).

## Live site

https://wembley-downs-div-8-2026.web.app/
