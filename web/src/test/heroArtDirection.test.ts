import { describe, expect, it } from "vitest";

import { heroAnimationSet, heroSpec } from "../scene/heroes";

describe("Requiem hero art direction", () => {
  it("does not replace the core roster with the cartoon KayKit showcase models", () => {
    expect(heroAnimationSet("wn")).toBeUndefined();
    expect(heroAnimationSet("bq")).toBeUndefined();
    expect(heroSpec("wn")).toBeUndefined();
    expect(heroSpec("bq")).toBeUndefined();
  });
});
