import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import { Materials } from '../../physics/Materials';
import { COLORS, TABLE } from '../layout';

/**
 * Pinball flipper. A dynamic capsule body anchored to the playfield via a
 * revolute joint around the local Y axis. The joint motor is driven to a
 * positive velocity when raised and a negative velocity when released, with
 * angular limits enforcing the rest/raised arc.
 *
 * The mesh is interpolated each render frame off the body's transform.
 */
export interface FlipperOptions {
  /** Pivot position in playfield-local space. */
  pivotLocal: THREE.Vector3;
  /** Length from pivot to tip. */
  length: number;
  /** Thickness (Y extent of capsule). */
  thickness: number;
  /** Resting angle in radians (negative for left, positive for right). */
  restAngle: number;
  /** Raised angle in radians (the other extreme). */
  raisedAngle: number;
  /** Color for the bat — Bears orange or Bulls red. */
  color: number;
  /** True for the LEFT flipper (so we know which side it sweeps). */
  isLeft: boolean;
  /** Parent for the mesh. Collider lives in WORLD space. */
  meshParent: THREE.Object3D;
}

export class Flipper {
  readonly body: RAPIER.RigidBody;
  readonly mesh: THREE.Mesh;
  readonly joint: RAPIER.ImpulseJoint;
  private readonly opts: FlipperOptions;
  private prevQuat = new THREE.Quaternion();
  private currQuat = new THREE.Quaternion();
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();

  constructor(world: World, opts: FlipperOptions) {
    this.opts = opts;

    // 1) Anchor the pivot in WORLD space (account for parent's tilt).
    const pivotWorld = opts.meshParent.localToWorld(opts.pivotLocal.clone());
    const parentQuat = opts.meshParent.getWorldQuaternion(new THREE.Quaternion());

    // 2) Mesh — a tapered cuboid for now (real flipper-shaped GLB later).
    const geom = new THREE.BoxGeometry(opts.length, opts.thickness, opts.thickness * 1.6);
    geom.translate(opts.length / 2, 0, 0); // origin at the pivot end
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color,
      roughness: 0.3,
      metalness: 0.4,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    // Mesh lives at scene root because its body is in world space.
    opts.meshParent.parent?.add(this.mesh);

    // 3) Body — dynamic so the joint motor can drive it.
    // Initial rotation = parent's tilt * restAngle around local Y.
    const localRotY = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      opts.restAngle,
    );
    const startQuat = parentQuat.clone().multiply(localRotY);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z)
      .setRotation({ x: startQuat.x, y: startQuat.y, z: startQuat.z, w: startQuat.w })
      .setCcdEnabled(true)
      .setGravityScale(0); // joint anchors prevent the flipper from falling, but disable gravity to avoid sag
    this.body = world.raw.createRigidBody(bodyDesc);

    // 4) Collider — capsule along local +X axis.
    const halfLen = opts.length / 2 - opts.thickness;
    // Capsule axis is Y by default in Rapier; rotate to X by swapping convention.
    // Use a cuboid for simpler/cheaper collisions — fine for flat bats.
    const colDesc = RAPIER.ColliderDesc.cuboid(halfLen + opts.thickness, opts.thickness / 2, opts.thickness * 0.8)
      .setTranslation(opts.length / 2, 0, 0)
      .setFriction(Materials.flipper.friction)
      .setRestitution(Materials.flipper.restitution)
      .setDensity(900);
    world.raw.createCollider(colDesc, this.body);

    // 5) Anchor the playfield to a fixed body at the same world point — this
    // is the joint partner. Cheaper than reusing the deck body because we
    // don't need contact between flipper and deck collider.
    const anchorDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z)
      .setRotation({ x: parentQuat.x, y: parentQuat.y, z: parentQuat.z, w: parentQuat.w });
    const anchorBody = world.raw.createRigidBody(anchorDesc);

    // 6) Revolute joint around local Y of both bodies (the "up" axis of the
    // tilted playfield, which IS the flipper's natural pivot axis).
    const jointDesc = RAPIER.JointData.revolute(
      { x: 0, y: 0, z: 0 }, // anchor1 at the fixed body's origin
      { x: 0, y: 0, z: 0 }, // anchor2 at the flipper body's origin
      { x: 0, y: 1, z: 0 }, // axis in BOTH bodies' local frames
    );
    const joint = world.raw.createImpulseJoint(jointDesc, anchorBody, this.body, true);
    this.joint = joint;

    // 7) Configure motor + limits. Limits use the joint's local axis frame.
    const revolute = joint as RAPIER.RevoluteImpulseJoint;
    const lo = Math.min(opts.restAngle, opts.raisedAngle);
    const hi = Math.max(opts.restAngle, opts.raisedAngle);
    revolute.setLimits(lo, hi);
    // Resting-state motor: park at restAngle.
    revolute.configureMotorPosition(opts.restAngle, 8000, 200);

    const tInit = this.body.translation();
    this.prevPos.set(tInit.x, tInit.y, tInit.z);
    this.currPos.copy(this.prevPos);
    this.prevQuat.copy(startQuat);
    this.currQuat.copy(startQuat);
  }

  press(): void {
    const revolute = this.joint as RAPIER.RevoluteImpulseJoint;
    revolute.configureMotorPosition(this.opts.raisedAngle, 8000, 200);
  }

  release(): void {
    const revolute = this.joint as RAPIER.RevoluteImpulseJoint;
    revolute.configureMotorPosition(this.opts.restAngle, 8000, 200);
  }

  cachePrev(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  syncRender(alpha: number): void {
    this.mesh.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.quaternion.copy(this.prevQuat).slerp(this.currQuat, alpha);
  }
}

/** Convenience presets matching the layout. */
export const FLIPPER_DIMENSIONS = {
  length: 0.18,
  thickness: 0.022,
  height: TABLE.wallHeight * 0.65,
} as const;

export const FLIPPER_COLORS = {
  left: COLORS.bearsOrange,
  right: COLORS.bullsRed,
} as const;
