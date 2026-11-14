# REQUIEM OF KINGS
### Development Status

**Status Date:** 13 November 2026  
**Current Milestone:** Stage A Complete (Baseline Stabilized), progressing Stage B–H.

---

## Stage Progress Breakdown

| Stage | Name | Target Exit Criteria | Status | Notes |
|---|---|---|---|---|
| **A** | **Baseline & Stabilisation** | Complete legal chess match playable, tests passing, baseline recorded | **COMPLETE** | 99 unit tests passing, build clean in 2.04s, baseline captured |
| **B** | **Requiem of Kings Identity** | Distinct dark-fantasy rebranding across UI, titles, and lore | **IN PROGRESS** | Updating menus, heraldry, faction styling, and copy |
| **C** | **The Ashen Throne** | 3D Gothic cathedral environment with vaulted ribs, stained glass, braziers | **IN PROGRESS** | Creating `ashen` arena look, Gothic ceiling ribs, and braziers |
| **D** | **First Hero Characters** | Showcase Ember Paladin & Deathweaver with custom faction visuals | **IN PROGRESS** | Tuning faction PBR shaders (crimson/steel vs obsidian/violet) |
| **E** | **First Complete Cinematic Capture** | Dramatic capture sequence with camera framing, effects, and watchdog | **IN PROGRESS** | Integrating dynamic cinematic framing and finisher variations |
| **F** | **Complete Factions** | 6 distinct classes per faction (12 total character identities) | **PLANNED** | Titles and roles configured |
| **G** | **Full Combat Library** | Finishers, projectile magic, ground shockwaves, audio synchronization | **PLANNED** | Expanding finisher library |
| **H** | **Production Polish** | Settings, accessibility, audio volume controls, final QA | **PLANNED** | Adding skip/short cinematics and reduced flashing/motion |

---

## Current Blockers & Technical Debt
- **Network Caching on Cold Load:** The 3D models require initial browser caching on cold start; the local fallback models (`public/models/`) are preserved as instant-load alternatives.
- **Audio Autoplay Policy:** Web Audio context requires a user pointer gesture before audio unlocked (managed via `onInteract` in UI).
