import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/**
 * Wraps a Rapier 3D world with helpers we'll need everywhere:
 *   - `init()` — load the WASM (mandatory before constructing anything).
 *   - `step()` — advance the world by one fixed dt; consumes contact events.
 *   - `syncMesh()` — copy a body's transform into a three.js Object3D.
 *   - Event subscription for contact-driven gameplay (bumpers, sensors).
 *
 * Gravity is world-down (0, -9.81, 0). The playfield is tilted at the scene
 * graph level instead of rotating gravity — keeps coordinates intuitive and
 * lets the L-train loop and ramps live in real 3D Z.
 */
export type ContactHandler = (
  collider1: RAPIER.Collider,
  collider2: RAPIER.Collider,
  started: boolean,
) => void;

export type IntersectionHandler = (
  collider1: RAPIER.Collider,
  collider2: RAPIER.Collider,
  started: boolean,
) => void;

export class World {
  private static wasmReady = false;

  static async init(): Promise<void> {
    if (World.wasmReady) return;
    await RAPIER.init();
    World.wasmReady = true;
  }

  readonly raw: RAPIER.World;
  readonly events: RAPIER.EventQueue;
  private contactHandlers: ContactHandler[] = [];
  private intersectionHandlers: IntersectionHandler[] = [];

  constructor(gravity: RAPIER.Vector3 = { x: 0, y: -9.81, z: 0 }) {
    if (!World.wasmReady) {
      throw new Error('World.init() must be awaited before constructing a World');
    }
    this.raw = new RAPIER.World(gravity);
    // Smaller substep count keeps steady-state cheap; CCD handles fast balls.
    this.raw.integrationParameters.numSolverIterations = 8;
    this.events = new RAPIER.EventQueue(true);
  }

  step(): void {
    this.raw.step(this.events);
    this.events.drainCollisionEvents((h1, h2, started) => {
      const c1 = this.raw.getCollider(h1);
      const c2 = this.raw.getCollider(h2);
      if (!c1 || !c2) return;
      for (const handler of this.contactHandlers) handler(c1, c2, started);
    });
    this.events.drainContactForceEvents(() => { /* unused for now */ });
  }

  onContact(handler: ContactHandler): () => void {
    this.contactHandlers.push(handler);
    return () => {
      this.contactHandlers = this.contactHandlers.filter((h) => h !== handler);
    };
  }

  onIntersection(handler: IntersectionHandler): () => void {
    this.intersectionHandlers.push(handler);
    return () => {
      this.intersectionHandlers = this.intersectionHandlers.filter((h) => h !== handler);
    };
  }

  /** Drains intersection queries from sensors at end of step. */
  pollIntersections(sensorColliders: RAPIER.Collider[]): void {
    for (const sensor of sensorColliders) {
      this.raw.intersectionPairsWith(sensor, (other) => {
        for (const handler of this.intersectionHandlers) handler(sensor, other, true);
      });
    }
  }

  syncMesh(body: RAPIER.RigidBody, obj: THREE.Object3D): void {
    const t = body.translation();
    const r = body.rotation();
    obj.position.set(t.x, t.y, t.z);
    obj.quaternion.set(r.x, r.y, r.z, r.w);
  }

  destroy(): void {
    this.raw.free();
  }
}
