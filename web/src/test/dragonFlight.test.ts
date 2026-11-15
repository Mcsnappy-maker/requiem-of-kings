import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DragonFlight, dragonFlightPose } from "../scene/dragonFlight";

describe("dragon flight", () => {
  it("loops through a visible fly-by and a quiet interval", () => {
    expect(dragonFlightPose(0).visible).toBe(true);
    expect(dragonFlightPose(8).position[0]).toBeGreaterThan(dragonFlightPose(0).position[0]);
    expect(dragonFlightPose(22).visible).toBe(false);
    expect(dragonFlightPose(36).position).toEqual(dragonFlightPose(0).position);
  });

  it("crosses the prescribed route and hides at the end of the fly-by", () => {
    expect(dragonFlightPose(0).position).toEqual([-38, 22, -45]);
    expect(dragonFlightPose(8).position).toEqual([0, 19.5, -34.5]);
    expect(dragonFlightPose(16).position).toEqual([38, 17, -24]);
    expect(dragonFlightPose(15.999).visible).toBe(true);
    expect(dragonFlightPose(16).visible).toBe(false);
    expect(dragonFlightPose(35.999).visible).toBe(false);
    expect(dragonFlightPose(36).visible).toBe(true);
  });

  it("faces along the route and flaps from absolute elapsed time", () => {
    const pose = dragonFlightPose(1);
    expect(pose.yaw).toBeCloseTo(1.3012, 4);
    expect(pose.wing).toBeCloseTo(-0.2789042472, 9);
  });

  it("applies poses deterministically to the visible silhouette", () => {
    const flight = new DragonFlight();
    flight.update(8);
    expect(flight.group.position.toArray()).toEqual([0, 19.5, -34.5]);
    expect(flight.group.rotation.y).toBeCloseTo(1.3012, 4);
    const wing = flight.group.getObjectByName("dragon-wing-right");
    expect(wing).toBeDefined();
    expect(wing!.rotation.z).not.toBe(0);
    const wingAngle = wing!.rotation.z;
    flight.update(22);
    expect(flight.group.visible).toBe(false);
    flight.update(8);
    expect(flight.group.visible).toBe(true);
    expect(wing!.rotation.z).toBe(wingAngle);
    flight.dispose();
  });

  it("hides only the ember particles on low quality and restores them", () => {
    const flight = new DragonFlight();
    const particles = flight.group.children.find((child) => child instanceof THREE.Points);
    expect(particles).toBeDefined();
    flight.setQuality("low");
    flight.update(0);
    expect(particles!.visible).toBe(false);
    expect(flight.group.visible).toBe(true);
    expect(flight.group.children.some((child) => child instanceof THREE.Mesh && child.visible)).toBe(true);
    flight.setQuality("high");
    expect(particles!.visible).toBe(true);
    flight.dispose();
  });

  it("releases each owned geometry and material and detaches the group", () => {
    const flight = new DragonFlight();
    const scene = new THREE.Scene();
    scene.add(flight.group);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    flight.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        resources.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => resources.add(material));
      }
    });
    const disposals = [...resources].map((resource) => vi.spyOn(resource, "dispose"));
    flight.dispose();
    expect(flight.group.parent).toBeNull();
    expect(flight.group.children).toHaveLength(0);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
