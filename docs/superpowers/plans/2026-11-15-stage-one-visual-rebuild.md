# Stage One Visual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an unmistakably Requiem dark-fantasy battlefield with a dragon spectacle and a phone-first HUD without changing chess or multiplayer behaviour.

**Architecture:** Add an isolated, deterministic dragon-flight scene unit and integrate it into the existing `Battlefield` lifecycle. Extend the existing Ashen arena rather than introducing another arena selector entry, and use CSS plus a small HUD menu change to keep primary phone controls compact. Pure presentation policies receive unit tests; rendered layout and runtime behaviour use the existing Playwright-based browser gate.

**Tech Stack:** TypeScript, Three.js, React 19, Tailwind/CSS, Vitest, Playwright, Vite.

**Spec:** `docs/superpowers/specs/2026-11-15-requiem-visual-rebuild-design.md`

## Global Constraints

- Preserve chess legality, online room joining, reconnect tokens and saved match state.
- Treat 360×640 CSS pixels and low-quality rendering as first-class targets.
- Keep every visible phone control at least 44×44 CSS pixels.
- Decorative effects must degrade by quality preset without removing gameplay information.
- Record any third-party asset and licence in `ASSET_REGISTER.md`; Stage 1 therefore uses original procedural geometry and existing project textures only.
- Never claim that procedural or adapted art is bespoke.

---

### Task 1: Deterministic Dragon Flight

**Files:**
- Create: `web/src/scene/dragonFlight.ts`
- Create: `web/src/test/dragonFlight.test.ts`

**Interfaces:**
- Produces: `dragonFlightPose(elapsed: number): { position: [number, number, number]; yaw: number; wing: number; visible: boolean }`
- Produces: `class DragonFlight { readonly group: THREE.Group; setQuality(preset: QualityPreset): void; update(elapsed: number): void; dispose(): void }`
- Consumes: `QualityPreset` from `web/src/scene/quality.ts`.

- [ ] **Step 1: Write the failing flight-policy test**

```ts
import { describe, expect, it } from "vitest";
import { dragonFlightPose } from "../scene/dragonFlight";

describe("dragon flight", () => {
  it("loops through a visible fly-by and a quiet interval", () => {
    expect(dragonFlightPose(0).visible).toBe(true);
    expect(dragonFlightPose(8).position[0]).toBeGreaterThan(dragonFlightPose(0).position[0]);
    expect(dragonFlightPose(22).visible).toBe(false);
    expect(dragonFlightPose(36).position).toEqual(dragonFlightPose(0).position);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module does not exist**

Run: `cd web && npx vitest run src/test/dragonFlight.test.ts`

- [ ] **Step 3: Implement the flight policy and a low-poly silhouette built from original Three.js geometry**

Use a 36-second cycle: 0–16 seconds visible, 16–36 seconds hidden. Fly from `[-38, 22, -45]` to `[38, 17, -24]`; derive yaw from the route tangent and wing angle from `Math.sin(elapsed * 4.2) * 0.32`. Build the body from tapered cylinders, the head and tail from cones, and each wing from a `THREE.ShapeGeometry`; use charcoal PBR material with ember emissive accents. Low quality hides ember particles but retains the silhouette.

- [ ] **Step 4: Run the focused test and production build**

Run: `cd web && npx vitest run src/test/dragonFlight.test.ts && npm run build`

- [ ] **Step 5: Commit the isolated scene unit**

Run: `git add web/src/scene/dragonFlight.ts web/src/test/dragonFlight.test.ts && git commit -m "feat: add Requiem dragon fly-by"`

### Task 2: Ruined Throne-Temple Integration

**Files:**
- Modify: `web/src/scene/battlefield.ts`
- Modify: `web/src/scene/arena.ts`
- Create: `web/src/test/requiemArena.test.ts`

**Interfaces:**
- Consumes: `DragonFlight` from Task 1.
- Produces: an Ashen arena whose metadata and colour values enforce readable warm/cold faction separation.

- [ ] **Step 1: Write a failing arena-identity test**

```ts
import { describe, expect, it } from "vitest";
import { ARENA_LOOKS } from "../scene/arena";

describe("Requiem arena identity", () => {
  it("names the default battlefield and keeps readable magical contrast", () => {
    expect(ARENA_LOOKS.ashen.name).toBe("The Shattered Throne");
    expect(ARENA_LOOKS.ashen.exposure).toBeGreaterThanOrEqual(1.15);
    expect(ARENA_LOOKS.ashen.lamp.intensity).toBeGreaterThanOrEqual(0.45);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the metadata assertion fails**

Run: `cd web && npx vitest run src/test/requiemArena.test.ts`

- [ ] **Step 3: Integrate the dragon and strengthen the ruined battlefield**

Instantiate `DragonFlight` in `Battlefield`, attach its group, call `setQuality()` with every preset change, call `update(this.elapsed)` from the existing update loop, and dispose it in `dispose()`. Extend the existing cathedral/war-plain geometry with broken crown arches, torn crimson and violet banners and two distinct magical beacon colours, using existing procedural meshes and cloth textures.

- [ ] **Step 4: Update the default arena identity and readability values**

Set the Ashen display name to `The Shattered Throne`, describe it as the ruined border of the Ember Court and Hollow Legion, keep exposure at least `1.15`, and keep camera-lamp intensity at least `0.45` before the phone-specific readability multiplier.

- [ ] **Step 5: Run arena, dragon and mobile-readability tests plus the build**

Run: `cd web && npx vitest run src/test/requiemArena.test.ts src/test/dragonFlight.test.ts src/test/mobileReadability.test.ts && npm run build`

- [ ] **Step 6: Commit the battlefield integration**

Run: `git add web/src/scene/battlefield.ts web/src/scene/arena.ts web/src/test/requiemArena.test.ts && git commit -m "feat: rebuild the Shattered Throne battlefield"`

### Task 3: Phone-First Battle HUD

**Files:**
- Modify: `web/src/ui/Hud.tsx`
- Modify: `web/src/ui/medieval.css`
- Modify: `web/scripts/qa-responsive.mjs`
- Create: `web/src/test/mobileHud.test.ts`

**Interfaces:**
- Produces: `phoneHudPolicy(width: number): { compact: boolean; directActions: readonly string[] }` in `Hud.tsx` or a focused `mobileHud.ts` helper if importing TSX makes the unit test heavy.
- Keeps all existing `HudProps` callbacks unchanged.

- [ ] **Step 1: Write a failing phone-HUD policy test**

```ts
import { describe, expect, it } from "vitest";
import { phoneHudPolicy } from "../ui/mobileHud";

describe("phone HUD", () => {
  it("shows only match-critical actions directly on a narrow phone", () => {
    expect(phoneHudPolicy(390)).toEqual({ compact: true, directActions: ["undo", "resign", "menu"] });
    expect(phoneHudPolicy(1024).compact).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the helper is missing**

Run: `cd web && npx vitest run src/test/mobileHud.test.ts`

- [ ] **Step 3: Implement the compact policy and secondary-actions menu**

Create `web/src/ui/mobileHud.ts`, use it through a responsive media-query presentation, and keep undo, resign and one `More` control directly visible on phones. Move fullscreen, camera flip, tactical map, sound and settings into the existing camera/more menu on narrow layouts; desktop behaviour stays unchanged.

- [ ] **Step 4: Add explicit stable selectors and responsive assertions**

Add `data-hud="turn"`, `data-hud="primary-actions"` and `data-hud="secondary-actions"`. Extend `qa-responsive.mjs` to fail when, at phone width, the turn panel or primary-actions region exceeds 38% of viewport width, any visible button is below 44 pixels, horizontal overflow exceeds 1 pixel, or the board canvas loses WebGL.

- [ ] **Step 5: Run focused tests and phone/tablet/desktop QA against local preview**

Run: `cd web && npx vitest run src/test/mobileHud.test.ts && npm run build`

Run preview in one terminal: `cd web && npm run preview -- --host 127.0.0.1`

Run QA in another: `cd web && node scripts/qa-responsive.mjs http://127.0.0.1:4173 qa-shots/stage-one phone,tablet,desktop`

- [ ] **Step 6: Visually inspect all three screenshots and correct any obscured board, low contrast or overlapping control**

Inspect `web/qa-shots/stage-one/phone.png`, `tablet.png` and `desktop.png`. The phone image must show the full board, both armies, the current-turn identity and no more than three direct action buttons.

- [ ] **Step 7: Commit the HUD stage**

Run: `git add web/src/ui/Hud.tsx web/src/ui/mobileHud.ts web/src/ui/medieval.css web/scripts/qa-responsive.mjs web/src/test/mobileHud.test.ts && git commit -m "feat: give mobile battles a board-first HUD"`

### Task 4: Release Verification and Deployment

Stage One released on 2026-11-15 from merge commit `d6be18d`, including final review fixes at `b04594e`. Earlier task checkboxes are left to their implementation records rather than reconstructed as test-first claims.

**Files:**
- Modify: `ASSET_REGISTER.md`
- Modify: `docs/superpowers/plans/2026-11-15-stage-one-visual-rebuild.md` (check completed steps)

**Interfaces:**
- No new runtime interface; this task verifies the complete stage.

- [x] **Step 1: Record the original procedural dragon and environment work**

Add an entry explaining that the dragon silhouette and throne-temple extensions are original procedural geometry using project-owned code and existing textures, with no new third-party asset licence.

- [x] **Step 2: Run the complete web verification suite**

Run: `cd web && npm test && npm run build`

Expected: every unit and browser test passes; Vite exits zero.

Final verification: 258 unit tests across 11 files and 14 browser tests across 2 files passed; production build exited zero. Existing Vite native-config and large-chunk warnings remain.

- [x] **Step 3: Run the legacy relay/worker suites documented by their package scripts**

Run the repository's existing multiplayer test commands from the relevant package directories and require zero failures before deployment.

Verified actual commands from package scripts and `.github/workflows/verify.yml`: `npm test --prefix multiplayer` (121 tests across 5 files), `npm run typecheck --prefix multiplayer`, and `node server/e2e-multiplayer.mjs` (37/37 checks). The legacy `server/package.json` has no test script; the relay command is documented by the test itself and CI. Also passed `npx --prefix multiplayer wrangler deploy --dry-run --config multiplayer/wrangler.jsonc --env=""` without deploying.

Visually inspected the existing `web/qa-shots/stage-one-fix-round-1/phone.png`, `tablet.png` and `desktop.png`: full playable board and both armies are visible with no HUD overlap; phone shows the current-turn identity and exactly Undo, Resign and More. The accompanying QA log reports live WebGL, zero overflow, 32 figures and zero hall occlusions on all three profiles; phone controls are at least 44px. Generated QA images are excluded from the release-record commit.

- [x] **Step 4: Push all commits to `origin/main` and deploy the repository root to the existing `requiem-of-kings` Vercel project**

Run: `git push origin main`, then deploy from the linked repository root so the configured `cd web && npm ci && npm run build` command runs exactly once.

Pushed `d6be18d` to `origin/main`. Vercel deployment `dpl_8rfFGVTgvMHnzbVuh9grU8DJzL4J` completed successfully and was aliased to `https://requiem-of-kings.vercel.app`.

- [x] **Step 5: Verify the exact production URL visually and functionally**

Run: `cd web && node scripts/qa-responsive.mjs https://requiem-of-kings.vercel.app qa-shots/stage-one-live phone,tablet,desktop`.

Create a private online hall, open the join link in a second isolated browser context, make one legal move, reload one side and confirm it reconnects to the same position.

Production QA passed at 360×640 low, 390×664 medium, 810×1080 medium and 1440×900 desktop: complete board, 32 pieces, visible unobscured dragon, zero horizontal overflow and live WebGL. A live private match seated two isolated clients, synchronized `e4` at state version 2, and restored the host seat to the same saved position after reconnect.

- [x] **Step 6: Commit release records and push**

Run: `git add ASSET_REGISTER.md docs/superpowers/plans/2026-11-15-stage-one-visual-rebuild.md && git commit -m "docs: record Stage One visual release" && git push origin main`
