# REQUIEM OF KINGS
### Technical Architecture & Systems Design

---

## 1. System Overview

```
                      +-----------------------------+
                      |       React 19 Shell        |
                      |   (MainMenu, HUD, Modals,   |
                      |     Settings, Accessibility)|
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |    GameController (Core)    |
                      |   • chess.js 1.4 Rules Engine|
                      |   • Move & History Ledger   |
                      |   • Game State Snapshots    |
                      +-------+--------------+------+
                              |              |
           Move Events / FEN  |              | Web Worker Engine
                              v              v
       +-------------------------------+   +-------------------+
       |     SceneEngine (Three.js)    |   | AI Worker Engine  |
       |  • CastleHall (Ashen Throne)  |   | (Alpha-Beta /     |
       |  • BoardView (Obsidian/Stone) |   |  Iterative Deep)  |
       |  • PieceFactory & PieceViews  |   +-------------------+
       |  • CombatMachine (Captures)   |
       |  • CameraDirector & FX        |
       +---------------+---------------+
                       |
                       v
       +-------------------------------+
       |     Web Audio Sound Engine    |
       |  • Layered Synthesized Audio  |
       |  • Panned Spatial Audio       |
       |  • Ambience, Spells & Cries   |
       +-------------------------------+
```

---

## 2. Core Modules

### 2.1 Chess Core (`src/core/`)
- `gameController.ts`: Authoritative chess game manager running `chess.js`. Dispatches move events, tracks turn state, legal moves, undo stack, clocks, and terminal conditions.
- `combatMachine.ts`: Deterministic, pure-TypeScript state machine orchestrating capture timing (`arm` -> `approach` -> `startup` -> `active` -> `recovery` -> `resolve` -> `done`). Bounded by explicit watchdog budgets to prevent turn lockup.
- `types.ts`: Render-agnostic domain models, game snapshots, faction types, and notation structures.

### 2.2 3D Rendering Pipeline (`src/scene/`)
- `sceneEngine.ts`: Central Three.js scene manager. Handles render loop, camera transitions, piece management, raycasting input, and combat execution.
- `environment.ts` (`CastleHall`): Procedural Gothic throne room environment including vaulted ceilings, stone colonnades, stained-glass windows, light shafts, burning braziers, dust, and lightning flashes.
- `arena.ts`: Environment presets (`ashen` [The Ashen Throne], `dusk`, `frost`, `dawn`, `jungle`) governing lighting, fog, bloom, and color grading.
- `board.ts` (`BoardView`): 64-tile PBR chessboard with bevelled tiles, marble/obsidian surface response, animated landing ripples, shockwaves, and highlight beams.
- `pieces.ts` (`PieceFactory`, `PieceView`): Rigged glTF model instantiation, animation mixer blending, faction livery shading, and custom GLSL noise dissolve shaders.
- `strikes.ts` & `spells.ts`: Particle effects, slashes, ground shockwaves, judgement pillars, and projectile spells.

### 2.3 Audio Engine (`src/audio/`)
- `audioManager.ts`: Web Audio API graph providing spatial panning, synthesised footfalls by armor weight, wooden board knocks, blade whooshes, magical spell charges, impact blasts, and death voices.

---

## 3. Separation of Concerns & Invariants

1. **Rule of Separation:** The chess rules engine is completely decoupled from rendering. The chess state is always authoritative; visual animations are strictly reactive.
2. **Watchdog Safety:** Every cinematic sequence is bounded by a strict timeout budget. If an animation or asset fails to resolve within its window, the turn is released safely and the board state snaps to the correct FEN.
3. **Zero Resource Leaks:** Three.js geometries, materials, and textures are explicitly tracked and disposed of during scene transitions or piece replacements.
