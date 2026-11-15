import { describe, expect, it } from "vitest";
import { phoneHudPolicy } from "../ui/mobileHud";
import * as THREE from "three";
import { SceneEngine } from "../scene/sceneEngine";

function frameCamera(width: number, height: number): THREE.PerspectiveCamera {
  // Exercise the real lens/dolly policy without allocating a WebGL renderer.
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

describe("responsive battle framing", () => {
  it.each([[390, 664], [810, 1080]])("keeps board edges and both armies in the %ix%i viewport", (width, height) => {
    const camera = frameCamera(width, height);
    // Stay inside the foreground pillar capitals (inner edge z=11.65),
    // otherwise an on-screen board can still be hidden behind architecture.
    expect(camera.position.z).toBeLessThan(11.5);
    // Board trim edges are 4.92 units from centre. The tallest piece is
    // 1.12 units; 1.5 includes its crown, weapon and idle motion clearance.
    for (const x of [-4.92, 4.92]) for (const z of [-4.92, 4.92]) for (const y of [-0.73, 1.5]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(0.96);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(0.96);
      expect(point.z).toBeLessThan(1);
    }
  });

  it("preserves the authored desktop camera", () => {
    const camera = frameCamera(1440, 900);
    expect(camera.position.toArray()).toEqual([0, 6.4, 8.6]);
    expect(camera.fov).toBeCloseTo(50.500756, 5);
  });
});
