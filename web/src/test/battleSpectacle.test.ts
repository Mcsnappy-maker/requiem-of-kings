import { describe, expect, it } from "vitest";
import { DragonFlight } from "../scene/dragonFlight";
import { factionSpectacle, shouldTriggerDragonEvent } from "../scene/battleSpectacle";

describe("battle spectacle contract", () => {
  it("gives Ember Court and Hollow Legion distinct impact, death and victory palettes", () => {
    const ember = factionSpectacle("w");
    const hollow = factionSpectacle("b");

    expect(ember.impactColor).not.toBe(hollow.impactColor);
    expect(ember.secondaryColor).not.toBe(hollow.secondaryColor);
    expect(ember.deathEmberColor).not.toBe(hollow.deathEmberColor);
    expect(ember.deathSmokeColor).not.toBe(hollow.deathSmokeColor);
    expect(ember.victoryColor).not.toBe(hollow.victoryColor);
    expect(ember.victorySecondary).not.toBe(hollow.victorySecondary);
    expect(ember.victorySmokeColor).not.toBe(hollow.victorySmokeColor);
  });

  it("triggers dragon appearances only for rare meaningful match events", () => {
    expect(shouldTriggerDragonEvent({ check: true })).toBe(true);
    expect(shouldTriggerDragonEvent({ promotion: "q" })).toBe(true);
    expect(shouldTriggerDragonEvent({ captured: "q" })).toBe(true);
    expect(shouldTriggerDragonEvent({ captured: "r" })).toBe(true);
    expect(shouldTriggerDragonEvent({ gameOver: true, isDraw: false })).toBe(true);

    expect(shouldTriggerDragonEvent({})).toBe(false);
    expect(shouldTriggerDragonEvent({ captured: "p" })).toBe(false);
    expect(shouldTriggerDragonEvent({ captured: "n" })).toBe(false);
    expect(shouldTriggerDragonEvent({ captured: "b" })).toBe(false);
    expect(shouldTriggerDragonEvent({ gameOver: true, isDraw: true })).toBe(false);
  });

  it("keeps DragonFlight quiet in event-driven mode until triggered, then flies one pass", () => {
    const flight = new DragonFlight();
    flight.setAmbientLoop(false);

    flight.update(4);
    expect(flight.group.visible).toBe(false);

    expect(flight.trigger(10, "check")).toBe(true);
    flight.update(10);
    expect(flight.group.visible).toBe(true);
    flight.update(18);
    expect(flight.group.visible).toBe(true);
    flight.update(26.1);
    expect(flight.group.visible).toBe(false);

    // Cooldown blocks immediate back-to-back non-victory triggers
    expect(flight.trigger(27, "major-capture")).toBe(false);
    // Victory bypasses cooldown
    expect(flight.trigger(27, "victory")).toBe(true);
    flight.update(28);
    expect(flight.group.visible).toBe(true);

    flight.dispose();
  });
});
