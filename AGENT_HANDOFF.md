# Requiem of Kings — Agent Handoff

**Last updated:** 15 November 2026  
**Active stage:** Stage 2 — Cohesive Armies  
**Active branch:** `feature/stage-two-cohesive-armies`  
**Active worktree:** `C:\Users\mohar\OneDrive\Desktop\codex projects\requiem-of-kings\.worktrees\stage-two-cohesive-armies`

## Product Goal

Build a phone-first, cross-device, online 3D chess battle that the user can confidently share with his son and friends. It must feel like an original cinematic dark-fantasy game—not a renamed copy of the baseline repository.

The creative target is:

- Ember Court versus Hollow Legion.
- Dragons, ruined throne-temple environments and dramatic but readable magic.
- Cohesive, role-specific characters rather than mismatched low-poly or generic models.
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

## Honest Current State

Production currently has:

- Private two-player online matches.
- One-time opponent invite links and private seat-return links.
- Durable saved match state and reconnect support.
- Vercel deployment and Cloudflare Durable Object match service.
- A readable Shattered Throne battlefield.
- A visible procedural dragon fly-by.
- A compact 360×640 phone HUD.
- Full-board phone framing with 32 pieces visible.

Production verification at Stage 1:

- 258 unit tests passed.
- 14 browser tests passed.
- 121 multiplayer Worker tests passed.
- Legacy relay passed 37/37 checks.
- Live create, join, `e4`, disconnect and reconnect smoke test passed.

What is **not finished**:

- The characters still rely on the baseline rigged roster and do not yet deliver a cohesive premium Ember Court/Hollow Legion identity.
- The dragon is an environmental procedural silhouette, not a high-detail hero model.
- Stage 3 combat spectacle and faction-specific victory/capture presentation remain future work.
- Physical-device frame rate has not yet been measured.

## Approved Design and Plans

Read these before changing code:

1. `docs/superpowers/specs/2026-11-15-requiem-visual-rebuild-design.md`
2. `docs/superpowers/plans/2026-11-15-stage-one-visual-rebuild.md`
3. `docs/superpowers/plans/2026-11-15-stage-two-cohesive-armies.md`

The specification is authoritative. The Stage 2 plan is the active execution plan.

## Exact Next Step

Start Stage 2 Task 1 from `docs/superpowers/plans/2026-11-15-stage-two-cohesive-armies.md`:

1. Create `web/src/scene/factionRegalia.ts`.
2. Create `web/src/test/factionRegalia.test.ts` first and confirm the test fails.
3. Define all 12 faction/role art descriptors.
4. Build original procedural regalia with clear faction and chess-role silhouettes.
5. Verify and commit before integrating into `PieceView`.

Do not download random character models or introduce an asset without a confirmed licence and an `ASSET_REGISTER.md` entry.

## Non-Negotiable Visual Acceptance

- Test the real rendered result, not merely whether a canvas exists.
- Always include 360×640 low quality, 390×664 phone, 810×1080 tablet and 1440×900 desktop.
- The full board and all 32 starting pieces must be visible.
- Phone controls must remain at least 44×44 CSS pixels.
- No black-on-black presentation.
- Ember and Hollow must be distinguishable without relying solely on floating rank badges.
- All six roles must have distinct silhouettes within each faction.
- The game must remain playable while decorative effects are disabled or reduced.

## Verification Commands

From `web`:

```powershell
npm test
npm run build
node scripts/qa-responsive.mjs http://127.0.0.1:4173 qa-shots/<stage-name>
```

From the repository root:

```powershell
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
node server/e2e-multiplayer.mjs
```

Before a production claim, repeat responsive QA against `https://requiem-of-kings.vercel.app` and perform a live two-client create/join/move/reconnect smoke test.

## Safety and Release Rules

- Work on the active feature branch/worktree, not directly on `main`.
- Follow test-first changes for new behaviour.
- Independently review each task before proceeding.
- Do not alter chess rules or multiplayer credentials while doing visual work.
- Never expose seat tokens, join tokens or private return links in logs or commits.
- Merge and push only after full branch review and fresh tests.
- Deploy from the repository root to the existing Vercel project `requiem-of-kings`; do not create another Vercel project.

## Known Local Limitation

The main checkout’s `web/node_modules` contains a Windows-locked Rolldown binding, so `npm ci` there can fail with `EPERM`. Do not delete it forcibly. The Stage 2 worktree has a clean dependency installation and is the correct place to run tests and builds.
