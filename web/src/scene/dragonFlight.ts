import * as THREE from "three";
import type { QualityPreset } from "./quality";

export function dragonFlightPose(elapsed: number): {
  position: [number, number, number];
  yaw: number;
  wing: number;
  visible: boolean;
} {
  const cycle = ((elapsed % 36) + 36) % 36;
  const progress = Math.min(cycle / 16, 1);
  return {
    position: [-38 + 76 * progress, 22 - 5 * progress, -45 + 21 * progress],
    // The model's nose faces local +Z.
    yaw: Math.atan2(76, 21),
    wing: Math.sin(elapsed * 4.2) * 0.32,
    visible: cycle < 16,
  };
}

/** Original low-poly geometry for the distant, occasional dragon fly-by. */
export class DragonFlight {
  readonly group = new THREE.Group();
  private readonly leftWing = new THREE.Group();
  private readonly rightWing = new THREE.Group();
  private readonly embers: THREE.Points;

  constructor() {
    this.group.name = "dragon-flight";
    const charcoal = new THREE.MeshStandardMaterial({
      color: 0x19171b,
      roughness: 0.87,
      metalness: 0.12,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const ember = new THREE.MeshStandardMaterial({
      color: 0x6c2914,
      emissive: 0xff4c12,
      emissiveIntensity: 1.8,
      roughness: 0.7,
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 4.5, 7), charcoal);
    body.rotation.x = Math.PI / 2;
    body.scale.z = 0.75;
    this.group.add(body);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 2.2, 6), charcoal);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, 0.15, 2.8);
    this.group.add(neck);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 5), charcoal);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.2, 4.1);
    this.group.add(head);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.65, 5, 6), charcoal);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, -0.1, -4.5);
    this.group.add(tail);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.7);
    wingShape.lineTo(2.1, 2.2);
    wingShape.lineTo(6.8, 0.3);
    wingShape.lineTo(5.1, -0.7);
    wingShape.lineTo(4.5, -2.3);
    wingShape.lineTo(3, -1.8);
    wingShape.lineTo(1.9, -3);
    wingShape.lineTo(0, -1.4);
    wingShape.closePath();
    const wingGeometry = new THREE.ShapeGeometry(wingShape);
    wingGeometry.rotateX(Math.PI / 2);

    this.leftWing.name = "dragon-wing-left";
    this.rightWing.name = "dragon-wing-right";
    this.leftWing.position.set(-0.55, 0.2, 0.5);
    this.rightWing.position.set(0.55, 0.2, 0.5);
    this.leftWing.scale.x = -1;
    this.leftWing.add(new THREE.Mesh(wingGeometry, charcoal));
    this.rightWing.add(new THREE.Mesh(wingGeometry, charcoal));
    this.group.add(this.leftWing, this.rightWing);

    const eyeGeometry = new THREE.SphereGeometry(0.12, 5, 4);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, ember);
      eye.position.set(side * 0.35, 0.42, 3.9);
      this.group.add(eye);
    }
    const spineGeometry = new THREE.ConeGeometry(0.16, 0.55, 4);
    for (let index = 0; index < 5; index++) {
      const spine = new THREE.Mesh(spineGeometry, ember);
      spine.position.set(0, 0.75, 1.5 - index * 0.8);
      this.group.add(spine);
    }

    const positions = new Float32Array(18 * 3);
    for (let index = 0; index < 18; index++) {
      positions[index * 3] = Math.sin(index * 2.4) * (0.2 + index * 0.035);
      positions[index * 3 + 1] = -0.2 - index * 0.045;
      positions[index * 3 + 2] = -5 - index * 0.35;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.embers = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
      color: 0xff6a24,
      size: 0.13,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.embers.name = "dragon-embers";
    this.group.add(this.embers);
    this.update(0);
  }

  setQuality(preset: QualityPreset): void {
    this.embers.visible = preset !== "low";
  }

  update(elapsed: number): void {
    const pose = dragonFlightPose(elapsed);
    this.group.position.set(...pose.position);
    this.group.rotation.y = pose.yaw;
    this.group.visible = pose.visible;
    this.leftWing.rotation.z = -pose.wing;
    this.rightWing.rotation.z = pose.wing;
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        const ownedMaterials = Array.isArray(object.material) ? object.material : [object.material];
        ownedMaterials.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.group.removeFromParent();
    this.group.clear();
  }
}
