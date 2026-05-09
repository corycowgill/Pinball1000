import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus, GameEvent } from '../../game/Events';
import type { Ball } from './Ball';
import { Materials } from '../../physics/Materials';
import { makeCelMaterial } from '../../render/CelMaterial';

/**
 * Generic curved ramp.
 *
 * Build steps:
 *   1) Sample a 3D curve into N segments.
 *   2) Render a TubeGeometry along it for the ramp surface (visual only).
 *   3) Build a chain of cuboid colliders (one per segment) to physically
 *      carry the ball — convex shapes only, never trimesh; cheaper and
 *      tunneling-safe.
 *   4) Optionally bracket with side-rail cuboids so the ball can't fly off.
 *   5) Sensor at entry (edge-trigger emits the configured `entryEvent`)
 *      and at exit (edge-trigger emits `exitEvent` for combo logic).
 *
 * The curve is in playfield-LOCAL space; the ramp parents itself to the
 * tilted playfield root and propagates colliders into world space at
 * construction.
 */

export interface RampOptions {
  /** Path in playfield-local space. Y is height above the deck. */
  curve: THREE.CatmullRomCurve3;
  /** Tube radius (visual). Also used to size the segment colliders. */
  surfaceWidth: number;
  /** Wall height on each side of the ramp. */
  wallHeight: number;
  /** Number of subdivisions along the curve for collision and tube. */
  segments?: number;
  /** Color for the ramp surface. */
  color: number;
  /** Color for the side rails. */
  railColor?: number;
  /** Optional event to emit on entry. */
  entryEvent?: GameEvent['type'];
  /** Optional event to emit on exit (e.g. for combo "loop complete"). */
  exitEvent?: GameEvent['type'];
  /** Custom emitters (e.g. rampComplete with a discriminated tag). */
  onEntry?: (bus: EventBus) => void;
  onExit?: (bus: EventBus) => void;
}

export class Ramp {
  readonly group: THREE.Group;
  readonly entrySensor: RAPIER.Collider;
  readonly exitSensor: RAPIER.Collider;
  private entryInside = false;
  private exitInside = false;

  constructor(
    private readonly world: World,
    private readonly bus: EventBus,
    private readonly ball: Ball,
    parent: THREE.Object3D,
    private readonly opts: RampOptions,
  ) {
    const segments = opts.segments ?? 24;
    this.group = new THREE.Group();
    parent.add(this.group);
    parent.updateWorldMatrix(true, false);
    this.group.updateMatrixWorld(true);

    // 1) Visual tube surface along the curve.
    const tubeGeom = new THREE.TubeGeometry(opts.curve, segments * 2, opts.surfaceWidth * 0.5, 10, false);
    const tubeMat = makeCelMaterial({
      color: opts.color,
      rimColor: 0xffffff,
      rimStrength: 0.5,
      rimPower: 2.0,
    });
    const tube = new THREE.Mesh(tubeGeom, tubeMat);
    tube.castShadow = true;
    tube.receiveShadow = true;
    this.group.add(tube);

    // 2) Sample frames + place segment colliders + side rails.
    const points = opts.curve.getSpacedPoints(segments);
    const frames = opts.curve.computeFrenetFrames(segments, false);

    for (let i = 0; i < segments; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const mid = a.clone().lerp(b, 0.5);
      const len = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();

      // Build a quaternion that points local +X along `dir` and local +Y along
      // the binormal (so the ramp's "up" stays consistent with the frame).
      const binormal = frames.binormals[i]!;
      const normal = frames.normals[i]!;
      const m = new THREE.Matrix4().makeBasis(dir, binormal, normal);
      const localQuat = new THREE.Quaternion().setFromRotationMatrix(m);

      // Floor segment — short cuboid under the tube path.
      this.addStaticCuboid(
        mid,
        localQuat,
        len * 0.55, // half extents — extra overlap to prevent gaps at curves
        opts.wallHeight * 0.06,
        opts.surfaceWidth * 0.55,
        Materials.ramp,
      );

      // Side rails — left and right walls along binormal.
      const railOffset = opts.surfaceWidth * 0.5 + 0.012;
      const railLeft = mid.clone().add(normal.clone().multiplyScalar(railOffset));
      const railRight = mid.clone().add(normal.clone().multiplyScalar(-railOffset));
      this.addStaticCuboid(
        railLeft,
        localQuat,
        len * 0.55,
        opts.wallHeight * 0.5,
        0.012,
        Materials.wall,
      );
      this.addStaticCuboid(
        railRight,
        localQuat,
        len * 0.55,
        opts.wallHeight * 0.5,
        0.012,
        Materials.wall,
      );
    }

    // 3) Entry / exit sensors at the curve endpoints.
    const entryPoint = points[0]!;
    const exitPoint = points[points.length - 1]!;
    this.entrySensor = this.addSensor(entryPoint, opts.surfaceWidth * 0.6);
    this.exitSensor = this.addSensor(exitPoint, opts.surfaceWidth * 0.6);
  }

  private addStaticCuboid(
    localPos: THREE.Vector3,
    localQuat: THREE.Quaternion,
    hx: number,
    hy: number,
    hz: number,
    material: { friction: number; restitution: number },
  ): void {
    // Compose to world space using the group's matrix.
    const worldPos = localPos.clone().applyMatrix4(this.group.matrixWorld);
    const worldQuat = this.group.getWorldQuaternion(new THREE.Quaternion()).multiply(localQuat);

    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldPos.x, worldPos.y, worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
    const body = this.world.raw.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(material.friction)
      .setRestitution(material.restitution);
    this.world.raw.createCollider(colDesc, body);
  }

  private addSensor(localPos: THREE.Vector3, halfWidth: number): RAPIER.Collider {
    const worldPos = localPos.clone().applyMatrix4(this.group.matrixWorld);
    const worldQuat = this.group.getWorldQuaternion(new THREE.Quaternion());
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldPos.x, worldPos.y, worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
    const body = this.world.raw.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.cuboid(halfWidth, halfWidth, halfWidth * 0.5)
      .setSensor(true);
    return this.world.raw.createCollider(colDesc, body);
  }

  /** Call once per fixed step. */
  tick(): void {
    const inEntry = this.world.raw.intersectionPair(this.entrySensor, this.ball.collider);
    if (inEntry && !this.entryInside) {
      this.lastEntryAt = performance.now();
      if (this.opts.onEntry) this.opts.onEntry(this.bus);
    }
    this.entryInside = inEntry;

    const inExit = this.world.raw.intersectionPair(this.exitSensor, this.ball.collider);
    if (inExit && !this.exitInside && this.entryWasRecentlyTriggered()) {
      if (this.opts.onExit) this.opts.onExit(this.bus);
    }
    this.exitInside = inExit;
  }

  private entryWasRecentlyTriggered(): boolean {
    // If the ball entered within the last 2 seconds, count the exit as a
    // "loop complete". Captures combos through long ramps.
    return this.lastEntryAt > 0 && performance.now() - this.lastEntryAt < 2000;
  }

  private lastEntryAt = 0;
}
