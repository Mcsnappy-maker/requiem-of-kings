# Stage Two Cohesive Armies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every on-board character read immediately as either Ember Court or Hollow Legion, with role-specific silhouettes and magical feedback that remain clear on low-quality phones.

**Architecture:** Keep the proven rigged core models and animations, but add an original procedural regalia layer owned by each `PieceView`. A pure descriptor maps faction and chess role to silhouette, palette and animation details; a focused Three.js builder turns that descriptor into armour, crowns, horns, banners, shrouds and magical accents. The layer follows the existing piece lifecycle, quality rules and dissolve/fade states without changing chess or multiplayer data.

**Tech Stack:** TypeScript, Three.js, Vitest, Playwright, Vite.

**Spec:** `docs/superpowers/specs/2026-11-15-requiem-visual-rebuild-design.md`

## Global Constraints

- Preserve chess legality, online joining, saved matches and reconnect behaviour.
- No new third-party models or unrecorded licences.
- Regalia must use original procedural geometry and existing project textures/material helpers.
- Ember Court uses blackened steel, crimson cloth and molten gold; Hollow Legion uses bone, tattered violet and cyan/necrotic light.
- Every role (`p,n,b,r,q,k`) needs a distinct silhouette within each faction.
- Low-quality 360×640 remains a first-class visual and performance target.
- Floating gameplay badges, colliders and tactical tokens must continue working.

---

### Task 1: Faction and Role Art Contract

**Files:**
- Create: `web/src/scene/factionRegalia.ts`
- Create: `web/src/test/factionRegalia.test.ts`

**Interfaces:**
- Produces: `type RegaliaDescriptor` containing `faction`, `kind`, `style`, `accent`, `cloth`, `crown`, `horns`, `shoulders`, `backpiece`, and `aura`.
- Produces: `regaliaDescriptor(faction: Faction, kind: PieceKind): RegaliaDescriptor`.
- Produces: `class FactionRegalia { readonly group: THREE.Group; readonly meshes: THREE.Mesh[]; readonly materials: THREE.Material[]; update(elapsed: number, selected: boolean, hovered: boolean, fade: number): void; dispose(): void }`.
- Produces: `buildFactionRegalia(faction, kind, figureHeight): FactionRegalia`.

- [ ] Write a failing table-driven test covering all 12 faction/role combinations, unique role styles inside a faction, opposite magical accents, and required king/queen/knight silhouette features.
- [ ] Run the focused test and confirm the missing module failure.
- [ ] Implement the descriptor and procedural builder using shared geometry/material caches where safe, with per-instance disposal limited to owned materials.
- [ ] Give pawns compact shoulder plates, knights horned/crested helms, bishops tall ritual backpieces, rooks fortress pauldrons, queens sweeping crown/shroud forms, and kings unmistakable crown/back banners. Ember geometry is angular and forged; Hollow geometry is skeletal and hooked.
- [ ] Run focused tests and production build.
- [ ] Commit as `feat: forge distinct Ember and Hollow regalia`.

### Task 2: Piece Lifecycle and Magical Readability

**Files:**
- Modify: `web/src/scene/pieces.ts`
- Modify: `web/src/scene/factionRegalia.ts`
- Modify: `web/src/test/factionRegalia.test.ts`

**Interfaces:**
- Consumes `buildFactionRegalia()` from Task 1.
- `PieceView` owns exactly one regalia instance, adds it under `runtime`, updates it with the existing elapsed clock and interaction flags, includes its meshes in raycast/dissolve ownership where appropriate, and disposes it once.

- [ ] Add failing lifecycle tests for attachment count, selection/hover emphasis, fade propagation and idempotent disposal.
- [ ] Attach role-scaled regalia after the model is normalized, without changing colliders, badges, weapons or tactical tokens.
- [ ] Animate only lightweight transforms/emissive intensity: Ember accents breathe like coals; Hollow accents drift like cold witch-light. Low quality keeps silhouette geometry but disables secondary motes.
- [ ] Strengthen faction materials so Ember reads warm/crimson/gold and Hollow reads cold/bone/violet without flattening existing texture detail.
- [ ] Run focused tests, full unit tests and build.
- [ ] Commit as `feat: bind faction identity to every fighter`.

### Task 3: Selection and Capture Feedback

**Files:**
- Modify: `web/src/scene/pieces.ts`
- Modify: `web/src/scene/effects.ts`
- Create: `web/src/test/factionFeedback.test.ts`

**Interfaces:**
- Produces pure `factionFeedback(faction, state)` values for aura colour, emissive multiplier and pulse rate.
- Reuses existing `setSelected`, `setHovered`, hit and aura clocks; chess input paths remain unchanged.

- [ ] Write failing tests that require Ember selection to use molten-gold feedback, Hollow selection to use cyan-violet feedback, and capture/hit feedback to remain visually stronger than hover.
- [ ] Apply faction-specific selection rings, legal-move emphasis and post-capture aura without adding new always-on point lights.
- [ ] Ensure feedback remains visible under 360×640 low-quality rendering and reduced motion.
- [ ] Run focused/full tests and build.
- [ ] Commit as `feat: make faction actions readable at a glance`.

### Task 4: Visual Gate, Release and Production Smoke

**Files:**
- Modify: `web/scripts/qa-responsive.mjs`
- Modify: `ASSET_REGISTER.md`
- Modify: `docs/superpowers/plans/2026-11-15-stage-two-cohesive-armies.md`

**Interfaces:**
- QA exposes and verifies 32 regalia groups, six role styles per faction, and successful low/medium rendering.

- [ ] Extend the review probe so QA fails if any live piece lacks faction regalia or if either faction lacks all six role styles.
- [ ] Build and capture 360×640 low, 390×664 phone, 810×1080 tablet and 1440×900 desktop screenshots, including selected Ember and Hollow pieces.
- [ ] Visually inspect that factions and roles are distinguishable without relying only on floating badges.
- [ ] Run 258+ unit tests, 14+ browser tests, production build, Worker tests/typecheck and relay 37/37.
- [ ] Record procedural provenance in `ASSET_REGISTER.md`.
- [ ] Commit, merge to `main`, push, deploy the existing Vercel project and repeat live responsive plus create/join/move/reconnect smoke tests.
