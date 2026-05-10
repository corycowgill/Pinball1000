import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import { COLORS, TABLE } from '../layout';
import { makeCelMaterial } from '../../render/CelMaterial';
import { addOutline } from '../../render/OutlinePass';

/**
 * Spinner. A thin rectangular blade hinged on its top edge so the ball can
 * push it through and rack up rotations.
 *
 * Uses a revolute joint around the WORLD-Z axis (transformed to local up).
 * Each completed 2π rotation emits a spinnerRotation event with a counter.
 */
export class Spinner {
  readonly bladeBody: RAPIER.RigidBody;
  readonly mesh: THREE.Mesh;
  private readonly joint: RAPIER.ImpulseJoint;
  private accumulatedAngle = 0;
  private rotationCount = 0;
  private readonly axisWorld = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private currQuat = new THREE.Quaternion();
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();

  constructor(
    world: World,
    private readonly bus: EventBus,
    parent: THREE.Object3D,
    localX: number,
    localZ: number,
  ) {
    const width = 0.07;
    const height = TABLE.wallHeight * 0.9;
    const thickness = 0.005;

    const geom = new THREE.BoxGeometry(width, height, thickness);
    // Move pivot to top edge.
    geom.translate(0, -height / 2, 0);
    const mat = makeCelMaterial({
      color: COLORS.hawksRed,
      rimColor: COLORS.paper,
      rimStrength: 0.6,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    addOutline(this.mesh, { thickness: 1.0 });

    parent.updateWorldMatrix(true, false);
    const pivotLocal = new THREE.Vector3(localX, height + 0.01, localZ);
    const pivotWorld = parent.localToWorld(pivotLocal.clone());
    const parentQuat = parent.getWorldQuaternion(new THREE.Quaternion());
    this.mesh.position.copy(pivotWorld);
    this.mesh.quaternion.copy(parentQuat);
    parent.parent?.add(this.mesh);

    // Anchor (fixed) and blade (dynamic) at the same world point.
    const anchorDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z)
      .setRotation({ x: parentQuat.x, y: parentQuat.y, z: parentQuat.z, w: parentQuat.w });
    const anchor = world.raw.createRigidBody(anchorDesc);

    const bladeDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z)
      .setRotation({ x: parentQuat.x, y: parentQuat.y, z: parentQuat.z, w: parentQuat.w })
      .setAngularDamping(2.0)
      .setLinearDamping(2.0)
      .setGravityScale(0)
      .setCcdEnabled(true);
    this.bladeBody = world.raw.createRigidBody(bladeDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, thickness / 2)
      .setTranslation(0, -height / 2, 0)
      .setFriction(0.0)
      .setRestitution(0.2)
      .setDensity(50);
    world.raw.createCollider(colDesc, this.bladeBody);

    // Revolute joint around the LOCAL X axis of the parent (which is the
    // table's "left-right" axis after tilt — i.e. spinner axle is horizontal
    // and the blade rotates fore-aft as the ball passes through).
    const jointDesc = RAPIER.JointData.revolute(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    );
    this.joint = world.raw.createImpulseJoint(jointDesc, anchor, this.bladeBody, true);
    // World-space axis of the joint = local +X transformed by parent rotation.
    this.axisWorld.set(1, 0, 0).applyQuaternion(parentQuat).normalize();

    this.prevPos.copy(pivotWorld);
    this.currPos.copy(pivotWorld);
    this.prevQuat.copy(parentQuat);
    this.currQuat.copy(parentQuat);
  }

  cachePrev(): void {
    const t = this.bladeBody.translation();
    const r = this.bladeBody.rotation();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);

    // Integrate angular velocity along the joint axis to count rotations.
    // Deadzone of 1 rad/s suppresses numerical-noise oscillation that was
    // accumulating into "phantom" rotations (and triggering Hat Trick mode
    // before the player even launched the ball).
    const angVel = this.bladeBody.angvel();
    const angVelAlongAxis =
      angVel.x * this.axisWorld.x + angVel.y * this.axisWorld.y + angVel.z * this.axisWorld.z;
    if (Math.abs(angVelAlongAxis) > 1.0) {
      this.accumulatedAngle += Math.abs(angVelAlongAxis) * (1 / 240);
      while (this.accumulatedAngle >= Math.PI * 2) {
        this.accumulatedAngle -= Math.PI * 2;
        this.rotationCount += 1;
        this.bus.emit({ type: 'spinnerRotation', count: this.rotationCount });
      }
    }
  }

  syncRender(alpha: number): void {
    this.mesh.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.quaternion.copy(this.prevQuat).slerp(this.currQuat, alpha);
  }
}
