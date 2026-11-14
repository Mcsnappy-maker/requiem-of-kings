import { describe, expect, it } from "vitest";

import { readabilityForViewport } from "../scene/mobileReadability";

describe("mobile scene readability", () => {
  it("adds a substantial light lift only to coarse portrait phone viewports", () => {
    expect(readabilityForViewport(360, 760, true)).toEqual({ exposureScale: 1.5, lampScale: 3 });
    expect(readabilityForViewport(810, 1080, true)).toEqual({ exposureScale: 1.15, lampScale: 1.5 });
    expect(readabilityForViewport(1440, 900, false)).toEqual({ exposureScale: 1, lampScale: 1 });
  });
});
