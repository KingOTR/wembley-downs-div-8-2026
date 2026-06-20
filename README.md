# Wembley Downs Div 8 2026 — Team Player Vote

Static single-page app for team player-of-the-match voting, hosted on [Firebase Hosting](https://wembley-downs-div-8-2026.web.app/).

**Current version:** v125

## Architecture

```
public/
  index.html              Shell: inline critical CSS, boot skeleton, lazy admin template
  manifest.json           PWA manifest (name, theme #EE2B33, logo icons)
  sw.js                   Service worker (precache shell + network-first /dist/*)
  wembley-downs-logo.png  Club logo (header, favicon, PWA icons)
  dist/
    app.min.js            Main app (Firebase, voting, coach/admin, lineup)
    voter-enhancements.js Companion: already-voted, offline queue, who hasn't voted, participation counter, theme
    admin-merge-rounds.js Lazy-loaded super-admin round merge (REST batch writes)
    name-match.js         Shared fuzzy squad/voter name matching
firestore.rules           Security rules (public vote create; super-admin delete/config)
firebase.json             Hosting + rules deploy config
tools/
  ci-validate.js          Version tag sync + required files
  smoke-fetch.js          Live HTML/logo/manifest checks (no browser)
  browser-test.js         Playwright smoke test
  admin-check.js          Round/vote counts after admin unlock
  capture-error.js        Console errors after opening admin
```

**Data flow**

- Voters submit ballots to Firestore `votes/{t{team}_r{round}_v{voter}}` (3 picks, weighted 3/2/1).
- Config (teams, squads, rounds, matches, lineups) lives in `config/main`.
- Coach ballots in `coachVotes/`; destructive admin actions logged in `adminLog/`.
- Local `localStorage` mirrors cloud for fast UI and offline queue flush on reconnect.
- Service worker: network-first for HTML and versioned `dist/*` bundles; cache-first for logo/manifest.

**Modules**

| File | Load | Role |
|------|------|------|
| `app.min.js` | Immediate | Core UX, Firebase sync, admin unlock |
| `voter-enhancements.js` | Deferred module | Banners, offline queue, participation counter, cloud who-hasn't-voted |
| `admin-merge-rounds.js` | Dynamic import on admin open | Preview/run round merge with audit log |

**Observer hygiene**

- All `MutationObserver` instances disconnect after wiring (admin mount, merge rounds, voter enhancements).
- Companion module inits wrapped in `try/catch` so a failure never blocks the main app.

## Prerequisites

- Node.js 20+ (for `npx` / CI scripts)
- Firebase CLI access to project `wembley-downs-div-8-2026` (`firebase login`)

## Local development

```bash
npx -y firebase-tools@latest emulators:start --only hosting
```

Open http://localhost:5000

## Validate (CI)

```bash
node tools/ci-validate.js
```

Checks required files exist, manifest theme color, and **version tags stay in sync** (see release checklist).

## Deploy

```bash
npx -y firebase-tools@latest deploy --only hosting,firestore:rules
```

Deploy Firestore rules whenever vote/config access changes.

Pre-deploy:

```bash
node tools/ci-validate.js
node tools/smoke-fetch.js   # optional: checks live site (run again after deploy)
```

## Smoke test

Quick manual check after deploy (or against production):

1. Open https://wembley-downs-div-8-2026.web.app/ (hard-refresh if you recently deployed).
2. **No fatal banner** — red sticky bar at the top should stay hidden.
3. **Logo** — Wembley Downs club crest visible in the header beside the title; browser tab shows the club icon.
4. **Participation pill** — under "Your vote", shows "X of Y squad members have voted" with progress bar (once squad loads).
5. **Coach / admin** — tap **Coach / admin** at the bottom; panel opens with Super admin / Team coach sign-in options.
6. **Vote section** — **Voting** tab shows name field and player list (or empty state while config loads).
7. **PWA** — `/manifest.json` returns 200; theme color `#EE2B33`.

Automated (requires Playwright):

```bash
npm install playwright
npx playwright install chromium
node tools/browser-test.js
```

Exits `0` when all checks pass; prints JSON with `pass`, logo, admin, and vote details.

## Debugging

Quick checks after a deploy or when investigating admin/voter bugs:

| Tool | Command | What it reports |
|------|---------|-----------------|
| CI validate | `node tools/ci-validate.js` | Version tag sync across `index.html`, `sw.js`, dist bundles |
| Smoke fetch | `node tools/smoke-fetch.js` | Live HTML/logo/manifest checks (no browser) |
| Browser smoke | `node tools/browser-test.js` | Playwright: fatal banner, logo, admin panel, vote tab |
| Capture errors | `node tools/capture-error.js` | Playwright: console/page errors after opening admin |
| Admin check | `node tools/admin-check.js` | Round dropdown counts, squad/vote counts, Firebase auth state |

**Browser DevTools Console** (on the live or local site):

1. Open **Coach / admin** and unlock super admin.
2. Check `window.__svFirebaseApp` and `window.__svAuth.currentUser` — auth should exist after unlock.
3. Watch for `[merge-rounds]` or `[who-hasnt-voted]` warnings when using merge or results panels.
4. Inspect `#mergeRoundsHint` text for round/vote load status.

**Playwright scripts** need a Chromium-based browser once:

```bash
npm install playwright
npx playwright install chromium
```

Run against local emulator: `node tools/admin-check.js http://localhost:5000`

## Release checklist (bump v125 → v126 together)

When shipping a new cache-breaking version, update **all** of these to the same version (e.g. `v126`):

1. `public/index.html` — HTML comment + every `?tag=vNNN` on `app.min.js`, `voter-enhancements.js`, `admin-merge-rounds.js`
2. `public/sw.js` — `CACHE_VERSION = "vNNN"`
3. `public/index.html` — `navigator.serviceWorker.register("/sw.js?v=NNN")` (numeric only, no `v` prefix)
4. Run `node tools/ci-validate.js` — must pass
5. Deploy hosting + rules
6. Smoke-test live: no fatal banner, vote tab, participation pill, Coach/admin unlock, merge UI preview

## Live site

https://wembley-downs-div-8-2026.web.app/
