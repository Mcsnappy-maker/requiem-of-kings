import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Faction } from "../core/types";
import { factionFeedback } from "../scene/effects";
import { PieceView } from "../scene/pieces";
import { BoardView, squareToWorld } from "../scene/board";

// Only browser canvas painting is replaced; scene/material behavior stays real.
vi.mock("../scene/textures", () => Object.fromEntries([
  "radialTexture", "boardBorderTexture", "captureMarkerTexture", "castleMarkerTexture",
  "columnTexture", "marbleTexture", "moveMarkerTexture", "promoteMarkerTexture",
  "landingRingTexture", "selectMarkerTexture", "shockwaveTexture", "tileMaskTexture",
].map((name) => [name, () => new THREE.Texture()])));
vi.mock("../scene/detail", () => {
  const surface = () => ({ normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() });
  return { wearSurface: surface, metalSurface: surface, marbleSurface: surface };
});

vi.mock("../scene/rankBadges", async (importOriginal) => ({
  ...await importOriginal<typeof import("../scene/rankBadges")>(),
  rankBadgeTexture: () => new THREE.Texture(),
  tacticalTokenTexture: () => new THREE.Texture(),
}));

const factions: Faction[] = ["w", "b"];

function fighter(faction: Faction, idleAnimation = false) {
  const model = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.2), new THREE.MeshStandardMaterial());
  model.add(body);
  const view = new PieceView("p", faction, model, { contactShadows: false, idleAnimation });
  return { view, body };
}

function aura(view: PieceView) {
  return view.container.getObjectByName("faction-aura") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

describe("faction action feedback policy", () => {
  it("gives Ember molten-gold selection and Hollow cyan-violet selection", () => {
    expect(factionFeedback("w", "selected")).toMatchObject({ auraColor: 0xffc35a, emissiveColor: 0xffa52e });
    expect(factionFeedback("b", "selected")).toMatchObject({ auraColor: 0x78e5ff, emissiveColor: 0xb892ff });
    expect(factionFeedback("w", "selected").pulseRate).toBeGreaterThan(factionFeedback("b", "selected").pulseRate);
  });

  it.each(factions)("keeps hit/capture stronger than hover and selection for %s", (faction) => {
    const hover = factionFeedback(faction, "hover");
    const selected = factionFeedback(faction, "selected");
    for (const state of ["hit", "capture"] as const) {
      const feedback = factionFeedback(faction, state);
      expect(feedback.emissiveMultiplier).toBeGreaterThan(selected.emissiveMultiplier);
      expect(feedback.auraOpacity).toBeGreaterThan(selected.auraOpacity);
      expect(feedback.auraScale).toBeGreaterThan(hover.auraScale);
    }
    expect(selected.emissiveMultiplier).toBeGreaterThan(hover.emissiveMultiplier);
    expect(selected.auraOpacity).toBeGreaterThan(hover.auraOpacity);
    expect(factionFeedback(faction, "legal").auraOpacity).toBeGreaterThanOrEqual(0.5);
    expect(factionFeedback(faction, "capture").auraOpacity).toBeLessThanOrEqual(1);
    expect(factionFeedback(faction, "selected")).toEqual(selected);
  });
});

describe("fighter feedback on low quality / frozen ambient motion", () => {
  it.each(factions)("retains static %s selection, hit and capture with no point lights", (faction) => {
    const { view, body } = fighter(faction);
    view.setHovered(true);
    view.update(0.125, 1);
    const hover = body.material.emissiveIntensity;
    view.setSelected(true);
    view.update(0.125, 1);
    const selected = body.material.emissiveIntensity;
    const glow = aura(view);
    expect(glow.material.color.getHex()).toBe(factionFeedback(faction, "selected").auraColor);
    expect(glow.material.opacity).toBeGreaterThanOrEqual(0.6);
    expect(glow.material.toneMapped).toBe(false);
    expect(selected).toBeGreaterThan(hover);
    const opacity = glow.material.opacity;
    view.update(0.125, 20);
    expect(glow.material.opacity).toBe(opacity);
    expect(body.material.emissive.getHex()).toBe(factionFeedback(faction, "selected").emissiveColor);
    view.takeHit();
    view.update(0.016, 20);
    expect(body.material.emissiveIntensity).toBeGreaterThan(selected);
    expect(glow.material.opacity).toBeGreaterThan(opacity);
    view.resetPose();
    view.setHovered(true);
    view.update(0.125, 20);
    const hoverOpacity = glow.material.opacity;
    view.flareAura();
    view.update(0.016, 20);
    expect(glow.material.opacity).toBeGreaterThan(hoverOpacity);
    expect(glow.material.color.getHex()).toBe(factionFeedback(faction, "capture").auraColor);
    const lights: THREE.Object3D[] = [];
    view.container.traverse((node) => { if ((node as THREE.Light).isLight) lights.push(node); });
    expect(lights).toHaveLength(0);
    expect(view.hitMeshes).toHaveLength(1);
    view.dispose();
  });

  it.each(factions)("keeps the faction hue on a dying %s fighter", (faction) => {
    const { view, body } = fighter(faction);
    view.takeHit();
    view.playDeath();
    view.update(0.016, 1);
    expect(body.material.emissive.getHex()).toBe(factionFeedback(faction, "hit").emissiveColor);
    view.dispose();
  });

  it.each(factions)("keeps %s impact color on the tactical counter", (faction) => {
    const { view } = fighter(faction);
    view.setFlat(true);
    view.takeHit();
    view.update(0.1, 2);
    const token = view.container.children.find((node) => node.renderOrder === 12) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    if (faction === "w") expect(token.material.color.r).toBeGreaterThan(token.material.color.b);
    else expect(token.material.color.b).toBeGreaterThan(token.material.color.r);
    view.setAlarm(1);
    view.update(0.1, Math.PI / 14);
    expect(token.material.color.r).toBeGreaterThan(token.material.color.b);
    view.dispose();
  });
});

describe("faction legal destinations", () => {
  it.each(factions)("colors %s selection and legal moves without losing destination symbols", (faction) => {
    const board = new BoardView();
    const at = squareToWorld("d4");
    const marker = board.group.children.find((node) => node.renderOrder === 4 && node.position.x === at.x && node.position.z === at.z) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const glow = board.group.children.find((node) => node.renderOrder === 2 && node.position.x === at.x && node.position.z === at.z) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    board.setHighlight("d4", "move", false, 0, faction);
    board.update(0.3);
    const moveMap = marker.material.map;
    const moveOpacity = glow.material.opacity;
    expect(marker.visible).toBe(true);
    expect(marker.material.color.getHex()).toBe(factionFeedback(faction, "legal").emissiveColor);
    expect(glow.material.color.getHex()).toBe(factionFeedback(faction, "legal").auraColor);
    expect(glow.material.opacity).toBeGreaterThanOrEqual(0.5);
    expect(marker.material.toneMapped).toBe(false);
    board.setHighlight("d4", "capture", true, 0, faction);
    board.update(0.3);
    expect(marker.material.map).not.toBe(moveMap);
    expect(glow.material.opacity).toBeGreaterThan(moveOpacity);
    board.setHighlight("d4", "select", false, 0, faction);
    board.update(0.3);
    expect(marker.material.map).not.toBe(moveMap);
    expect(glow.material.color.getHex()).toBe(factionFeedback(faction, "selected").auraColor);
    board.setHighlight("d4", "check");
    expect(marker.material.color.getHex()).toBe(0xff3b30);
    board.clearHighlights();
    expect(marker.visible).toBe(false);
    board.dispose();
  });
});
