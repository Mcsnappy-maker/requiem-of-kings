import { describe, expect, it } from "vitest";
import { phoneHudPolicy } from "../ui/mobileHud";

describe("phone HUD", () => {
  it("shows only match-critical actions directly on a narrow phone", () => {
    expect(phoneHudPolicy(390)).toEqual({ compact: true, directActions: ["undo", "resign", "menu"] });
    expect(phoneHudPolicy(1024).compact).toBe(false);
  });

  it("keeps the full toolbar from the tablet breakpoint onward", () => {
    expect(phoneHudPolicy(639).compact).toBe(true);
    expect(phoneHudPolicy(640)).toEqual({
      compact: false,
      directActions: ["undo", "resign", "new-game", "sound", "fullscreen", "flip", "tactical", "menu", "settings"],
    });
  });
});
