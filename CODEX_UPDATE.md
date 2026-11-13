# REQUIEM OF KINGS — Codex Handoff & Update Log

**Last Updated:** 2026-11-13  
**Project Root:** `C:\Users\mohar\OneDrive\Desktop\codex projects\requiem-of-kings`  
**Latest Commit:** `78423c1` (on branch `main`)

---

## 1. Current State Summary

We pivoted from a full-roster rebrand (`4d3bceb`) to a focused **vertical slice** (`78423c1`): upgrading two showcase characters (**The Ember Paladin** and **The Deathweaver**) to properly rigged, multi-animation 3D hero assets, building a choreographed duel between them, and upgrading **The Ashen Throne** cathedral environment so its Gothic architecture is clearly visible in gameplay and cinematic cameras.

### Test & Build Verification
- **Unit & Browser Tests:** `103/103` passing (`cd web && npm test -- --run`: 102 Vitest unit tests + 1 Chromium browser test).
- **Production Build:** `cd web && npm run build` passes cleanly (`vite build`).
- **Live Dev Server:** `cd web && npm run dev -- --host --port 5173`
  - **Main game:** `http://localhost:5173/`
  - **Instant Hero Duel Scenario:** `http://localhost:5173/?scenario=duel&review=1&quality=high`

---

## 2. What Was Changed in This Update (`78423c1`)

### A. Showcase Hero Pipeline (`web/src/scene/heroes.ts` + `web/public/models/requiem/`)
Instead of recolouring the upstream generated chess pieces, we added a dedicated hero asset pipeline:
- **Licensed Assets (CC0 1.0 by Kay Lousberg):**
  - `web/public/models/requiem/Knight.glb` (76 skeletal animations) -> **The Ember Paladin (`wn`, White Knight)**
  - `web/public/models/requiem/Skeleton_Mage.glb` (95 skeletal animations) + `Skeleton_Staff.gltf` (attached to `handslot.r` bone) -> **The Deathweaver (`bq`, Black Queen)**
  - License files saved alongside assets: `LICENSE-KayKit-Adventurers.txt`, `LICENSE-KayKit-Skeletons.txt`.
- **Single-Parse Shared GLTF Cache & `#ClipName` Addressing (`web/src/scene/pieces.ts`):**
  - `heroes.ts` exports `HERO_SPECS`, `heroSpec()`, and `heroAnimationSet()`, referencing clips inside a single multi-animation GLB via `url#AnimationName` (e.g. `Knight.glb#2H_Melee_Attack_Slice`).
  - `pieces.ts` adds `loadGltfShared()` so multi-clip hero GLBs are fetched and parsed once, `dressHero()` to hide unused pack weapons and attach `hero_prop` to the hand bone, and `applyHeroLook()` to preserve custom emissive materials (e.g., heated `2H_Sword` at `2.2×` emissive, Deathweaver violet `Glow` at `3.2×` emissive).
  - Added `PieceView.playHit()` (plays `hit` clip before `death` clip) and `heroFocus` bounding-box tip calculation in `castOrigin()` so spells fire from the tip of the attached `Skeleton_Staff`.
  - Fixed `takeHit()` emissive blowout: lowered `hitGlow` multiplier from `2.6` / `3.0` to `0.55` / `0.65` so hit characters flash subtly without turning into solid neon-orange silhouettes.

### B. Choreographed Hero Duel (`web/src/scene/sceneEngine.ts` & `web/src/scene/reviewState.ts`)
- **`duel` Scenario (`reviewState.ts`):** Stages White Knight on `d4` vs Black Queen on `e6` (`d4 -> e6`) for deterministic testing and review.
- **`playHeroDuel()` (`sceneEngine.ts`):** Triggered when `piece.heroId === "wn"` in `full` cinematic intensity (non-tactical):
  1. Low three-quarter camera swoop into the lane while both heroes turn to face each other.
  2. **Preparation & Clash:** Deathweaver casts a violet spell bolt (`Spellcast_Shoot` + `gatherSpell` + `throwFireball`) while the Ember Paladin charges in; the bolt shatters on the Paladin's blade.
  3. **Strike & Hitstop:** Paladin executes `2H_Melee_Attack_Slice` with molten slash arc, ground shockwave, camera shake, and brief hitstop.
  4. **Reaction & Defeat:** Victim plays `Hit_A` flinch (`playHit()`), then `Death_C_Skeletons` (`slay()`), dissolves in violet motes (`banish()`), and the camera smoothly returns home.
- **Watchdog Camera Recovery (`sceneEngine.ts`):**
  - Saves `savedShot` before running any capture beat and restores `camera.position`, `controls.target`, and `controls.enabled` if `withWatchdog` fires (preventing the camera from ever getting stuck in a duel angle on slow hardware).
  - Raised frame `delta` cap from `0.05s` to `0.1s` so low-FPS devices do not run tweens in extreme slow motion.

### C. The Ashen Throne Environment (`web/src/scene/environment.ts` & `web/src/scene/arena.ts`)
- **`arena.ts` (`ashen` preset):** Lowered exponential fog density (`0.0165` -> `0.0088`), raised hemisphere light (`0.65` -> `0.85`), and brightened pillar/wall stone tones so the surrounding Gothic cathedral reads clearly instead of disappearing into pitch black.
- **`environment.ts` (`buildGothicDetails()`):**
  - Replaced crude cylinder+cone flank statues with **Gothic wrought-iron & stone braziers** with glowing molten ember beds (`[-7.4, -7.2]` and `[7.4, -7.2]`).
  - Repositioned the **Stained-Glass Rose Window** to `(0, 6.2, -15.4)` with a carved stone torus frame (`TorusGeometry`) so it sits visibly in the north nave behind the board.
  - Lowered the 4 **torn heraldic banners** to `y = 4.5` (`[±8.8, 4.5, -5.8]` and `[±5.5, 4.5, -9.2]`) so they frame the colonnade in gameplay and duel camera shots.

### D. Visual QA Tooling (`web/scripts/`)
- `web/scripts/qa-shot.mjs`: Deterministic single-frame Playwright screenshot helper.
- `web/scripts/qa-video.mjs`: CDP screencast frame recorder + WebM capture for duel verification.
- Captured artifacts in `web/qa-shots/`:
  - `11-ashen-throne-updated.png` (updated Ashen Throne + braziers + hero stances)
  - `duel/` frames and `video/` recording.

---

## 3. Honest Limitations & What Remains for Codex

1. **Asset Realism:** KayKit Knight and Skeleton Mage are **stylized CC0 low-poly rigged characters**. They prove the skeletal animation, bone-prop attachment, material identity, and duel choreography pipeline end-to-end, but achieving realistic dark-fantasy AAA visuals requires replacing `Knight.glb` / `Skeleton_Mage.glb` with higher-detail PBR sculpted & rigged GLBs using the exact same `HERO_SPECS` contract in `src/scene/heroes.ts`.
2. **Remaining 10 Classes:** Only `wn` (Ember Paladin) and `bq` (Deathweaver) use the new `heroes.ts` pipeline. The other 10 classes (`wk`, `wq`, `wb`, `wr`, `wp`, `bk`, `bb`, `bn`, `br`, `bp`) still use the original upstream sculpts until the vertical slice is approved or expanded.
3. **Software WebGL Timing:** In headless Chromium (SwiftShader ~1–3 FPS), the duel exceeds the 11–12s real-time watchdog; on a real desktop GPU at 60 FPS, `playHeroDuel()` completes cleanly in ~3.8 seconds.
4. **Pre-existing TS Note:** `npx tsc --noEmit -p tsconfig.app.json` has 5 pre-existing `Light.shadow` type warnings in `sceneEngine.ts` lines 3831–3856 (from upstream); Vite production build (`npm run build`) and Vitest (`npm test -- --run`) pass with exit code 0.

---

## 4. Key Files Reference

| Area | File |
| :--- | :--- |
| Hero asset specs & clip mapping | `web/src/scene/heroes.ts` |
| Clip types (`hit` clip) | `web/src/assets/generated.ts` |
| Hero loader, prop attach, material & hit flash | `web/src/scene/pieces.ts` |
| `playHeroDuel` choreography & camera recovery | `web/src/scene/sceneEngine.ts` |
| `duel` scenario (`d4` -> `e6`) | `web/src/scene/reviewState.ts` |
| Ashen Throne lighting & fog | `web/src/scene/arena.ts` |
| Gothic rose window, braziers & banners | `web/src/scene/environment.ts` |
| CC0 hero GLBs & licenses | `web/public/models/requiem/` |
| QA screenshot & duel video scripts | `web/scripts/qa-shot.mjs`, `web/scripts/qa-video.mjs` |
