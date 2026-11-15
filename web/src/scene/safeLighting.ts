import * as THREE from "three";

/**
 * Self-healing lighting for GPUs that render physically based materials black.
 *
 * Some phone GPUs/drivers (seen on Samsung Internet) draw every
 * MeshStandardMaterial / MeshPhysicalMaterial surface pitch black while unlit
 * MeshBasicMaterial surfaces (halos, stained glass, badges) still render. A
 * software renderer never reproduces it, so the engine samples the real frame
 * and escalates until the board is visible:
 *
 *   0 - full PBR (default)
 *   1 - drop the PMREM environment map, add a flat ambient fill
 *   2 - swap every lit PBR material for a MeshLambertMaterial twin
 *   3 - swap every lit PBR material for an unlit MeshBasicMaterial twin
 *
 * The reached stage is remembered so the next visit starts already healed.
 * `?safe=0..3` forces a stage (and disables escalation) for diagnosis.
 */
export type SafeLightingStage = 0 | 1 | 2 | 3;

export const SAFE_LIGHTING_STORAGE_KEY = "rok-safe-lighting";
const MAX_STAGE: SafeLightingStage = 3;

type PbrMaterial = THREE.MeshStandardMaterial;
type TwinMaterial = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;

/** Scalar fields the twin reads live from its source, so code mutating either stays in sync. */
const PROXIED_FIELDS = [
  "opacity",
  "transparent",
  "visible",
  "alphaTest",
  "depthWrite",
  "depthTest",
  "map",
  "alphaMap",
] as const;
const LAMBERT_PROXIED_FIELDS = ["emissiveIntensity", "emissiveMap"] as const;

function isPbr(material: THREE.Material | undefined | null): material is PbrMaterial {
  return Boolean(material && (material as PbrMaterial).isMeshStandardMaterial);
}

export interface SafeLightingOptions {
  /** Stage forced from the URL; disables escalation and persistence. */
  forced: SafeLightingStage | null;
  /** Stage remembered from a previous visit. */
  stored: SafeLightingStage;
}

export function readSafeLightingOptions(): SafeLightingOptions {
  let forced: SafeLightingStage | null = null;
  let stored: SafeLightingStage = 0;
  if (typeof window === "undefined") return { forced, stored };
  try {
    const raw = new URLSearchParams(window.location.search).get("safe");
    if (raw !== null && /^[0-3]$/.test(raw)) forced = Number(raw) as SafeLightingStage;
  } catch {
    /* ignore */
  }
  try {
    const value = window.localStorage.getItem(SAFE_LIGHTING_STORAGE_KEY);
    if (value !== null && /^[0-3]$/.test(value)) stored = Number(value) as SafeLightingStage;
  } catch {
    /* storage may be blocked */
  }
  return { forced, stored };
}

export class SafeLighting {
  private stage: SafeLightingStage = 0;
  private readonly twins = new Map<PbrMaterial, TwinMaterial>();
  private readonly ownTwins = new WeakSet<THREE.Material>();
  private ambient: THREE.AmbientLight | null = null;
  private heldEnvironment: THREE.Texture | null = null;
  private lastSweep = Number.NEGATIVE_INFINITY;
  private clock = 0;
  private healthy = false;
  private nextCheckAt = 2.0;
  private checks = 0;
  private readonly forced: SafeLightingStage | null;

  constructor(
    private readonly scene: THREE.Scene,
    options: SafeLightingOptions,
    private readonly releaseEnvironment: (texture: THREE.Texture) => void,
  ) {
    this.forced = options.forced;
    const initial = options.forced ?? options.stored;
    if (initial > 0) this.applyStage(initial);
    if (options.forced !== null) this.healthy = true;
  }

  get currentStage(): SafeLightingStage {
    return this.stage;
  }

  get isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Called once per frame right after the frame was drawn.
   * @param elapsed engine clock in seconds
   * @param sampleBoard returns the brightest board luminance (0-255), or null when inconclusive
   */
  update(elapsed: number, sampleBoard: () => number | null): void {
    this.clock = elapsed;
    if (this.stage > 0) this.enforce(elapsed);
    if (this.healthy || this.forced !== null) return;
    if (elapsed < this.nextCheckAt) return;
    this.nextCheckAt = elapsed + 1.2;
    const luminance = sampleBoard();
    if (luminance === null) return;
    this.checks += 1;
    if (luminance >= 40) {
      this.healthy = true;
      return;
    }
    if (luminance > 14) {
      // Dim but not dead - give the lighting a few more looks before acting.
      if (this.checks < 6) return;
    } else if (this.checks < 2) {
      // Two consecutive black readings: shader programs compile in parallel
      // and are skipped until ready, so a single dark frame proves nothing.
      return;
    }
    if (this.stage >= MAX_STAGE) {
      this.healthy = true;
      return;
    }
    const next = (this.stage + 1) as SafeLightingStage;
    console.warn(`[scene] lit surfaces rendered dark (max luma ${luminance.toFixed(0)}); safe lighting stage ${next}`);
    this.applyStage(next);
    this.persist();
    this.checks = 0;
    // Let the new programs compile and draw before judging again.
    this.nextCheckAt = elapsed + 2.5;
  }

  private persist(): void {
    try {
      window.localStorage.setItem(SAFE_LIGHTING_STORAGE_KEY, String(this.stage));
    } catch {
      /* ignore */
    }
  }

  private applyStage(stage: SafeLightingStage): void {
    const previous = this.stage;
    this.stage = stage;
    if (stage >= 1 && !this.ambient) {
      this.ambient = new THREE.AmbientLight(0xfff1e0, 1.1);
      this.ambient.name = "safe-lighting-ambient";
      this.scene.add(this.ambient);
    }
    if (stage !== previous && previous >= 2) {
      // Changing twin kind: rebuild from the sources.
      this.restoreSources();
    }
    this.lastSweep = Number.NEGATIVE_INFINITY;
    this.enforce(this.clock);
  }

  /** Keep the environment off and every PBR material swapped. Cheap enough to run each frame for the env check. */
  private enforce(elapsed: number): void {
    const env = this.scene.environment;
    if (env) {
      if (this.heldEnvironment && this.heldEnvironment !== env) this.releaseEnvironment(this.heldEnvironment);
      this.heldEnvironment = env;
      this.scene.environment = null;
    }
    if (this.stage < 2) return;
    // New pieces, promotions and spells create materials after the swap.
    if (elapsed - this.lastSweep < 0.4) return;
    this.lastSweep = elapsed;
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => (isPbr(m) ? this.twinFor(m) : m));
      } else if (isPbr(mesh.material)) {
        mesh.material = this.twinFor(mesh.material);
      }
    });
  }

  private restoreSources(): void {
    const sources = new Map<THREE.Material, PbrMaterial>();
    for (const [source, twin] of this.twins) sources.set(twin, source);
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => sources.get(m) ?? m);
      } else {
        const source = sources.get(mesh.material);
        if (source) mesh.material = source;
      }
    });
    for (const twin of this.twins.values()) twin.dispose();
    this.twins.clear();
  }

  private twinFor(source: PbrMaterial): TwinMaterial {
    if (this.ownTwins.has(source)) return source as unknown as TwinMaterial;
    const existing = this.twins.get(source);
    if (existing) return existing;
    const lambert = this.stage === 2;
    const twin: TwinMaterial = lambert ? new THREE.MeshLambertMaterial() : new THREE.MeshBasicMaterial();
    // Not Material.copy(): it JSON-clones userData, which may hold live objects.
    twin.side = source.side;
    twin.shadowSide = source.shadowSide;
    twin.vertexColors = source.vertexColors;
    twin.blending = source.blending;
    twin.blendSrc = source.blendSrc;
    twin.blendDst = source.blendDst;
    twin.blendEquation = source.blendEquation;
    twin.premultipliedAlpha = source.premultipliedAlpha;
    twin.polygonOffset = source.polygonOffset;
    twin.polygonOffsetFactor = source.polygonOffsetFactor;
    twin.polygonOffsetUnits = source.polygonOffsetUnits;
    twin.colorWrite = source.colorWrite;
    twin.depthFunc = source.depthFunc;
    twin.alphaToCoverage = source.alphaToCoverage;
    twin.toneMapped = source.toneMapped;
    twin.dithering = source.dithering;
    twin.clippingPlanes = source.clippingPlanes;
    twin.clipIntersection = source.clipIntersection;
    twin.clipShadows = source.clipShadows;
    twin.forceSinglePass = source.forceSinglePass;
    twin.userData = source.userData;
    twin.name = `${source.name || "pbr"}#safe`;
    // Share the Color objects so selection tints written to either reach both.
    (twin as THREE.MeshBasicMaterial).color = source.color;
    twin.fog = source.fog;
    twin.wireframe = source.wireframe;
    if (twin instanceof THREE.MeshLambertMaterial) {
      twin.emissive = source.emissive;
      twin.normalMap = source.normalMap;
      twin.normalScale = source.normalScale;
      twin.aoMap = source.aoMap;
      twin.aoMapIntensity = source.aoMapIntensity;
      twin.lightMap = source.lightMap;
      twin.flatShading = source.flatShading;
    } else {
      twin.aoMap = source.aoMap;
      twin.lightMap = source.lightMap;
    }
    if (source.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
      twin.onBeforeCompile = source.onBeforeCompile;
      twin.customProgramCacheKey = source.customProgramCacheKey;
    }
    const fields: readonly string[] = lambert ? [...PROXIED_FIELDS, ...LAMBERT_PROXIED_FIELDS] : PROXIED_FIELDS;
    const target = twin as unknown as Record<string, unknown>;
    const from = source as unknown as Record<string, unknown>;
    for (const key of fields) {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        get: () => from[key],
        set: (value: unknown) => {
          from[key] = value;
        },
      });
    }
    // Follow the source's version so `source.needsUpdate = true` recompiles the twin too.
    let own = 0;
    Object.defineProperty(target, "version", {
      configurable: true,
      enumerable: true,
      get: () => source.version + own,
      set: (value: number) => {
        own = value - source.version;
      },
    });
    twin.needsUpdate = true;
    this.twins.set(source, twin);
    this.ownTwins.add(twin);
    return twin;
  }

  dispose(): void {
    if (this.heldEnvironment) this.releaseEnvironment(this.heldEnvironment);
    this.heldEnvironment = null;
    for (const twin of this.twins.values()) twin.dispose();
    this.twins.clear();
    if (this.ambient) this.scene.remove(this.ambient);
    this.ambient = null;
  }
}
