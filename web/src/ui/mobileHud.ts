export const PHONE_HUD_MAX_WIDTH = 639;

export function phoneHudPolicy(width: number): { compact: boolean; directActions: readonly string[] } {
  const compact = width <= PHONE_HUD_MAX_WIDTH;
  return {
    compact,
    directActions: compact
      ? ["undo", "resign", "menu"]
      : ["undo", "resign", "new-game", "sound", "fullscreen", "flip", "tactical", "menu", "settings"],
  };
}
