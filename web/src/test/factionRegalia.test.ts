import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Faction, PieceKind } from "../core/types";
import { buildFactionRegalia, regaliaDescriptor } from "../scene/factionRegalia";

const factions: Faction[] = ["w", "b"];
const roles: PieceKind[] = ["p", "n", "b", "r", "q", "k"];
const combinations = factions.flatMap((faction) => roles.map((kind) => ({ faction, kind })));

describe("faction regalia art contract", () => {
  it.each(combinations)("describes $faction $kind with its own role silhouette", ({ faction, kind }) => {
    const descriptor = regaliaDescriptor(faction, kind);
    expect(descriptor).toMatchObject({ faction, kind });
    expect(descriptor.style.length).toBeGreaterThan(0);
    expect(descriptor.shoulders).toBeTruthy();
    expect(descriptor.aura).toBeTruthy();
    const otherStyles = roles.filter((role) => role !== kind).map((role) => regaliaDescriptor(faction, role).style);
    expect(otherStyles).not.toContain(descriptor.style);
  });

  it.each(roles)("separates warm and cold magical light for role %s", (kind) => {
    const warm = new THREE.Color(regaliaDescriptor("w", kind).accent);
    const cold = new THREE.Color(regaliaDescriptor("b", kind).accent);
    expect(warm.r).toBeGreaterThan(warm.b * 2);
    expect(cold.b).toBeGreaterThan(cold.r * 2);
    expect(regaliaDescriptor("w", kind).cloth).not.toBe(regaliaDescriptor("b", kind).cloth);
  });

  it.each(factions)("requires royal crowns, king banners and knight helms for faction %s", (faction) => {
    expect(regaliaDescriptor(faction, "p").crown).toBe("none");
    expect(regaliaDescriptor(faction, "p").shoulders).toBe("compact");
    expect(regaliaDescriptor(faction, "n").horns).not.toBe("none");
    expect(regaliaDescriptor(faction, "b").backpiece).toBe("ritual");
    expect(regaliaDescriptor(faction, "r").shoulders).toBe("fortress");
    expect(regaliaDescriptor(faction, "q").crown).not.toBe("none");
    expect(regaliaDescriptor(faction, "q").backpiece).toBe("shroud");
    expect(regaliaDescriptor(faction, "k").crown).not.toBe("none");
    expect(regaliaDescriptor(faction, "k").backpiece).toBe("banner");
  });
});

describe("procedural regalia", () => {
  it.each(combinations)("builds bounded, distinct, low draw-call $faction $kind geometry", ({ faction, kind }) => {
    const regalia = buildFactionRegalia(faction, kind, 1);
    const bounds = new THREE.Box3().setFromObject(regalia.group);
    expect(regalia.group.userData).toMatchObject({ faction, kind, style: regaliaDescriptor(faction, kind).style });
    expect(regalia.meshes.length).toBeGreaterThanOrEqual(2);
    expect(regalia.meshes.length).toBeLessThanOrEqual(3);
    expect(bounds.min.y).toBeGreaterThan(0.15);
    expect(bounds.max.y).toBeGreaterThan(0.8);
    expect(bounds.max.y).toBeLessThan(1.5);
    expect(bounds.max.x - bounds.min.x).toBeLessThan(0.85);
    expect(regalia.meshes.every((mesh) => mesh.geometry.getAttribute("position").count > 0)).toBe(true);
    // A missing role branch would leave identical vertex data, even if its label differs.
    const signature = regalia.meshes.map((mesh) => Array.from(mesh.geometry.getAttribute("position").array));
    for (const otherKind of roles.filter((role) => role !== kind)) {
      const other = buildFactionRegalia(faction, otherKind, 1);
      expect(other.meshes.map((mesh) => Array.from(mesh.geometry.getAttribute("position").array))).not.toEqual(signature);
      other.dispose();
    }
    regalia.dispose();
  });

  it("uses different geometry for Ember forged plates and Hollow hooked bones", () => {
    for (const kind of roles) {
      const ember = buildFactionRegalia("w", kind, 1);
      const hollow = buildFactionRegalia("b", kind, 1);
      expect(Array.from(ember.meshes[0].geometry.getAttribute("position").array))
        .not.toEqual(Array.from(hollow.meshes[0].geometry.getAttribute("position").array));
      ember.dispose();
      hollow.dispose();
    }
  });

  it("scales all adornments with the normalized figure height", () => {
    const small = buildFactionRegalia("b", "k", 0.7);
    const large = buildFactionRegalia("b", "k", 1.4);
    const smallSize = new THREE.Box3().setFromObject(small.group).getSize(new THREE.Vector3());
    const largeSize = new THREE.Box3().setFromObject(large.group).getSize(new THREE.Vector3());
    expect(largeSize.toArray()).toEqual(smallSize.multiplyScalar(2).toArray());
    small.dispose();
    large.dispose();
  });

  it("shares immutable geometry while keeping animated materials isolated", () => {
    const first = buildFactionRegalia("w", "n", 1);
    const second = buildFactionRegalia("w", "n", 1);
    expect(first.meshes[0].geometry).toBe(second.meshes[0].geometry);
    expect(first.materials.some((material) => second.materials.includes(material))).toBe(false);
    first.update(1, true, false, 0.25);
    expect(first.materials.every((material) => material.opacity === 0.25)).toBe(true);
    expect(second.materials.every((material) => material.opacity === 1)).toBe(true);
    first.dispose();
    second.dispose();
  });

  it("applies deterministic pulses, interaction emphasis and clamped fade", () => {
    const regalia = buildFactionRegalia("b", "q", 1);
    const glow = regalia.materials.find((material) => material.name === "regalia-accent") as THREE.MeshStandardMaterial;
    regalia.update(2, false, false, 1);
    const idle = glow.emissiveIntensity;
    regalia.update(2, false, true, 1);
    expect(glow.emissiveIntensity).toBeGreaterThan(idle);
    const hover = glow.emissiveIntensity;
    regalia.update(2, true, false, 1);
    expect(glow.emissiveIntensity).toBeGreaterThan(hover);
    const selected = glow.emissiveIntensity;
    regalia.update(7, true, false, 1);
    expect(glow.emissiveIntensity).not.toBe(selected);
    regalia.update(2, true, false, 1);
    expect(glow.emissiveIntensity).toBe(selected);
    regalia.update(2, false, false, -1);
    expect(regalia.group.visible).toBe(false);
    expect(regalia.materials.every((material) => material.opacity === 0)).toBe(true);
    regalia.update(2, false, false, 2);
    expect(regalia.group.visible).toBe(true);
    expect(regalia.materials.every((material) => material.opacity === 1)).toBe(true);
    regalia.dispose();
  });

  it("detaches and releases only owned materials exactly once", () => {
    const first = buildFactionRegalia("b", "k", 1);
    const survivor = buildFactionRegalia("b", "k", 1);
    const parent = new THREE.Group();
    parent.add(first.group);
    const materialDisposals = first.materials.map((material) => vi.spyOn(material, "dispose"));
    const geometryDisposals = first.meshes.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    const survivorDisposals = survivor.materials.map((material) => vi.spyOn(material, "dispose"));
    first.dispose();
    first.dispose();
    first.update(1, true, true, 1);
    expect(first.group.parent).toBeNull();
    expect(first.group.children).toHaveLength(0);
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    geometryDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    survivorDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    expect(survivor.meshes.every((mesh) => mesh.geometry.getAttribute("position").count > 0)).toBe(true);
    survivor.dispose();
  });
});
