# REQUIEM OF KINGS
### Asset Register & Licences

All assets incorporated into REQUIEM OF KINGS conform to open-source, permissive, or procedurally generated licences.

---

## 1. Code & Libraries

| Dependency | Purpose | Licence | Link / Reference |
|---|---|---|---|
| `chess.js` (1.4.0) | Authoritative chess rules & move generation | BSD-2-Clause | https://github.com/jhlywa/chess.js |
| `three` (0.185.1) | 3D WebGL rendering engine | MIT | https://github.com/mrdoob/three.js |
| `react` (19.2.7) | User interface framework | MIT | https://react.dev |
| `lucide-react` | Dark-fantasy compatible vector UI icons | ISC | https://lucide.dev |
| `tailwindcss` | Utility-first interface styling | MIT | https://tailwindcss.com |
| `vitest` (4.1.9) | Unit test framework | MIT | https://vitest.dev |
| `playwright` (1.60.0) | End-to-end browser verification | Apache-2.0 | https://playwright.dev |

---

## 2. 3D Models & Animations

| Asset Group | Format | Provenance | Licence / Terms | Location |
|---|---|---|---|---|
| Imperial Rome Roster (`p, n, b, r, q, k`) | glTF / GLB Binary | Local repository assets (rigged + idle/attack/death/walk clips) | MIT / Project Baseline | `public/models/rome/` |
| Sengoku Roster (`p, n, b, r, q, k`) | glTF / GLB Binary | Local repository assets (rigged + idle/attack/death/walk clips) | MIT / Project Baseline | `public/models/sengoku/` |
| New Kingdom Egypt Roster (`p, n, b, r, q, k`) | glTF / GLB Binary | Local repository assets (rigged + idle/attack/death/walk clips) | MIT / Project Baseline | `public/models/egypt/` |
| Core Rigged Heroes (Ember Court & Hollow Legion) | glTF / GLB Binary | Procedural/AI-sculpted character models with standard humanoid rigs | MIT Baseline | `src/assets/generated.ts` |
| Stage One dragon silhouette | Runtime Three.js geometry | Original procedural body, head, tail, wings and ember details built with project-owned code | Project-owned procedural work; no new third-party asset licence | `web/src/scene/dragonFlight.ts` |
| Stage One throne-temple extensions | Runtime Three.js geometry and existing procedural textures | Original broken crown arches, torn faction banners and magical beacons built with project-owned code using the existing cloth/scene texture generators | Project-owned procedural work and existing project textures; no new third-party asset licence | `web/src/scene/battlefield.ts`, `web/src/scene/textures.ts` |
| Stage Two Ember Court / Hollow Legion regalia | Runtime Three.js geometry and materials | Original project-authored procedural armour plates, bone ribs, shoulder battlements, knight crests/horns, ritual backpieces, crowns, shrouds and royal banners; 12 faction/role styles layered over the existing rigged heroes. Geometry is shared by style; instance materials and optional motes are owned by each fighter. No downloaded character model, texture or generated bitmap was added. | Project-owned procedural work using the existing Three.js dependency; upstream MIT licence and baseline model provenance remain applicable | `web/src/scene/factionRegalia.ts`, integrated by `web/src/scene/pieces.ts` |
| Stage Two faction action feedback | Runtime Three.js materials and existing effects | Original faction palette and intensity rules for warm molten-gold Ember and cold cyan/violet Hollow selection, hover, hit and capture feedback; existing ring/particle primitives reused without new external assets | Project-owned procedural work; no new third-party asset licence | `web/src/scene/effects.ts`, `web/src/scene/pieces.ts` |

---

## 3. Audio & Music Assets

| Asset Type | Synthesis / Format | Source | Notes |
|---|---|---|---|
| Footstep SFX (Scuff, Leather, Plate, Regal) | Web Audio Procedural Synthesis | `src/audio/audioManager.ts` | Real-time parametric DSP |
| Wood Board Taps | Web Audio Procedural Synthesis | `src/audio/audioManager.ts` | Real-time parametric DSP |
| Blade Whooshes & Impacts | Web Audio Procedural Synthesis | `src/audio/audioManager.ts` | Real-time noise + bandpass DSP |
| Magic Charges & Spell Bursts | Web Audio Procedural Synthesis | `src/audio/audioManager.ts` | Multi-oscillator frequency modulation |
| Ambient & Tension Beds | MP3 Audio | Audio mixer buffer | Licensed royalty-free asset |
| Character Voices / Cries | MP3 Audio | Spatialized lazy audio buffer | Licensed royalty-free asset |
