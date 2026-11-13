# REQUIEM OF KINGS — Cinematic Dark-Fantasy Chess

> *"Chess is the strategy. Fantasy is the world. Combat is the spectacle."*

An epic, cinematic dark-fantasy 3D chess experience running directly in modern desktop and mobile web browsers.

**The Ember Court** (ancient obsidian and blackened steel ignited by molten flames) battles **The Hollow Legion** (spectral undead champions animated by forbidden violet necromancy) inside the monumental Gothic arches of **The Ashen Throne** cathedral.

Built with **React 19 + TypeScript + Three.js**, [chess.js](https://github.com/jhlywa/chess.js) for authoritative tournament chess validation, Web Workers for local AI adversaries, and a Web Audio dynamic orchestral soundscape.

---

## Table of Contents

- [Core Philosophy](#core-philosophy)
- [The Playable Factions & Hero Roster](#the-playable-factions--hero-roster)
- [The Environment: The Ashen Throne](#the-environment-the-ashen-throne)
- [Chess Mechanics & Combat Spectacle](#chess-mechanics--combat-spectacle)
- [Accessibility & Cinematic Controls](#accessibility--cinematic-controls)
- [Quick Start & Local Development](#quick-start--local-development)
- [Controls & Shortcuts](#controls--shortcuts)
- [Game Modes](#game-modes)
- [Architecture](#architecture)
- [Testing & Quality Verification](#testing--quality-verification)
- [License](#license)

---

## Core Philosophy

1. **Strategic Integrity:** Absolute fidelity to international chess rules. Every move, capture, check, checkmate, stalemate, castling, en passant, and promotion is validated by chess.js.
2. **Atmospheric Immersion:** A dark-fantasy aesthetic crafted for lovers of deep fantasy lore, mythical beasts, and authentic tactical strategy.
3. **Visceral Spectacle:** Hand-to-hand clashes, ground-shattering shockwaves, and ranged incantations where combat outcomes are 100% determined by chess moves.

---

## The Playable Factions & Hero Roster

Every piece is a fully realized fantasy hero class with dedicated visual styling, custom heraldic insignia, walk cycles, attack choreographies, and dissolution effects.

### The Ember Court (White)
*An ancient royal dynasty clad in blackened steel plate, crimson cloaks, antique gold filigree, and burning molten swords.*

- **King — The Ashen King:** Heavy ceremonial monarch wielding a legendary greatsword, executing divine royal judgment.
- **Queen — The Flame Sorceress:** Ornate battle mage channeling devouring molten fireballs and multi-bolt volleys from across the board.
- **Bishop — The Fire Priest:** Holy cleric wielding sacred flame and ancient sunfire staves.
- **Knight — The Ember Paladin:** Heavily armoured champion executing vicious charging leaping strikes.
- **Rook — The Iron Sentinel:** Living fortress of iron and carved masonry that slams the earth with concussive shockwaves.
- **Pawn — The Oathbound Soldier:** Frontline royal infantry disciplined in shield and blade combat.

### The Hollow Legion (Black)
*A fallen empire awakened through forbidden necromancy, cloaked in obsidian plate, tattered shroudcloth, bone detailing, and supernatural violet flame.*

- **King — The Hollow Sovereign:** Spectral undead lord wearing a shattered crown and radiating necrotic ruin.
- **Queen — The Deathweaver:** High necromancer summoning swirling spectral void orbs that rip through enemy ranks.
- **Bishop — The Plague Oracle:** Eldritch seer channeling cursed sorceries.
- **Knight — The Dread Rider:** Corrupted spectral rider who vaults into combat with ghostly scythe strikes.
- **Rook — The Bone Colossus:** Towering behemoth of calcified stone and ancient necromancy.
- **Pawn — The Risen Warrior:** Relentless skeletal soldier marching forward with weathered cursed iron.

---

## The Environment: The Ashen Throne

The default battlefield is **The Ashen Throne** cathedral arena:
- **Monumental Architecture:** Soaring cross-vaulted Gothic stone arches rising to an ornate keystone apex.
- **Stained Glass & Lighting:** An intricate Gothic Rose Window overlooking the northern dais, illuminated by distant cathedral thunderstorm lightning flashes.
- **Heraldry:** Four weathered, waving faction banners framing the arena (Ember Court flaming crowns and Hollow Legion horned crests).
- **Monumental Board:** Obsidian and pale weathered stone squares, hand-finished borders with glowing coordinate runes and metallic corner brackets.
- **Atmospheric Particles:** Floating embers, drifting cathedral dust motes, and volumetric torchlight.

*(Alternative battlegrounds remain selectable in Settings: Sun Temple, Dawn Court, Frostfall, and Siege at Dusk).*

---

## Chess Mechanics & Combat Spectacle

- **No Sliding Chess Pawns:** Moved pieces pivot towards their target, march forward at the natural cadence of their armor, and square up upon arrival. Knights leap gracefully over intervening pieces.
- **Ranged vs Melee Kills:**
  - *Melee:* The attacker charges in, squares up, strikes on the hit frame with faction-tinted blade slashes, releases earth-shaking shockwaves, and the defeated foe collapses into glowing ember dust.
  - *Ranged:* Casters (The Flame Sorceress & Deathweaver) strike from their square, summoning arcane orbs that illuminate the dark hall in flight before detonating on the target.
- **Rank-Scaled Weight:** Pawns deliver swift tactical stabs; heavy Rooks send tremors across the stone; Kings cast down a judgment pillar of light before delivering their finishing strike.
- **Stride-Synchronized Audio:** Web Audio footfalls match foot strikes, accompanied by blade whooshes, hammer slams, voice cries, and dynamic battle orchestrations.

---

## Accessibility & Cinematic Controls

In the **Settings Panel (Gear Icon)**:
- **Cinematic Intensity:**
  - `Full`: Dramatic camera zooms, wind-ups, execution pillars, and spell volleys.
  - `Short`: Snappy, accelerated combat beats for fast-paced blitz play.
  - `Skip`: Instant piece repositioning with simple capture fades.
- **Reduced Motion:** Disables camera FOV zooms, screen shakes, and camera swaying for players sensitive to motion.
- **Reduced Flashing:** Softens flash light bursts, lightning strikes, and spell burst brightness for photosensitive players.
- **2D Tactical View (`T` key):** Immediately elevates the camera overhead and flattens figures into clean, highly readable geometric heraldic tokens.

---

## Quick Start & Local Development

### Prerequisites
- **Node.js 20+** and **npm** (or **bun**)

### Installation & Run

```bash
# Clone the repository
git clone <repo-url>
cd requiem-of-kings/web

# Install dependencies
npm install

# Start Vite development server
npm run dev
# -> Opens http://localhost:5173

# Run unit tests
npm test -- --run

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

The production output in `web/dist/` is a zero-dependency static application ready for deployment to any static host (GitHub Pages, Netlify, Cloudflare Pages, etc.).

---

## Controls & Shortcuts

| Action | Control |
| --- | --- |
| **Select Piece** | Left-click on figure (green dots show legal moves, red highlights show captures) |
| **Move Piece** | Click highlighted target square |
| **Orbit / Pan / Zoom** | Right-click/Middle-click drag, scroll wheel, or touch gestures |
| **Flip Perspective (`F`)** | Toggles camera between Ember Court and Hollow Legion views |
| **Tactical View (`T`)** | Toggles 2D top-down heraldic overlay |
| **Cinema Mode (`C`)** | Hides all UI overlays for pure cinematic spectacle |
| **Showcase Pause (`Space`)** | Pauses/resumes automated engine play in Showcase Mode |
| **Settings (`Esc`)** | Opens/closes the Settings panel |

---

## Architecture

- **`src/core/`**: Pure headless chess engine (`chess.js`), clock timers, move validation, and game state snapshots. Zero Three.js dependencies — completely testable headlessly.
- **`src/ai/`**: Negamax engine with alpha-beta pruning, MVV-LVA move ordering, and iterative deepening running in a dedicated `Web Worker` to keep rendering at a locked 60 FPS.
- **`src/scene/`**: Three.js WebGL scene graph, custom shaders, procedural Gothic textures, lighting, camera choreography, and particle systems.
- **`src/audio/`**: Synthesized stereo Web Audio engine with procedural footsteps, blade impacts, magic bursts, and dynamic music layering.
- **`src/ui/`**: Modern React 19 UI with Tailwind CSS, custom Gothic heraldry SVG crests, and accessible modal dialogs.

---

## Testing & Quality Verification

Run the full automated verification test suite:

```bash
cd web
npm test -- --run
```

All 99 unit tests (combat state machines, beat budgets, relay synchronization, terminal states, and multiplayer protocol) pass with 100% compliance.

---

## License

This project is licensed under the [MIT License](LICENSE).
