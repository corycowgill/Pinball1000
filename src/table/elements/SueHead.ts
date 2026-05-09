import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { Ball } from './Ball';
import { COLORS, ELEMENTS, TABLE } from '../layout';
import { makeCelMaterial } from '../../render/CelMaterial';
import { addOutline } from '../../render/OutlinePass';

/**
 * Sue the T-Rex head — the Field Museum mascot, mounted upper-right of the
 * playfield. Built from primitives because we have no GLB pipeline yet:
 *   - Skull: elongated box with a tapered snout cone.
 *   - Lower jaw: a separate hinged box that opens and closes.
 *   - Eyes + teeth: small detail meshes.
 *   - Throat: an interior sensor that captures the ball when the jaw is open.
 *
 * Capture flow:
 *   1) Jaw opens (driven externally — e.g., when player spells C-H-I).
 *   2) Ball enters the throat sensor while jaw is open.
 *   3) onSwallow():
 *        - disable ball collider, freeze body.
 *        - park ball mesh inside the throat for the cinematic.
 *        - emit `sueSwallowed` so the SueMiniGame state machine can take over.
 *   4) Externally call `release(direction, impulse)` to spit the ball back
 *      out (used at end of mini-game, or as a timeout safety net).
 */

const JAW_REST = 0;            // closed
const JAW_OPEN = 0.65;         // radians, ~37°
const JAW_OPEN_DURATION = 250;
const JAW_CLOSE_DURATION = 220;

export class SueHead {
  readonly group: THREE.Group;
  readonly throatSensor: RAPIER.Collider;
  readonly worldPos = new THREE.Vector3();

  private readonly skullMesh: THREE.Mesh;
  private readonly jawPivot: THREE.Group;
  private readonly toothCollider: RAPIER.Collider;
  private jawState: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  private jawAnimStart = 0;
  private jawAngle = JAW_REST;

  private capturedBall = false;
  private originalBallPos = new THREE.Vector3();

  constructor(
    private readonly world: World,
    private readonly bus: EventBus,
    private readonly ball: Ball,
    parent: THREE.Object3D,
  ) {
    const scale = 0.18;

    this.group = new THREE.Group();
    this.group.position.set(ELEMENTS.sueHead.x, 0.04, ELEMENTS.sueHead.z);
    // Face toward the lower-left of the table so the jaw mouth points toward
    // the flipper area, where shots will come from.
    this.group.rotation.y = -Math.PI * 0.3;
    parent.add(this.group);

    // Skull — elongated egg-shape via two boxes + a snout cone.
    const skullMat = makeCelMaterial({
      color: 0xb8a878,
      rimColor: COLORS.paper,
      rimStrength: 0.55,
      rimPower: 1.8,
    });
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 1.6, scale * 1.0, scale * 0.9),
      skullMat,
    );
    skull.position.set(scale * 0.2, scale * 0.6, 0);
    this.group.add(skull);
    addOutline(skull, { thickness: 1.4 });
    this.skullMesh = skull;

    const snout = new THREE.Mesh(
      new THREE.ConeGeometry(scale * 0.45, scale * 0.7, 6),
      skullMat,
    );
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(scale * 1.15, scale * 0.55, 0);
    this.group.add(snout);
    addOutline(snout, { thickness: 1.3 });

    // Eye sockets.
    const eyeMat = makeCelMaterial({
      color: COLORS.halo,
      emissive: COLORS.halo,
      emissiveIntensity: 0.6,
      rimStrength: 0.0,
    });
    for (const ex of [-0.05, -0.05]) {
      void ex;
    }
    for (const z of [-scale * 0.32, scale * 0.32]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.08, 12, 8), eyeMat);
      eye.position.set(scale * 0.55, scale * 0.85, z);
      this.group.add(eye);
    }

    // Lower jaw on a pivot at the snout base.
    this.jawPivot = new THREE.Group();
    this.jawPivot.position.set(scale * 0.4, scale * 0.4, 0);
    this.group.add(this.jawPivot);

    const jawMat = makeCelMaterial({
      color: 0x9c8c5e,
      rimColor: COLORS.paper,
      rimStrength: 0.55,
    });
    const jawGeom = new THREE.BoxGeometry(scale * 1.1, scale * 0.18, scale * 0.7);
    jawGeom.translate(scale * 0.55, -scale * 0.08, 0);
    const jaw = new THREE.Mesh(jawGeom, jawMat);
    this.jawPivot.add(jaw);
    addOutline(jaw, { thickness: 1.3 });

    // Teeth — a row of little cones along the jaw and along the snout's underside.
    const toothMat = makeCelMaterial({ color: 0xfff1d6, rimStrength: 0.4 });
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = scale * (0.15 + 0.85 * t);
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(scale * 0.05, scale * 0.18, 4),
        toothMat,
      );
      tooth.position.set(x, scale * 0.05, scale * 0.28 - scale * 0.14 * t);
      this.jawPivot.add(tooth);
    }
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = scale * (0.15 + 0.85 * t);
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(scale * 0.05, scale * 0.18, 4),
        toothMat,
      );
      tooth.rotation.z = Math.PI;
      tooth.position.set(x, scale * 0.35, scale * 0.28 - scale * 0.14 * t);
      this.group.add(tooth); // upper teeth are part of skull, not jaw
    }

    // Throat sensor — a box just inside the mouth opening.
    parent.updateWorldMatrix(true, false);
    this.group.updateMatrixWorld(true);
    const throatLocal = new THREE.Vector3(scale * 0.6, scale * 0.5, 0);
    const throatWorld = throatLocal.clone().applyMatrix4(this.group.matrixWorld);
    const groupWorldQuat = this.group.getWorldQuaternion(new THREE.Quaternion());

    const sensorDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(throatWorld.x, throatWorld.y, throatWorld.z)
      .setRotation({ x: groupWorldQuat.x, y: groupWorldQuat.y, z: groupWorldQuat.z, w: groupWorldQuat.w });
    const sensorBody = world.raw.createRigidBody(sensorDesc);
    const sensorColDesc = RAPIER.ColliderDesc.cuboid(scale * 0.18, scale * 0.18, scale * 0.18)
      .setSensor(true);
    this.throatSensor = world.raw.createCollider(sensorColDesc, sensorBody);

    // Solid front collider when jaw is closed — ball bounces off teeth.
    // Disabled when jaw opens.
    const toothLocal = new THREE.Vector3(scale * 1.1, scale * 0.5, 0);
    const toothWorld = toothLocal.clone().applyMatrix4(this.group.matrixWorld);
    const toothBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toothWorld.x, toothWorld.y, toothWorld.z)
      .setRotation({ x: groupWorldQuat.x, y: groupWorldQuat.y, z: groupWorldQuat.z, w: groupWorldQuat.w });
    const toothBody = world.raw.createRigidBody(toothBodyDesc);
    const toothColDesc = RAPIER.ColliderDesc.cuboid(scale * 0.08, scale * 0.18, scale * 0.32)
      .setFriction(0.05)
      .setRestitution(0.6);
    this.toothCollider = world.raw.createCollider(toothColDesc, toothBody);

    // Skull body — a box collider so the ball can't fly through Sue.
    const skullBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(throatWorld.x - 0.05, throatWorld.y, throatWorld.z)
      .setRotation({ x: groupWorldQuat.x, y: groupWorldQuat.y, z: groupWorldQuat.z, w: groupWorldQuat.w });
    const skullBody = world.raw.createRigidBody(skullBodyDesc);
    const skullColDesc = RAPIER.ColliderDesc.cuboid(scale * 0.65, scale * 0.55, scale * 0.4)
      .setFriction(0.1)
      .setRestitution(0.4);
    world.raw.createCollider(skullColDesc, skullBody);

    this.group.getWorldPosition(this.worldPos);
    void this.skullMesh; // suppress unused warning if later refactor moves geometry
  }

  /** Open the jaw. The ball can now enter and be captured. */
  openJaw(): void {
    if (this.jawState === 'open' || this.jawState === 'opening') return;
    this.jawState = 'opening';
    this.jawAnimStart = performance.now();
    this.toothCollider.setEnabled(false);
  }

  /** Close the jaw. Re-enables the front collider so balls bounce. */
  closeJaw(): void {
    if (this.jawState === 'closed' || this.jawState === 'closing') return;
    this.jawState = 'closing';
    this.jawAnimStart = performance.now();
    this.toothCollider.setEnabled(true);
  }

  /** True if the throat is currently open to receive a ball. */
  get jawIsOpen(): boolean { return this.jawState === 'open' || this.jawState === 'opening'; }

  /** Call once per fixed step. Detects swallowing. */
  tick(): void {
    // Jaw animation step.
    const t = Math.min(1, (performance.now() - this.jawAnimStart) /
      (this.jawState === 'opening' || this.jawState === 'closing'
        ? (this.jawState === 'opening' ? JAW_OPEN_DURATION : JAW_CLOSE_DURATION)
        : 1));
    if (this.jawState === 'opening') {
      this.jawAngle = THREE.MathUtils.lerp(JAW_REST, JAW_OPEN, easeOutCubic(t));
      if (t >= 1) this.jawState = 'open';
    } else if (this.jawState === 'closing') {
      this.jawAngle = THREE.MathUtils.lerp(JAW_OPEN, JAW_REST, easeOutCubic(t));
      if (t >= 1) this.jawState = 'closed';
    }
    this.jawPivot.rotation.z = -this.jawAngle;

    // Capture: if jaw is open and the ball enters the throat sensor.
    if (this.jawIsOpen && !this.capturedBall) {
      const inside = this.world.raw.intersectionPair(this.throatSensor, this.ball.collider);
      if (inside) this.swallow();
    }
  }

  private swallow(): void {
    this.capturedBall = true;
    const t = this.ball.body.translation();
    this.originalBallPos.set(t.x, t.y, t.z);

    // Disable the body — no physics for the ball during the cinematic.
    this.ball.body.setEnabled(false);

    // Move mesh just inside the throat for visual cue.
    this.group.getWorldPosition(this.worldPos);
    this.ball.mesh.position.copy(this.worldPos).y += 0.04;

    // Snap jaw closed dramatically.
    this.closeJaw();

    this.bus.emit({ type: 'sueSwallowed' });
  }

  /**
   * Release a captured ball. `direction` is in WORLD space — typically the
   * mini-game scheduler launches it back toward the L-train loop entry or
   * toward the playfield center.
   */
  release(directionWorld: THREE.Vector3, impulseMag: number): void {
    if (!this.capturedBall) return;
    this.capturedBall = false;

    // Position the ball just outside the snout opening, then re-enable.
    const exitLocal = new THREE.Vector3(0.22, 0.12, 0);
    const exitWorld = exitLocal.applyMatrix4(this.group.matrixWorld);
    this.ball.body.setTranslation({ x: exitWorld.x, y: exitWorld.y, z: exitWorld.z }, true);
    this.ball.body.setEnabled(true);
    this.ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    const dir = directionWorld.clone().normalize().multiplyScalar(impulseMag);
    this.ball.body.applyImpulse({ x: dir.x, y: dir.y, z: dir.z }, true);

    this.openJaw();
    setTimeout(() => this.closeJaw(), 600);
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
