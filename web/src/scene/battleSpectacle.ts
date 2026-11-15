import type { Faction, PieceKind } from "../core/types";

export type DragonEventReason = "check" | "promotion" | "major-capture" | "victory";

export interface FactionSpectacle {
  impactColor: number;
  secondaryColor: number;
  slashColor: number;
  kingSlashColor: number;
  deathEmberColor: number;
  deathSmokeColor: number;
  victoryColor: number;
  victorySecondary: number;
  victorySmokeColor: number;
}

const SPECTACLE: Record<Faction, FactionSpectacle> = {
  w: {
    impactColor: 0xffb347,
    secondaryColor: 0xff5a1f,
    slashColor: 0xff9e3b,
    kingSlashColor: 0xffdf9a,
    deathEmberColor: 0xff7a2e,
    deathSmokeColor: 0x5a3a28,
    victoryColor: 0xffc35a,
    victorySecondary: 0xff5e1a,
    victorySmokeColor: 0x4a2c1c,
  },
  b: {
    impactColor: 0x78e5ff,
    secondaryColor: 0x9333ea,
    slashColor: 0x6ee7ff,
    kingSlashColor: 0xd8b4fe,
    deathEmberColor: 0x68d8ff,
    deathSmokeColor: 0x2d2442,
    victoryColor: 0x55e8ff,
    victorySecondary: 0xa855f7,
    victorySmokeColor: 0x221b38,
  },
};

export function factionSpectacle(faction: Faction): FactionSpectacle {
  return SPECTACLE[faction];
}

export interface DragonEventInput {
  check?: boolean;
  promotion?: PieceKind | null;
  captured?: PieceKind | null;
  gameOver?: boolean;
  isDraw?: boolean;
}

export function shouldTriggerDragonEvent(event: DragonEventInput): boolean {
  if (event.gameOver) return !event.isDraw;
  if (event.check) return true;
  if (event.promotion) return true;
  return event.captured === "q" || event.captured === "r";
}
