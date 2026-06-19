# Wembley Downs Div 8 2026 - Team Player Vote

Static single-page app for team player voting, hosted on [Firebase Hosting](https://wembley-downs-div-8-2026.web.app/).

## Project structure

- `public/index.html` - App shell (inline styles)
- `public/dist/app.min.js` - Bundled application
- `public/sw.js` - Service worker (offline / caching)
- `public/wembley-downs-logo.png` - Club logo
- `firebase.json` - Hosting config (`public: public`)
- `.firebaserc` - Firebase project `wembley-downs-div-8-2026`

## Prerequisites

- Node.js (for Firebase CLI via `npx`)
- Firebase CLI access to project `wembley-downs-div-8-2026` (`firebase login`)
- Optional: GitHub CLI (`gh auth login`)

## Local development

```bash
npx -y firebase-tools@latest emulators:start --only hosting
```

Open http://localhost:5000

## Deploy

```bash
npx -y firebase-tools@latest deploy --only hosting
```

## Live site

https://wembley-downs-div-8-2026.web.app/