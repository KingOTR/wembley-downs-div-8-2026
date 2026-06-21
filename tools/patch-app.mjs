#!/usr/bin/env node
/**
 * Patch chain is FROZEN at v156. Do not add new patch-app-vNNN.js files.
 *
 * New app logic: edit src/, run npm run build, wire dist-built, bump version.
 *
 * Legacy (emergency only):
 *   node tools/patch-app-v156.js
 */
console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  patch-app.mjs — patch chain DEPRECATED (frozen at v156)         ║
╠══════════════════════════════════════════════════════════════════╣
║  New features:  src/  →  npm run build  →  npm run bump -- NNN   ║
║  See: src/README.md                                              ║
║                                                                  ║
║  Emergency replay of last patch only:                            ║
║    node tools/patch-app-v156.js                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
process.exit(1);
