import { memo } from "react";

import type { Faction, PieceKind } from "../core/types";

interface CrestProps {
  faction: Faction;
  size?: number;
  active?: boolean;
}

export const FACTION_NAMES: Record<Faction, string> = {
  w: "The Ember Court",
  b: "The Hollow Legion",
};

export const FACTION_SUBTITLES: Record<Faction, string> = {
  w: "Ancient Dynasty of Blackened Steel & Sacred Flame",
  b: "Resurrected Legion of Obsidian & Necromantic Power",
};

export const FACTION_PIECE_TITLES: Record<Faction, Record<PieceKind, string>> = {
  w: {
    k: "The Ashen King",
    q: "The Flame Sorceress",
    b: "The Fire Priest",
    n: "The Ember Paladin",
    r: "The Iron Sentinel",
    p: "The Oathbound Soldier",
  },
  b: {
    k: "The Hollow Sovereign",
    q: "The Deathweaver",
    b: "The Plague Oracle",
    n: "The Dread Rider",
    r: "The Bone Colossus",
    p: "The Risen Warrior",
  },
};

/** Faction crest: The Ember Court (molten crown/lion) and The Hollow Legion (spectral skull). */
export const Crest = memo(function Crest({ faction, size = 34, active = false }: CrestProps) {
  const isEmber = faction === "w";
  const field1 = isEmber ? "#2b1008" : "#140a20";
  const field2 = isEmber ? "#521808" : "#28103d";
  const trim = active ? (isEmber ? "#ffcf66" : "#d8b4fe") : isEmber ? "#c98f28" : "#8b5cf6";
  const chargePrimary = isEmber ? "#ff6b2b" : "#c084fc";
  const chargeSecondary = isEmber ? "#ffcc33" : "#e9d5ff";

  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden="true">
      <defs>
        <linearGradient id={`crest-${faction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={field1} stopOpacity="1" />
          <stop offset="100%" stopColor={field2} stopOpacity="0.88" />
        </linearGradient>
        <filter id={`crest-glow-${faction}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor={chargePrimary} floodOpacity="0.6" />
        </filter>
      </defs>

      {/* Gothic Shield Outline */}
      <path
        d="M20 2 L37 7 V22 C37 33 29 41 20 44 C11 41 3 33 3 22 V7 Z"
        fill={`url(#crest-${faction})`}
        stroke={trim}
        strokeWidth="2"
      />

      {isEmber ? (
        // The Ember Court: Crown of sacred flame & solar sword
        <g filter={`url(#crest-glow-${faction})`}>
          {/* Flame spikes / Crown */}
          <path d="M12 18 L15 11 L20 15 L25 11 L28 18 Z" fill={chargeSecondary} opacity="0.9" />
          {/* Flaming heart / sunburst */}
          <circle cx="20" cy="23" r="5" fill={chargePrimary} />
          {/* Lower sword tip */}
          <path d="M18 27 L20 37 L22 27 Z" fill={chargeSecondary} />
          {/* Crossguard */}
          <rect x="14" y="26" width="12" height="2" rx="0.5" fill={chargeSecondary} />
        </g>
      ) : (
        // The Hollow Legion: Crowned skull / spectral visage
        <g filter={`url(#crest-glow-${faction})`}>
          {/* Broken crown */}
          <path d="M13 16 L16 10 L20 13 L24 10 L27 16 Z" fill={chargePrimary} opacity="0.9" />
          {/* Skull cranium */}
          <path d="M14 20 C14 16 26 16 26 20 C26 25 24 28 22 29 L22 34 L18 34 L18 29 C16 28 14 25 14 20 Z" fill={chargeSecondary} />
          {/* Eye sockets */}
          <ellipse cx="17.5" cy="22" rx="1.6" ry="2.2" fill="#0d0417" />
          <ellipse cx="22.5" cy="22" rx="1.6" ry="2.2" fill="#0d0417" />
          {/* Spectral flame aura */}
          <path d="M20 29 L18 36 L22 36 Z" fill={chargePrimary} opacity="0.75" />
        </g>
      )}

      {/* Heraldic upper banding */}
      <path d="M12 7.5 h16" stroke={trim} strokeWidth="1.2" opacity="0.8" />
    </svg>
  );
});

interface HourglassProps {
  ratio: number;
  urgent: boolean;
}

/** Chess clock rendered as a draining hourglass. */
export const Hourglass = memo(function Hourglass({ ratio, urgent }: HourglassProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const topHeight = 9 * clamped;
  const bottomHeight = 9 * (1 - clamped);
  const sand = urgent ? "#d1553f" : "#d8b163";

  return (
    <svg width="20" height="30" viewBox="0 0 20 30" aria-hidden="true">
      <path d="M3 2 h14 M3 28 h14" stroke="#8a6522" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 3 L16 3 L11 15 L16 27 L4 27 L9 15 Z" fill="rgba(0,0,0,0.35)" stroke="#8a6522" strokeWidth="1.2" />
      <path d={`M5.4 ${4 + (9 - topHeight)} L14.6 ${4 + (9 - topHeight)} L10.6 14 L9.4 14 Z`} fill={sand} opacity="0.95" />
      <rect x="9.4" y="13" width="1.2" height="3" fill={sand} />
      <path d={`M6 26 L14 26 L14 ${26 - bottomHeight} L6 ${26 - bottomHeight} Z`} fill={sand} opacity="0.95" />
    </svg>
  );
});

const GLYPHS: Record<PieceKind, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

export function pieceGlyph(kind: PieceKind): string {
  return GLYPHS[kind];
}
