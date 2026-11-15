# Requiem of Kings — Visual Rebuild Design

**Status:** Approved direction  
**Date:** 15 November 2026

## Outcome

Turn the working multiplayer chess prototype into a visually distinct dark-fantasy battle game that is exciting on first load, readable on a phone, and no longer resembles the baseline repository with a new name.

This is a staged production rebuild. The £5 million comparison remains the quality aspiration, not a claim about the present build or budget.

## Creative Direction

The visual tone is cinematic dark fantasy with saturated magical colour. The world may be ominous, but the board, pieces, legal moves and current player must remain immediately readable. Black-on-black presentation is forbidden.

The two armies are deliberately different:

- **The Ember Court:** scarred human champions, living armour, fire-forged weapons, crimson cloth and molten-gold magic.
- **The Hollow Legion:** revenants, bone constructs, wraiths and cursed royalty, with cold cyan, violet and corpse-green magic.

Dragons belong to the identity of the game. The first release introduces a dragon as an animated environmental presence and match-event spectacle. A later asset-production stage may promote dragons into bespoke hero pieces once suitable mobile-ready, legally cleared models and animations exist.

## Considered Approaches

### 1. Recommended: staged vertical-slice rebuild

Rebuild the visible battlefield and phone experience first, then replace the roster in reviewed batches. This produces frequent playable releases while protecting multiplayer and performance.

### 2. Full asset replacement before another release

This could create greater consistency at launch, but requires a complete commissioned or licensed 3D roster before users see any improvement. It delays evidence and carries the highest licensing and performance risk.

### 3. Continue procedural reskinning

This is fast but is rejected. It created the current problem: renamed factions and mismatched characters without a distinct game identity.

## Stage 1 — Battlefield and Mobile Presentation

Stage 1 must make an unmistakable difference before replacing the full roster:

- Replace the generic arena treatment with a ruined throne-temple battlefield: broken arches, banners, braziers, carved faction motifs, depth fog and a dramatic but readable sky.
- Add a distant dragon fly-by or perch silhouette with restrained animation and fire/ember effects. It must never obscure squares or controls.
- Give each side a strong colour-language that remains distinguishable under mobile low-quality rendering.
- Reduce the phone HUD footprint. Essential controls remain at least 44×44 pixels; secondary controls move into one menu.
- Keep the board and all occupied squares visible without requiring a camera gesture.
- Improve selection, legal-move and capture feedback so a child can understand what happened without reading instructions.

## Stage 2 — Cohesive Armies

- Remove all visibly mismatched showcase characters.
- Define one silhouette and material brief for each chess role in each faction.
- Replace models only with assets that are legally cleared, recorded in `ASSET_REGISTER.md`, and tested on target phones.
- Keep a consistent scale, texel density, rig convention, weapon proportion and animation vocabulary.
- Prioritise kings, queens and knights because they create the strongest first impression.

No model will be described as bespoke if it is licensed, generated, adapted or procedurally assembled.

## Stage 3 — Battle Spectacle

- Add short, skippable combat moments for captures rather than long interruptions.
- Add faction-specific spell, impact, death and victory effects.
- Use dragon appearances for rare, meaningful events rather than constant background noise.
- Preserve chess clarity: spectacle follows the committed move and never changes chess rules.

## Interaction and Multiplayer

The existing link-based online match flow, reconnect tokens and saved match state remain authoritative. Visual changes must not alter chess legality, room joining or reconnection behaviour.

On phones, the default view prioritises the board. The current player, match state and one menu remain visible. Camera, sound, tactical view and settings remain accessible without occupying most of the top third of the display.

## Performance Rules

- Phone low-quality mode is a first-class art target, not a degraded afterthought.
- The opening view must remain readable at 360×640 CSS pixels.
- Decorative effects use quality tiers and may be disabled without losing gameplay information.
- New geometry is instanced where practical; textures and models use compressed delivery where browser support permits.
- No release may regress WebGL stability, touch targets or horizontal overflow.

## Verification Gates

Every visual stage must pass:

1. Unit and browser tests.
2. Production build.
3. Phone, tablet and desktop layout checks.
4. A real rendered screenshot review at phone size—not merely a canvas-exists check.
5. A multiplayer create/join/reconnect smoke test.
6. Asset licence and attribution review.

## Completion Boundary

Stage 1 is complete only when a side-by-side phone screenshot is obviously different from the baseline repo and the battle remains playable and readable. The overall creative rebuild is not complete until both armies and battle presentation meet the same cohesive standard.
