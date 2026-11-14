/**
 * Hero characters: the vertical-slice showcase pieces.
 *
 * Unlike the rest of the roster (re-skinned generated sculpts), these two are
 * distinct, properly rigged third-party characters that ship their own
 * skeletal animation library inside a single GLB:
 *
 *   - The Ember Paladin (white knight)  <- KayKit "Knight"          (CC0)
 *   - The Deathweaver   (black queen)   <- KayKit "Skeleton Mage"   (CC0)
 *
 * Both packs are by Kay Lousberg (https://kaylousberg.com), released under
 * CC0 1.0, files and licence texts live in `public/models/requiem/`.
 *
 * Honest scope note: these are stylised low-poly characters, not bespoke
 * hand-sculpted hero meshes. They are a real step up in rig and animation
 * quality over a recolour, and they are dressed here (materials, weapons,
 * glow) to fit the Ember Court / Hollow Legion identities. A truly premium
 * hero needs bespoke modelling - see ASSET_REGISTER.md.
 *
 * Clip references use `url#AnimationName` so one GLB serves every clip.
 */
import type { PieceAnimationSet } from "../assets/generated";

const BASE = `${import.meta.env.BASE_URL ?? "/"}models/requiem/`.replace(/\/{2,}/g, "/");

export type HeroStyle = "paladin" | "deathweaver";

export interface HeroSpec {
  id: string;
  title: string;
  style: HeroStyle;
  /** GLB containing mesh, skeleton and the whole animation library. */
  model: string;
  /** Nodes hidden at load (the pack ships every weapon on the rig). */
  hide: string[];
  /** Prop loaded from a separate file and parented to a bone. */
  prop?: { url: string; bone: string };
  /** Skeletal clip each game state plays. */
  clips: { idle: string; walk: string; run: string; attack: string; death: string; hit: string };
  /** Height multiplier over the board's standard figure for this rank. */
  stature: number;
}

/**
 * Retained as licensed source material, but deliberately not selected by the
 * live Requiem roster. These low-poly showcase figures break the visual
 * language of the more detailed core armies.
 */
export const ARCHIVED_SHOWCASE_HERO_SPECS: Record<string, HeroSpec> = {
  // White knight: The Ember Paladin. Two-handed greatsword, heavy cape.
  wn: {
    id: "wn",
    title: "The Ember Paladin",
    style: "paladin",
    model: `${BASE}Knight.glb`,
    hide: ["1H_Sword", "1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield"],
    clips: {
      idle: "2H_Melee_Idle",
      walk: "Walking_A",
      run: "Running_A",
      attack: "2H_Melee_Attack_Slice",
      death: "Death_A",
      hit: "Hit_A",
    },
    // Showcase heroes should read as champions at the normal gameplay camera,
    // not disappear among the rank crests and procedural soldiers.
    stature: 1.28,
  },
  // Black queen: The Deathweaver. Skeletal necromancer with a spirit staff.
  bq: {
    id: "bq",
    title: "The Deathweaver",
    style: "deathweaver",
    model: `${BASE}Skeleton_Mage.glb`,
    hide: [],
    prop: { url: `${BASE}Skeleton_Staff.gltf`, bone: "handslot.r" },
    clips: {
      idle: "Idle_Combat",
      walk: "Walking_C",
      run: "Running_A",
      attack: "Spellcast_Shoot",
      death: "Death_C_Skeletons",
      hit: "Hit_A",
    },
    stature: 1.27,
  },
};

/** Active bespoke heroes. Keep empty until replacements meet the art brief. */
export const HERO_SPECS: Record<string, HeroSpec> = {};

/** The animation set a hero resolves to, or undefined for ordinary figures. */
export function heroAnimationSet(key: string): PieceAnimationSet | undefined {
  const spec = HERO_SPECS[key];
  if (!spec) return undefined;
  const ref = (clip: string): string => `${spec.model}#${clip}`;
  return {
    rigged: spec.model,
    idle: ref(spec.clips.idle),
    walk: ref(spec.clips.walk),
    run: ref(spec.clips.run),
    attack: ref(spec.clips.attack),
    death: ref(spec.clips.death),
    hit: ref(spec.clips.hit),
  };
}

export function heroSpec(key: string): HeroSpec | undefined {
  return HERO_SPECS[key];
}
