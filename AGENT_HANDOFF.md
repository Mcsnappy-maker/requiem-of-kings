# Requiem of Kings — Agent Handoff

**Last updated:** 15 November 2026  
**Completed stages:** Stage 1 (Battlefield & Mobile HUD), Stage 2 (Cohesive Armies), Stage 3 (Battle Spectacle)  
**Production branch:** `main`  
**Live URL:** `https://requiem-of-kings.vercel.app`

## Product Goal

Build a phone-first, cross-device, online 3D chess battle that the user can confidently share with his son and friends. It must feel like an original cinematic dark-fantasy game—not a renamed copy of the baseline repository.

The creative target is:

- Ember Court versus Hollow Legion.
- Dragons, ruined throne-temple environments and dramatic but readable magic.
- Cohesive, role-specific characters rather than mismatched low-poly or generic models.
- Short, skippable battle spectacle with faction-specific impact, death, and victory effects.
- Play by private link from different homes.
- Resume the same saved match after closing the browser or changing device.
- Work on phone, tablet and desktop.
- Free hosting on Vercel, with the durable match service on Cloudflare Workers.

The “£5 million game” language is a quality aspiration. Never claim that the present build has that production value or that licensed/generated/procedural art is bespoke.

## Source and Production

- Repository: `https://github.com/Mcsnappy-maker/requiem-of-kings`
- Production: `https://requiem-of-kings.vercel.app`
- Multiplayer Worker: `https://requiem-multiplayer.requiem-multiplayer.workers.dev`
- Main local repository: `C:\Users\mohar\OneDrive\Desktop\codex projects\requiem-of-kings`
- Baseline/upstream: `https://github.com/ade5791/rork-medieval-3d-chess.git`
- Preserve the upstream MIT licence and all asset provenance in `ASSET_REGISTER.md`.

## What Has Been Completed

### Stage 1 — Battlefield and Mobile Presentation (merged to `main` in `d6be18d`)
- Rebuilt the Shattered Throne battlefield (`web/src/scene/battlefield.ts`) with Gothic arches, rose window, braziers, and faction banners.
- Added the procedural dragon fly-by (`web/src/scene/dragonFlight.ts`).
- Built a compact phone HUD (`360×640`) with Undo, Resign, and More (`≥44×44` px touch targets) and full-board framing with all 32 pieces visible.

### Stage 2 — Cohesive Armies (merged to `main` in `66e3306`)
- Added the 12-role procedural regalia system (`web/src/scene/factionRegalia.ts`) layered onto every `PieceView` (`web/src/scene/pieces.ts`): Ember Court uses blackened steel, crimson cloth, and molten gold; Hollow Legion uses bone, tattered violet, and cyan/necrotic light.
- Added faction-specific selection, hover, legal-move, and capture feedback (`factionFeedback` in `web/src/scene/effects.ts`).
- Verified live on `https://requiem-of-kings.vercel.app`: 326 unit tests, 14 browser tests, 121 Worker tests, 37/37 legacy relay checks, 4 responsive QA profiles (`360×640` low, `390×664`, `810×1080`, `1440×900`), and a live two-client create/join/`e4`/reconnect smoke test.

### Stage 3 — Battle Spectacle (merged to `main` in `c378b76`)
- Added `web/src/scene/battleSpectacle.ts` defining faction-specific `impact`, `death`, and `victory` effect palettes (`factionSpectacle`) and meaningful match-event triggers (`shouldTriggerDragonEvent`).
- Switched `DragonFlight` in `web/src/scene/dragonFlight.ts` and `web/src/scene/battlefield.ts` to event-driven appearances during gameplay (`check`, `promotion`, `q`/`r` capture, and `victory`, with a 24s cooldown for non-victory events) while preserving deterministic ambient loop mode for `?review=1` QA.
- Made in-progress capture cinematics skippable via `SceneEngine.skipCaptureCinematic()` and a `TAP TO SKIP` (`≥44×44` px) overlay in `web/src/ui/GameShell.tsx` without altering chess state.
- Added faction-specific victory bursts/mist/flash in `SceneEngine.playEndCinematic()` and faction-specific death ember/smoke colors in `SceneEngine`.
- Verified with 329 unit tests across 14 files, 14 browser tests across 2 files, production build (`1,885` modules), and deployed to `https://requiem-of-kings.vercel.app`.

## Honest Remaining Limitations / Future Work

- **Physical-device frame rate** on a real phone has not yet been measured directly (all automated visual QA ran in headless Chromium with SwiftShader).
- **Hero 3D art**: Characters and the dragon are procedural/regalia-layered over the baseline rigged roster (`ASSET_REGISTER.md`), not commissioned AAA sculpts. Future bespoke/licensed GLB replacements must be recorded in `ASSET_REGISTER.md` and tested on `360×640` low quality.

## Approved Design and Plans

1. `docs/superpowers/specs/2026-11-15-requiem-visual-rebuild-design.md` (Authoritative spec)
2. `docs/superpowers/plans/2026-11-15-stage-one-visual-rebuild.md`
3. `docs/superpowers/plans/2026-11-15-stage-two-cohesive-armies.md`

## Non-Negotiable Visual Acceptance

- Test the real rendered result, not merely whether a canvas exists.
- Always include `360×640` low quality, `390×664` phone, `810×1080` tablet and `1440×900` desktop.
- The full board and all 32 starting pieces must be visible.
- Phone controls must remain at least `44×44` CSS pixels.
- No black-on-black presentation.
- Ember and Hollow must be distinguishable without relying solely on floating rank badges.
- All six roles (`p,n,b,r,q,k`) must have distinct silhouettes within each faction.
- The game must remain playable while decorative effects are disabled or reduced.

## Verification Commands

Run from a clean worktree's `web` directory (see Known Local Limitation below):

```powershell
npm test -- --run
npm run build
node scripts/qa-responsive.mjs https://requiem-of-kings.vercel.app qa-shots/stage-three-prod
```

From the repository root:

```powershell
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
node server/e2e-multiplayer.mjs
```

## Safety and Release Rules

- Work in a feature branch/worktree, not directly on `main`.
- Follow test-first changes for new behaviour.
- Do not alter chess rules or multiplayer credentials while doing visual work.
- Never expose seat tokens, join tokens or private return links in logs or commits.
- Deploy from the repository root (`C:\Users\mohar\OneDrive\Desktop\codex projects\requiem-of-kings`) to the existing Vercel project `requiem-of-kings` (`npx --yes vercel --prod --yes`); do not create another Vercel project.

## Known Local Limitation

The main checkout’s `web/node_modules` contains a Windows-locked Rolldown binding, so `npm ci` there can fail with `EPERM`. Do not delete it forcibly. Use one of the worktrees (e.g., `.worktrees/stage-three-battle-spectacle/web`) or create a new worktree for clean dependency installation, tests, and builds.
