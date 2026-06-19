# Wembley Downs Div 8 2026 — Team Player Vote

Static single-page app for team player-of-the-match voting, hosted on [Firebase Hosting](https://wembley-downs-div-8-2026.web.app/).

## Architecture

```
public/
  index.html              Shell: inline critical CSS, boot skeleton, lazy admin template
  sw.js                   Service worker (precache shell + network-first /dist/*)
  wembley-downs-logo.png  Club logo
  dist/
    app.min.js            Main app (Firebase, voting, coach/admin, lineup)
    voter-enhancements.js Companion: already-voted, offline queue, who hasn't voted, theme
    admin-merge-rounds.js Lazy-loaded super-admin round merge (REST batch writes)
firestore.rules           Security rules (public vote create; super-admin delete/config)
firebase.json             Hosting + rules deploy config
```

**Data flow**

- Voters submit ballots to Firestore `votes/{t{team}_r{round}_v{voter}}` (3 picks, weighted 3/2/1).
- Config (teams, squads, rounds, matches, lineups) lives in `config/main`.
- Coach ballots in `coachVotes/`; destructive admin actions logged in `adminLog/`.
- Local `localStorage` mirrors cloud for fast UI and offline queue flush on reconnect.
- Service worker: network-first for HTML and versioned `dist/*` bundles; cache-first for logo.

**Modules**

| File | Load | Role |
|------|------|------|
| `app.min.js` | Immediate | Core UX, Firebase sync, admin unlock |
| `voter-enhancements.js` | Deferred module | Banners, offline queue REST flush, cloud who-hasn't-voted |
| `admin-merge-rounds.js` | Dynamic import on admin open | Preview/run round merge with audit log |

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

Checks required files exist and **version tags stay in sync** (see release checklist).

## Deploy

```bash
npx -y firebase-tools@latest deploy --only hosting,firestore:rules
```

Deploy Firestore rules whenever vote/config access changes.

## Release checklist (bump v119 → v120 together)

When shipping a new cache-breaking version, update **all** of these to the same version (e.g. `v120`):

1. `public/index.html` — HTML comment + every `?tag=vNNN` on `app.min.js`, `voter-enhancements.js`, `admin-merge-rounds.js`
2. `public/sw.js` — `CACHE_VERSION = "vNNN"`
3. `public/index.html` — `navigator.serviceWorker.register("/sw.js?v=NNN")` (numeric only, no `v` prefix)
4. Run `node tools/ci-validate.js` — must pass
5. Deploy hosting + rules
6. Smoke-test live: no fatal banner, vote tab, Coach/admin unlock, merge UI preview

## Live site

https://wembley-downs-div-8-2026.web.app/
