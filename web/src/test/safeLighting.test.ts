import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SafeLighting, SAFE_LIGHTING_STORAGE_KEY } from "../scene/safeLighting";

function makeScene() {
  const scene = new THREE.Scene();
  const env = new THREE.Texture();
  scene.environment = env;
  const pbr = new THREE.MeshStandardMaterial({ color: 0xf6efe0 });
  pbr.userData.live = { self: null as unknown };
  (pbr.userData.live as { self: unknown }).self = pbr.userData.live; // circular: must not be JSON-cloned
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), pbr);
  scene.add(mesh);
  const basic = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  scene.add(basic);
  return { scene, env, pbr, mesh, basic };
}

describe("SafeLighting", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      location: { search: "" },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays at full PBR when the board reads bright", () => {
    const { scene, env, pbr, mesh } = makeScene();
    const safe = new SafeLighting(scene, { forced: null, stored: 0 }, () => {});
    safe.update(3, () => 210);
    expect(safe.currentStage).toBe(0);
    expect(safe.isHealthy).toBe(true);
    expect(scene.environment).toBe(env);
    expect(mesh.material).toBe(pbr);
  });

  it("does not judge while the board is off screen", () => {
    const { scene } = makeScene();
    const safe = new SafeLighting(scene, { forced: null, stored: 0 }, () => {});
    safe.update(3, () => null);
    expect(safe.currentStage).toBe(0);
    expect(safe.isHealthy).toBe(false);
  });

  it("escalates through every stage while the board stays black, and remembers it", () => {
    const { scene, pbr, mesh, basic } = makeScene();
    const released: THREE.Texture[] = [];
    const safe = new SafeLighting(scene, { forced: null, stored: 0 }, (t) => released.push(t));
    let t = 2;
    safe.update(t, () => 0);
    expect(safe.currentStage).toBe(0); // one dark frame is not proof
    t += 1.2;
    safe.update(t, () => 0);
    expect(safe.currentStage).toBe(1);
    expect(scene.environment).toBeNull();
    expect(scene.children.some((c) => (c as THREE.AmbientLight).isAmbientLight)).toBe(true);

    t += 1.0;
    safe.update(t, () => 0);
    expect(safe.currentStage).toBe(1); // programs still compiling
    t += 1.6;
    safe.update(t, () => 0);
    t += 1.2;
    safe.update(t, () => 0);
    expect(safe.currentStage).toBe(2);
    expect((mesh.material as THREE.Material).type).toBe("MeshLambertMaterial");
    expect((basic.material as THREE.Material).type).toBe("MeshBasicMaterial");

    t += 2.6;
    safe.update(t, () => 0);
    t += 1.2;
    safe.update(t, () => 0);
    expect(safe.currentStage).toBe(3);
    expect((mesh.material as THREE.Material).type).toBe("MeshBasicMaterial");
    expect(window.localStorage.getItem(SAFE_LIGHTING_STORAGE_KEY)).toBe("3");

    t += 2.6;
    safe.update(t, () => 0);
    t += 1.2;
    safe.update(t, () => 0);
    expect(safe.currentStage).toBe(3);
    expect(safe.isHealthy).toBe(true);
    // Source material is untouched and still owned by the engine.
    expect(pbr.type).toBe("MeshStandardMaterial");
  });

  it("stops escalating once the board becomes visible", () => {
    const { scene, mesh } = makeScene();
    const safe = new SafeLighting(scene, { forced: null, stored: 0 }, () => {});
    safe.update(2, () => 3);
    safe.update(3.2, () => 3);
    expect(safe.currentStage).toBe(1);
    safe.update(5.8, () => 180);
    expect(safe.isHealthy).toBe(true);
    safe.update(10, () => 0);
    expect(safe.currentStage).toBe(1);
    expect((mesh.material as THREE.Material).type).toBe("MeshStandardMaterial");
  });

  it("starts healed from a remembered stage and keeps twins in sync with their source", () => {
    const { scene, pbr, mesh } = makeScene();
    const safe = new SafeLighting(scene, { forced: null, stored: 2 }, () => {});
    const twin = mesh.material as THREE.MeshLambertMaterial;
    expect(twin.type).toBe("MeshLambertMaterial");
    expect(twin.color).toBe(pbr.color);
    expect(twin.emissive).toBe(pbr.emissive);

    pbr.opacity = 0.4;
    pbr.transparent = true;
    expect(twin.opacity).toBe(0.4);
    expect(twin.transparent).toBe(true);
    twin.emissiveIntensity = 2.5;
    expect(pbr.emissiveIntensity).toBe(2.5);

    const before = twin.version;
    pbr.needsUpdate = true;
    expect(twin.version).toBe(before + 1);

    // Materials created after the swap (new pieces, promotions) are picked up.
    const late = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial());
    scene.add(late);
    safe.update(5, () => null);
    expect((late.material as THREE.Material).type).toBe("MeshLambertMaterial");
    safe.dispose();
  });

  it("honours a forced stage without escalating or persisting", () => {
    const { scene, mesh } = makeScene();
    const safe = new SafeLighting(scene, { forced: 3, stored: 0 }, () => {});
    expect((mesh.material as THREE.Material).type).toBe("MeshBasicMaterial");
    safe.update(5, () => 0);
    expect(safe.currentStage).toBe(3);
    expect(window.localStorage.getItem(SAFE_LIGHTING_STORAGE_KEY)).toBeNull();
  });
});
