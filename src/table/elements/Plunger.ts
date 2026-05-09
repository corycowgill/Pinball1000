import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { Ball } from './Ball';
import { COLORS } from '../layout';

/**
 * Plunger / launcher. We don't need a true prismatic joint — the player just
 * holds Space to charge, releases to fire. We model that as a charge meter:
 * on release, apply a vertical impulse (in the playfield's local "up the
 * lane" direction) to the ball if it's sitting in the plunger lane.
 *
 * The visible plunger pulls back proportionally to charge so the player has
 * visual feedback.
 */
export class Plunger {
  readonly mesh: THREE.Group;
  private readonly head: THREE.Mesh;
  private readonly basePos: THREE.Vector3;
  private chargeStart = 0;
  private charging = false;
  private charge = 0; // 0..1
  private readonly maxPullBack = 0.08;
  private readonly maxChargeMs = 1200;
  private readonly maxImpulse = 0.32;

  /** World direction the plunger fires. Set by Playfield (up the lane). */
  readonly fireDirWorld = new THREE.Vector3();

  constructor(scene: THREE.Scene, basePosWorld: THREE.Vector3, fireDirWorld: THREE.Vector3) {
    this.basePos = basePosWorld.clone();
    this.fireDirWorld.copy(fireDirWorld).normalize();

    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.basePos);

    // Shaft (Bears navy) — extends along -fireDir from the base.
    const shaftLen = 0.10;
    const shaftGeom = new THREE.CylinderGeometry(0.012, 0.012, shaftLen, 12);
    shaftGeom.rotateX(Math.PI / 2); // shaft along Z
    const shaftMat = new THREE.MeshStandardMaterial({
      color: COLORS.bearsNavy,
      roughness: 0.4,
      metalness: 0.5,
    });
    const shaft = new THREE.Mesh(shaftGeom, shaftMat);
    shaft.position.copy(this.fireDirWorld).multiplyScalar(-shaftLen / 2);
    this.mesh.add(shaft);

    // Head (orange button).
    const headGeom = new THREE.SphereGeometry(0.022, 12, 8);
    const headMat = new THREE.MeshStandardMaterial({
      color: COLORS.bearsOrange,
      roughness: 0.25,
      metalness: 0.6,
    });
    this.head = new THREE.Mesh(headGeom, headMat);
    this.head.position.copy(this.fireDirWorld).multiplyScalar(-shaftLen);
    this.mesh.add(this.head);

    scene.add(this.mesh);
  }

  startCharge(): void {
    this.charging = true;
    this.chargeStart = performance.now();
  }

  release(ball: Ball): boolean {
    if (!this.charging) return false;
    this.charging = false;
    const elapsed = performance.now() - this.chargeStart;
    this.charge = Math.min(1, elapsed / this.maxChargeMs);
    const impulseMag = this.charge * this.maxImpulse;
    if (impulseMag <= 0.001) {
      this.charge = 0;
      this.updateHead();
      return false;
    }
    const impulse = this.fireDirWorld.clone().multiplyScalar(impulseMag);
    ball.body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    this.charge = 0;
    this.updateHead();
    return true;
  }

  /** Call each render frame to animate the head pulling back while held. */
  update(): void {
    if (this.charging) {
      const elapsed = performance.now() - this.chargeStart;
      this.charge = Math.min(1, elapsed / this.maxChargeMs);
    }
    this.updateHead();
  }

  private updateHead(): void {
    const pull = this.charge * this.maxPullBack;
    const offset = this.fireDirWorld.clone().multiplyScalar(-0.10 - pull);
    this.head.position.copy(offset);
  }
}

// Plunger lane back stop — a static collider at the top of the plunger lane
// so the launched ball isn't launched into infinity.
export function buildPlungerLaneBackstop(
  world: World,
  posWorld: THREE.Vector3,
  rotation: THREE.Quaternion,
): RAPIER.Collider {
  const desc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(posWorld.x, posWorld.y, posWorld.z)
    .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
  const body = world.raw.createRigidBody(desc);
  const colDesc = RAPIER.ColliderDesc.cuboid(0.06, 0.04, 0.01)
    .setRestitution(0.6);
  return world.raw.createCollider(colDesc, body);
}
