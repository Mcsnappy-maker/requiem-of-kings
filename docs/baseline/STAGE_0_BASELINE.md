# Stage 0 baseline

Captured 13 November 2026 from commit `fe897135c774502f16496d9a6f55bf00199998c3` (`docs: define durable multiplayer delivery plan`) in a clean feature worktree before Stage 0 edits.

## Reproduction commands

Run from the repository root:

```powershell
npm ci --prefix web
npm test --prefix web
npm run build --prefix web
npm ci --prefix server
node server/e2e-multiplayer.mjs
```

The baseline was rerun on Windows with Node.js `v26.13.0` and npm `11.20.0`. `npm test --prefix web` passed 99 unit tests across 6 files and 1 browser test. `npm run build --prefix web` exited 0. `node server/e2e-multiplayer.mjs` passed 37/37 checks. A post-change verification repeated all five commands with the same results.

## Existing findings

- The web install reported **21 vulnerabilities**: 12 moderate, 6 high and 3 critical. These audit findings were recorded, not fixed, as part of this baseline.
- The server install reported 0 vulnerabilities.
- Vite emitted its existing native-config-loader warning for `__dirname` references in its config files.
- The production build emitted Vite's existing warning that a minified JavaScript chunk exceeds 500 kB. The largest bundle was 1,428.65 kB (420.16 kB gzipped).
- The build exited successfully despite those warnings.
- The root `LICENSE` is MIT; preserve its attribution obligations in product and asset work.

## Scope and platform context

The existing web client is a React, TypeScript, Vite and Three.js application with a Node `ws` relay. The relay E2E script covers room creation, seat assignment, move validation and broadcasting, reconnect, failure handling, resignation and rematch. Existing automated browser coverage runs in Chromium. The approved design targets current Chrome, Edge, Safari and Firefox, including iOS Safari and Android Chrome on WebGL2-capable devices; that target matrix is not a claim that each browser/device has been independently verified at baseline.

The approved multiplayer architecture keeps the static Vite presentation tier on Vercel and places authoritative, persistent match rooms in Cloudflare Workers with Durable Objects. Stage 0 records this choice; implementation and hosted deployment are later stages.
