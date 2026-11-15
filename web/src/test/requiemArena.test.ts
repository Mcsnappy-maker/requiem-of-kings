import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ARENA_LOOKS } from "../scene/arena";
import { Battlefield } from "../scene/battlefield";

// Canvas painting needs a browser; keep the real scene and graphics resources.
vi.mock("../scene/textures", () => ({
  clothTexture: () => new THREE.Texture(),
  mudTexture: () => new THREE.Texture(),
  smokeTexture: () => new THREE.Texture(),
  sparkTexture: () => new THREE.Texture(),
}));
vi.mock("../scene/detail", () => {
  const surface = () => ({ normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() });
  return { earthSurface: surface, metalSurface: surface, stoneSurface: surface };
});

describe("Requiem arena identity", () => {
  it("names the default battlefield and keeps readable magical contrast", () => {
    expect(ARENA_LOOKS.ashen.name).toBe("The Shattered Throne");
    expect(ARENA_LOOKS.ashen.exposure).toBeGreaterThanOrEqual(1.15);
    expect(ARENA_LOOKS.ashen.lamp.intensity).toBeGreaterThanOrEqual(0.45);
  });

  it("keeps the dragon fly-by animated on low quality and releases its resources", () => {
    const battlefield = new Battlefield("low");
    try {
      const dragon = battlefield.group.getObjectByName("dragon-flight");
      expect(dragon).toBeDefined();
      const particles = dragon!.getObjectByName("dragon-embers") as THREE.Points;
      expect(particles.visible).toBe(false);
      battlefield.update(8, new THREE.PerspectiveCamera());
      expect(dragon!.position.toArray()).toEqual([0, 19.5, -34.5]);
      battlefield.update(14, new THREE.PerspectiveCamera());
      expect(dragon!.visible).toBe(false);
      for (const preset of ["medium", "high", "ultra"] as const) {
        battlefield.applyQuality(preset);
        expect(particles.visible).toBe(true);
        battlefield.applyQuality("low");
        expect(particles.visible).toBe(false);
      }
      const release = vi.spyOn(particles.geometry, "dispose");
      battlefield.dispose();
      expect(release).toHaveBeenCalledOnce();
      expect(dragon!.parent).toBeNull();
      expect(dragon!.children).toHaveLength(0);
    } finally {
      battlefield.dispose();
    }
  });

  it("stages crown ruins and opposing textured standards with warm and cold beacons", () => {
    const battlefield = new Battlefield("ultra");
    try {
      expect(battlefield.group.getObjectByName("shattered-crown-arches")).toBeDefined();
      const banners: THREE.Mesh[] = [];
      const beacons: THREE.Mesh[] = [];
      battlefield.group.traverse((object) => {
        if (object instanceof THREE.Mesh && object.name === "torn-faction-banner") banners.push(object);
        if (object instanceof THREE.Mesh && object.name === "faction-beacon") beacons.push(object);
      });
      expect(banners.length).toBeGreaterThanOrEqual(2);
      const colors = banners.map((banner) => {
        const material = banner.material as THREE.MeshStandardMaterial;
        expect(material.map).not.toBeNull();
        return material.color.getHex();
      });
      expect(colors).toContain(0x991f32);
      expect(colors).toContain(0x583a91);
      const beaconColors = beacons.map((beacon) => (beacon.material as THREE.MeshBasicMaterial).color.getHex());
      expect(beaconColors).toContain(0xff8a2c);
      expect(beaconColors).toContain(0x8a71ff);
    } finally {
      battlefield.dispose();
    }
  });
});
