import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Faction, PieceKind } from "../core/types";
import { buildFactionRegalia, regaliaDescriptor } from "../scene/factionRegalia";
import { PIECE_HEIGHT, PieceView } from "../scene/pieces";

// Keep the real scene and resource lifecycle; replace browser-only canvas painting.
vi.mock("../scene/textures", () => ({ radialTexture: () => new THREE.Texture() }));
vi.mock("../scene/detail", () => {
  const surface = () => ({ normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() });
  return { wearSurface: surface, metalSurface: surface };
});
vi.mock("../scene/rankBadges", async (importOriginal) => ({
  ...await importOriginal<typeof import("../scene/rankBadges")>(),
  rankBadgeTexture: () => new THREE.Texture(),
  tacticalTokenTexture: () => new THREE.Texture(),
}));

const factions: Faction[] = ["w", "b"];
const roles: PieceKind[] = ["p", "n", "b", "r", "q", "k"];
const combinations = factions.flatMap((faction) => roles.map((kind) => ({ faction, kind })));

function fighter(faction: Faction = "w", kind: PieceKind = "p", idleAnimation = true, ownLivery = false) {
  const model = new THREE.Group();
  const source = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture(),
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.2).translate(0, 0.5, 0), source);
  model.add(body);
  model.scale.setScalar(PIECE_HEIGHT[kind]);
  const view = new PieceView(kind, faction, model, { contactShadows: true, idleAnimation }, {}, 1, 0, ownLivery);
  return { view, body, source };
}

function attachedRegalia(view: PieceView): THREE.Group {
  const group = view.runtime.getObjectByName("faction-regalia");
  expect(group, "each fighter must own one regalia instance").toBeDefined();
  return group as THREE.Group;
}

describe("fighter regalia lifecycle", () => {
  it.each(combinations)("attaches one role-scaled $faction $kind set while preserving the pick proxy and badge", ({ faction, kind }) => {
    const { view } = fighter(faction, kind);
    const group = attachedRegalia(view);
    expect(view.runtime.children.filter((child) => child.name === "faction-regalia")).toHaveLength(1);
    expect(group.scale.x).toBeCloseTo(PIECE_HEIGHT[kind]);
    expect(view.hitMeshes).toHaveLength(1);
    expect(view.hitMeshes[0].parent).toBe(view.container);
    expect(view.container.getObjectByName(`badge_${faction}_${kind}`)).toBeDefined();
    const weapons: THREE.Object3D[] = [];
    view.visual.traverse((node) => { if (node.name.startsWith("weapon_")) weapons.push(node); });
    expect(weapons.length).toBeGreaterThan(0);
    group.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) expect(node.userData.piece).toBe(view);
    });
    view.dispose();
  });

  it("propagates hover, selection and the elapsed clock to the fighter accents", () => {
    const { view } = fighter("b", "q");
    const glow = (attachedRegalia(view).getObjectByName("regalia-accent") as THREE.Mesh).material as THREE.MeshStandardMaterial;
    view.update(0.1, 2);
    const idle = glow.emissiveIntensity;
    view.setHovered(true);
    view.update(0.1, 2);
    const hover = glow.emissiveIntensity;
    expect(hover).toBeGreaterThan(idle);
    view.setSelected(true);
    view.update(0.1, 2);
    expect(glow.emissiveIntensity).toBeGreaterThan(hover);
    const selected = glow.emissiveIntensity;
    view.update(0.1, 6);
    expect(glow.emissiveIntensity).not.toBe(selected);
    view.playDeath();
    view.update(0.1, 2);
    expect(glow.emissiveIntensity).toBeCloseTo(idle);
    view.dispose();
  });

  it("carries opacity and burn-away through death and reset without restoring regalia shadows", () => {
    const { view } = fighter();
    const group = attachedRegalia(view);
    const mesh = group.getObjectByName("regalia-armor") as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    view.setOpacity(0.35);
    expect(material.opacity).toBe(0.35);
    expect(material.transparent).toBe(true);
    view.playDeath();
    view.setDissolve(1);
    view.update(0.1, 2);
    expect(group.visible).toBe(false);
    view.resetPose();
    view.setOpacity(1);
    view.update(0.1, 2);
    expect(group.visible).toBe(true);
    expect(material.opacity).toBe(1);
    expect(mesh.castShadow).toBe(false);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <project_vertex>", fragmentShader: "#include <common>\n#include <clipping_planes_fragment>\n#include <opaque_fragment>" };
    material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.uniforms).toHaveProperty("uDissolve");
    view.dispose();
  });

  it("follows facing and squash while hiding every adornment under the tactical counter", () => {
    const { view } = fighter("w", "k");
    const group = attachedRegalia(view);
    view.setFacing(new THREE.Vector3(1, 0, 0));
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion).x).toBeCloseTo(1);
    view.setSquash(1);
    expect(group.scale.y).toBeLessThan(group.scale.x);
    view.setFlat(true);
    expect(group.visible).toBe(false);
    view.update(0.2, 2);
    expect(group.visible).toBe(false);
    expect(view.visual.visible).toBe(false);
    expect(view.hitMeshes[0].visible).toBe(true);
    view.setFlat(false);
    expect(group.visible).toBe(true);
    view.dispose();
  });

  it("dims loose motes during partial burn-away, including while dying", () => {
    const { view } = fighter("b", "q");
    const motes = attachedRegalia(view).getObjectByName("regalia-motes") as THREE.Points;
    const material = motes.material as THREE.PointsMaterial;
    view.setOpacity(0.5);
    view.playDeath();
    view.setDissolve(0.6);
    expect(material.opacity).toBeCloseTo(0.2);
    view.update(0.1, 2);
    expect(material.opacity).toBeCloseTo(0.2);
    view.resetPose();
    view.setOpacity(1);
    expect(material.opacity).toBe(1);
    view.dispose();
  });

  it("keeps silhouette geometry on low quality and disables secondary motes", () => {
    const { view: low } = fighter("b", "b", false);
    const { view: high } = fighter("b", "b", true);
    const lowGroup = attachedRegalia(low);
    const highGroup = attachedRegalia(high);
    expect(lowGroup.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(3);
    expect(lowGroup.getObjectByName("regalia-motes")?.visible ?? false).toBe(false);
    expect(highGroup.getObjectByName("regalia-motes")?.visible).toBe(true);
    const accent = highGroup.getObjectByName("regalia-accent")!;
    high.update(0.1, 2);
    const before = accent.position.y;
    high.update(0.1, 6);
    expect(accent.position.y).not.toBe(before);
    low.dispose();
    high.dispose();
  });

  it("releases owned regalia once and keeps shared geometry alive for another fighter", () => {
    const { view } = fighter("b", "k");
    const { view: survivor } = fighter("b", "k");
    const group = attachedRegalia(view);
    const mesh = group.getObjectByName("regalia-armor") as THREE.Mesh;
    const release = vi.spyOn(mesh.material as THREE.Material, "dispose");
    const sharedRelease = vi.spyOn(mesh.geometry, "dispose");
    const survivorMesh = attachedRegalia(survivor).getObjectByName("regalia-armor") as THREE.Mesh;
    expect(survivorMesh.geometry).toBe(mesh.geometry);
    view.dispose();
    view.dispose();
    expect(release).toHaveBeenCalledOnce();
    expect(sharedRelease).not.toHaveBeenCalled();
    expect(group.parent).toBeNull();
    survivor.update(0.1, 2);
    expect(survivorMesh.visible).toBe(true);
    survivor.dispose();
  });

  it.each([false, true])("retains texture detail with faction material identity (own livery: %s)", (ownLivery) => {
    const warm = fighter("w", "p", true, ownLivery);
    const cold = fighter("b", "p", true, ownLivery);
    for (const { body, source } of [warm, cold]) {
      expect(body.material.map).toBe(source.map);
      expect(body.material.normalMap).toBe(source.normalMap);
      expect(body.material.roughnessMap).toBe(source.roughnessMap);
    }
    expect(warm.body.material.color.r).toBeGreaterThan(warm.body.material.color.b);
    expect(cold.body.material.color.b).toBeGreaterThan(cold.body.material.color.r);
    warm.view.dispose();
    cold.view.dispose();
  });
});

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
