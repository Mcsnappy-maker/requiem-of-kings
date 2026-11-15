import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Faction, PieceKind } from "../core/types";

export type RegaliaDescriptor = Readonly<{
  faction: Faction;
  kind: PieceKind;
  style: string;
  accent: number;
  cloth: number;
  crown: "none" | "flame" | "sweeping" | "ossuary" | "antler";
  horns: "none" | "crested" | "hooked";
  shoulders: "compact" | "rider" | "ritual" | "fortress" | "sweeping" | "royal";
  backpiece: "none" | "ritual" | "shroud" | "banner";
  aura: "coals" | "witchlight";
}>;

const roles = {
  p: { name: "sentinel", shoulders: "compact", backpiece: "none" },
  n: { name: "dread-rider", shoulders: "rider", backpiece: "none" },
  b: { name: "ritualist", shoulders: "ritual", backpiece: "ritual" },
  r: { name: "bastion", shoulders: "fortress", backpiece: "none" },
  q: { name: "shrouded-sovereign", shoulders: "sweeping", backpiece: "shroud" },
  k: { name: "banner-monarch", shoulders: "royal", backpiece: "banner" },
} as const;

const descriptors = new Map<string, RegaliaDescriptor>();

export function regaliaDescriptor(faction: Faction, kind: PieceKind): RegaliaDescriptor {
  const key = `${faction}${kind}`;
  let descriptor = descriptors.get(key);
  if (!descriptor) {
    const ember = faction === "w";
    descriptor = Object.freeze({
      faction,
      kind,
      style: `${ember ? "ember" : "hollow"}-${roles[kind].name}`,
      accent: ember ? 0xffb52e : 0x55e8ff,
      cloth: ember ? 0x8f1733 : 0x49336d,
      crown: kind === "k" ? (ember ? "flame" : "ossuary")
        : kind === "q" ? (ember ? "sweeping" : "antler") : "none",
      horns: kind === "n" ? (ember ? "crested" : "hooked") : "none",
      shoulders: roles[kind].shoulders,
      backpiece: roles[kind].backpiece,
      aura: ember ? "coals" : "witchlight",
    });
    descriptors.set(key, descriptor);
  }
  return descriptor;
}

type Surface = "armor" | "cloth" | "accent";
type GeometrySet = Record<Surface, THREE.BufferGeometry>;

// At most 12 immutable sets, retained for the renderer lifetime. Instances must
// never dispose these: a captured pawn can share its buffers with seven others.
const geometryCache = new Map<string, GeometrySet>();
const up = new THREE.Vector3(0, 1, 0);
const moteGeometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([
  -0.2, 0.78, 0.15, 0.19, 0.87, 0.08, -0.1, 1.1, -0.02, 0.13, 0.55, 0.18,
], 3));

function geometryFor(descriptor: RegaliaDescriptor): GeometrySet {
  const cached = geometryCache.get(descriptor.style);
  if (cached) return cached;
  const parts: Record<Surface, THREE.BufferGeometry[]> = { armor: [], cloth: [], accent: [] };
  const ember = descriptor.faction === "w";
  const kind = descriptor.kind;

  function add(surface: Surface, geometry: THREE.BufferGeometry): void {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    // All primitives contribute identical attributes before merging.
    flat.deleteAttribute("uv");
    parts[surface].push(flat);
  }

  function box(surface: Surface, x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0): void {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateZ(tilt).translate(x, y, z);
    add(surface, geometry);
  }

  function bone(surface: Surface, from: number[], to: number[], radius = 0.018): void {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius * 0.68, radius, direction.length(), ember ? 4 : 5, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
    add(surface, geometry);
  }

  function spike(surface: Surface, x: number, y: number, z: number, radius: number, height: number, tilt = 0): void {
    const geometry = new THREE.ConeGeometry(radius, height, ember ? 4 : 5);
    geometry.rotateZ(tilt).translate(x, y, z);
    add(surface, geometry);
  }

  function panel(surface: Surface, outline: number[][], z: number, depth = 0.025): void {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
    geometry.translate(0, 0, z);
    add(surface, geometry);
  }

  // Warm armour has wide forged facets; cold armour exposes a ribbed open cage.
  if (ember) {
    panel("armor", [[-0.14, 0.83], [0.14, 0.83], [0.1, 0.62], [0, 0.55], [-0.1, 0.62]], 0.1);
    panel("accent", [[-0.025, 0.8], [0.025, 0.8], [0, 0.65]], 0.132, 0.008);
  } else {
    bone("armor", [0, 0.58, 0.15], [0, 0.84, 0.15], 0.022);
    for (const y of [0.64, 0.72, 0.8]) for (const side of [-1, 1]) {
      bone("armor", [0, y, 0.15], [side * 0.13, y + 0.04, 0.11], 0.017);
    }
    spike("accent", 0, 0.76, 0.17, 0.035, 0.12);
  }

  const shoulderWidth = kind === "r" ? 0.17 : kind === "q" ? 0.16 : kind === "p" ? 0.105 : 0.13;
  for (const side of [-1, 1]) {
    const x = side * 0.21;
    if (ember) {
      box("armor", x, 0.78, 0, shoulderWidth, 0.085, 0.2, side * -0.2);
      box("accent", x, 0.82, 0.08, shoulderWidth * 0.7, 0.015, 0.015, side * -0.2);
    } else {
      bone("armor", [side * 0.12, 0.74, 0], [side * 0.29, 0.83, 0], 0.032);
      bone("armor", [side * 0.29, 0.83, 0], [side * 0.25, 0.9, 0], 0.024);
      spike("accent", side * 0.27, 0.83, 0.02, 0.022, 0.055, side * 0.45);
    }
    if (kind === "r") {
      // Twin battlements read as a fortress even from the phone camera.
      box("armor", side * 0.245, 0.87, -0.015, 0.14, 0.12, 0.18);
      for (const offset of [-0.045, 0.045]) {
        if (ember) box("armor", side * 0.245 + offset, 0.965, -0.015, 0.045, 0.09, 0.18);
        else spike("armor", side * 0.245 + offset, 0.985, -0.015, 0.038, 0.16, side * -0.15);
      }
    }
  }

  // Every role carries its faction cloth; larger roles gain broad back silhouettes.
  const hem = ember ? [[0.11, 0.3], [0, 0.23], [-0.11, 0.3]]
    : [[0.12, 0.3], [0.07, 0.37], [0.015, 0.22], [-0.02, 0.35], [-0.1, 0.27]];
  panel("cloth", [[-0.1, 0.63], [0.1, 0.63], ...hem], -0.12, 0.012);

  if (descriptor.horns !== "none") {
    if (ember) {
      panel("armor", [[-0.025, 0.93], [-0.06, 1.12], [0, 1.24], [0.06, 1.12], [0.025, 0.93]], -0.06, 0.12);
      spike("accent", 0, 1.15, 0.065, 0.035, 0.13);
    } else {
      for (const side of [-1, 1]) {
        bone("armor", [side * 0.065, 0.98, 0], [side * 0.18, 1.13, 0], 0.035);
        bone("armor", [side * 0.18, 1.13, 0], [side * 0.14, 1.24, 0.03], 0.025);
        spike("accent", side * 0.14, 1.25, 0.03, 0.022, 0.07, side * 0.3);
      }
    }
  }

  if (descriptor.backpiece === "ritual") {
    bone("armor", [0, 0.62, -0.14], [0, 1.3, -0.14], 0.028);
    for (const side of [-1, 1]) {
      bone("armor", [0, 0.92, -0.14], [side * 0.19, 1.16, -0.14], 0.024);
      spike("armor", side * 0.19, 1.21, -0.14, 0.045, 0.18, side * -0.25);
    }
    spike("accent", 0, 1.29, -0.13, 0.065, 0.16);
  }

  if (descriptor.backpiece === "shroud") {
    panel("cloth", [[-0.08, 1.05], [0.08, 1.05], [0.31, 0.75], [0.29, 0.32],
      [0.15, 0.42], [0, 0.25], [-0.15, 0.42], [-0.29, 0.32], [-0.31, 0.75]], -0.15, 0.018);
    for (const side of [-1, 1]) {
      bone("armor", [side * 0.06, 0.98, -0.12], [side * 0.32, 0.79, -0.12], 0.025);
    }
  }

  if (descriptor.backpiece === "banner") {
    for (const side of [-1, 1]) {
      bone("armor", [side * 0.15, 0.61, -0.15], [side * 0.15, 1.3, -0.15], 0.018);
      spike("accent", side * 0.15, 1.32, -0.15, 0.025, 0.08);
      panel("cloth", [[side * 0.15, 1.24], [side * 0.33, 1.2], [side * 0.31, 0.86],
        [side * 0.24, ember ? 0.94 : 1.02], [side * 0.15, 0.88]], -0.16, 0.014);
    }
  }

  if (descriptor.crown !== "none") {
    const ring = new THREE.CylinderGeometry(0.108, 0.095, 0.055, ember ? 6 : 8, 1, true);
    ring.translate(0, 1.005, 0);
    add("armor", ring);
    const queen = kind === "q";
    for (const side of [-1, 0, 1]) {
      const x = side * (queen ? 0.13 : 0.08);
      const height = side === 0 ? 0.2 : queen ? 0.23 : 0.14;
      if (ember) spike("armor", x, 1.06 + height / 2, 0, 0.048, height, side * -0.3);
      else {
        bone("armor", [side * 0.075, 1.02, 0], [x * 1.3, 1.16, 0], 0.023);
        spike("armor", x * 1.3, 1.21, 0, 0.028, 0.17, side * 0.3);
      }
      spike("accent", x, 1.08, 0.09, 0.022, 0.055);
    }
  }

  const merged = {} as GeometrySet;
  for (const surface of ["armor", "cloth", "accent"] as const) {
    merged[surface] = mergeGeometries(parts[surface], false)!;
    parts[surface].forEach((geometry) => geometry.dispose());
    merged[surface].computeBoundingSphere();
  }
  geometryCache.set(descriptor.style, merged);
  return merged;
}

export class FactionRegalia {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  readonly materials: THREE.Material[] = [];
  private readonly glow: THREE.MeshStandardMaterial;
  private readonly accents: THREE.Mesh;
  private readonly motes: THREE.Points | null;
  private disposed = false;

  constructor(private readonly descriptor: RegaliaDescriptor, figureHeight: number, secondaryMotes = true) {
    this.group.name = "faction-regalia";
    this.group.userData = { faction: descriptor.faction, kind: descriptor.kind, style: descriptor.style };
    this.group.scale.setScalar(figureHeight);
    const ember = descriptor.faction === "w";
    const armor = new THREE.MeshStandardMaterial({
      color: ember ? 0x665445 : 0xc5d1c1, metalness: ember ? 0.72 : 0.24, roughness: 0.55,
      emissive: descriptor.accent, emissiveIntensity: 0.025, side: THREE.DoubleSide,
    });
    const cloth = new THREE.MeshStandardMaterial({
      color: descriptor.cloth, metalness: 0, roughness: 0.92, side: THREE.DoubleSide,
      emissive: descriptor.cloth, emissiveIntensity: 0.14,
    });
    this.glow = new THREE.MeshStandardMaterial({
      color: descriptor.accent, emissive: descriptor.accent, emissiveIntensity: 0.9,
      metalness: 0.25, roughness: 0.35,
    });
    const geometry = geometryFor(descriptor);
    const materials = { armor, cloth, accent: this.glow };
    for (const surface of ["armor", "cloth", "accent"] as const) {
      const material = materials[surface];
      material.name = `regalia-${surface}`;
      const mesh = new THREE.Mesh(geometry[surface], material);
      mesh.name = `regalia-${surface}`;
      // These rigid adornments are smaller than the shadow silhouette threshold.
      mesh.castShadow = false;
      mesh.userData.shadowEligible = false;
      this.materials.push(material);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.accents = this.meshes[2];
    this.motes = null;
    if (secondaryMotes) {
      const material = new THREE.PointsMaterial({
        color: descriptor.accent, size: 0.018, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this.motes = new THREE.Points(moteGeometry, material);
      this.motes.name = "regalia-motes";
      this.motes.raycast = () => {};
      this.materials.push(material);
      this.group.add(this.motes);
    }
  }

  /** fade is remaining opacity (1 = alive, 0 = gone), matching PieceView. */
  update(elapsed: number, selected: boolean, hovered: boolean, fade: number): void {
    if (this.disposed) return;
    const opacity = THREE.MathUtils.clamp(fade, 0, 1);
    this.group.visible = opacity > 0;
    const pulse = Math.sin(elapsed * (this.descriptor.aura === "coals" ? 2.6 : 1.7));
    this.glow.emissiveIntensity = (0.85 + pulse * 0.15 + (selected ? 0.95 : hovered ? 0.4 : 0)) * opacity;
    // Only cold light drifts; forged plates, crowns and cloth stay rigid.
    this.accents.position.y = this.descriptor.aura === "witchlight" ? pulse * 0.012 : 0;
    if (this.motes) {
      this.motes.rotation.y = elapsed * (this.descriptor.aura === "coals" ? 0.18 : -0.24);
      this.motes.position.y = pulse * 0.025;
    }
    for (const material of this.materials) {
      const mote = (material as THREE.PointsMaterial).isPointsMaterial;
      const transparent = mote || opacity < 1;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
      material.depthWrite = !transparent;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.group.clear();
    this.materials.forEach((material) => material.dispose());
  }
}

export function buildFactionRegalia(faction: Faction, kind: PieceKind, figureHeight: number, secondaryMotes = true): FactionRegalia {
  return new FactionRegalia(regaliaDescriptor(faction, kind), figureHeight, secondaryMotes);
}
