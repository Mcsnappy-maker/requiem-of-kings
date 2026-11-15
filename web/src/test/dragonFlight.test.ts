import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DragonFlight, dragonFlightPose } from "../scene/dragonFlight";
import { SceneEngine } from "../scene/sceneEngine";

function cameraFor(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 260);
  const policy = Object.assign(Object.create(SceneEngine.prototype), { camera, baseFov: 46 }) as {
    effectiveFov: (base: number) => number;
    frameScale: () => number;
  };
  camera.fov = policy.effectiveFov(46);
  const target = new THREE.Vector3(0, 0.35, 0);
  camera.position.set(0, 6.4, 8.6).sub(target).multiplyScalar(policy.frameScale()).add(target);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

describe("dragon flight", () => {
  it("loops through a visible fly-by and a quiet interval", () => {
    expect(dragonFlightPose(0).visible).toBe(true);
    expect(dragonFlightPose(8).position[0]).toBeGreaterThan(dragonFlightPose(0).position[0]);
    expect(dragonFlightPose(22).visible).toBe(false);
    expect(dragonFlightPose(36).position).toEqual(dragonFlightPose(0).position);
  });

  it("hides at the end of the fly-by", () => {
    expect(dragonFlightPose(15.999).visible).toBe(true);
    expect(dragonFlightPose(16).visible).toBe(false);
    expect(dragonFlightPose(35.999).visible).toBe(false);
    expect(dragonFlightPose(36).visible).toBe(true);
  });

  it("faces along the route and flaps from absolute elapsed time", () => {
    const pose = dragonFlightPose(1);
    const start = dragonFlightPose(0).position;
    const end = dragonFlightPose(16).position;
    expect(pose.yaw).toBeCloseTo(Math.atan2(end[0] - start[0], end[2] - start[2]), 4);
    expect(pose.wing).toBeCloseTo(-0.2789042472, 9);
  });

  it("applies poses deterministically to the visible silhouette", () => {
    const flight = new DragonFlight();
    flight.update(8);
    expect(flight.group.position.toArray()).toEqual(dragonFlightPose(8).position);
    expect(flight.group.rotation.y).toBe(dragonFlightPose(8).yaw);
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

  it.each([[360, 640], [390, 664], [810, 1080], [1440, 900]])(
    "keeps the actual dragon mesh recognizable above the board at %ix%i",
    (width, height) => {
      const camera = cameraFor(width, height);
      const boardPoints: THREE.Vector3[] = [];
      for (const x of [-4.92, 4.92]) for (const z of [-4.92, 4.92]) {
        boardPoints.push(new THREE.Vector3(x, 1.5, z).project(camera));
      }
      const boardTop = Math.max(...boardPoints.map((point) => point.y));
      const flight = new DragonFlight();
      for (const time of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        flight.update(time);
        flight.group.updateMatrixWorld(true);
        const projected: THREE.Vector3[] = [];
        flight.group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const vertices = object.geometry.getAttribute("position");
          for (let i = 0; i < vertices.count; i++) {
            const world = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(object.matrixWorld);
            // Northern wall rises to y=19.4 at radius 17: fly inside it,
            // rather than relying on the dragon's centre clearing its top.
            expect(Math.hypot(world.x, world.z)).toBeLessThan(16);
            projected.push(world.project(camera));
          }
        });
        expect(projected.length).toBeGreaterThan(100);
        for (const point of projected) {
          expect(Math.abs(point.x)).toBeLessThan(0.96);
          expect(Math.abs(point.y)).toBeLessThan(0.96);
          expect(point.z).toBeGreaterThan(-1);
          expect(point.z).toBeLessThan(1);
          expect(point.y).toBeGreaterThan(boardTop + 16 / height);
        }
        const span = (Math.max(...projected.map((p) => p.x)) - Math.min(...projected.map((p) => p.x))) * width / 2;
        expect(span).toBeGreaterThan(45);
      }
      flight.dispose();
    },
  );

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
