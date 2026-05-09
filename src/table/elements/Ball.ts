import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import { Materials } from '../../physics/Materials';
import { BALL, COLORS } from '../layout';

/**
 * The pinball. Dynamic body with CCD enabled (essential — pinballs are the
 * canonical tunneling case). The mesh is interpolated each render frame using
 * the previous and current physics-step positions so motion stays smooth even
 * though physics ticks at 240Hz.
 */
export class Ball {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly mesh: THREE.Mesh;

  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: World, spawnWorld: THREE.Vector3) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnWorld.x, spawnWorld.y, spawnWorld.z)
      .setLinearDamping(Materials.ball.linearDamping)
      .setAngularDamping(Materials.ball.angularDamping)
      .setCcdEnabled(true);
    this.body = world.raw.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.ball(BALL.radius)
      .setDensity(Materials.ball.density)
      .setFriction(Materials.ball.friction)
      .setRestitution(Materials.ball.restitution)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.collider = world.raw.createCollider(colDesc, this.body);

    const geom = new THREE.SphereGeometry(BALL.radius, 28, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xeef0f3,
      roughness: 0.18,
      metalness: 0.95,
      envMapIntensity: 1.2,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.prevPos.copy(spawnWorld);
    this.currPos.copy(spawnWorld);
  }

  respawn(spawnWorld: THREE.Vector3): void {
    this.body.setTranslation({ x: spawnWorld.x, y: spawnWorld.y, z: spawnWorld.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevPos.copy(spawnWorld);
    this.currPos.copy(spawnWorld);
  }

  /** Call once per fixed step BEFORE world.step() to capture starting pose. */
  cachePrev(): void {
    const t = this.body.translation();
    this.prevPos.copy(this.currPos);
    this.currPos.set(t.x, t.y, t.z);
  }

  /** Render-side interpolation between the two cached positions. */
  syncRender(alpha: number): void {
    this.mesh.position.lerpVectors(this.prevPos, this.currPos, alpha);
    const r = this.body.rotation();
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  get position(): RAPIER.Vector3 {
    return this.body.translation();
  }
}

// Tag color used elsewhere to match the highlight ring around the ball when
// the active mode is Bears.
export const BALL_HIGHLIGHT_COLOR = COLORS.bearsOrange;
