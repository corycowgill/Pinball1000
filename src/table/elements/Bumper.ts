import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { Ball } from './Ball';
import { COLORS, TABLE } from '../layout';
import { makeCelMaterial } from '../../render/CelMaterial';
import { addOutline } from '../../render/OutlinePass';

/**
 * Pop bumper. Static collider with collision events enabled. On contact with
 * the ball, applies an outward impulse along the contact normal, emits a
 * bumperHit event, and flashes the cap mesh briefly.
 *
 * The flash is purely cosmetic — the impulse and event drive scoring/audio.
 */
export class Bumper {
  readonly handle: number;
  readonly id: string;
  private readonly cap: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private flashUntil = 0;
  private readonly worldPos = new THREE.Vector3();
  private readonly outwardWorld = new THREE.Vector3();

  constructor(
    private readonly world: World,
    private readonly bus: EventBus,
    private readonly ball: Ball,
    parent: THREE.Object3D,
    localX: number,
    localZ: number,
    id: string,
  ) {
    this.id = id;
    const radius = 0.045;
    const height = TABLE.wallHeight * 1.2;

    // Visual: a navy puck with an orange cap (Bears flair).
    const ringGeom = new THREE.CylinderGeometry(radius, radius * 1.05, height * 0.55, 16);
    const ringMat = makeCelMaterial({ color: COLORS.bearsNavy, rimStrength: 0.4 });
    this.ring = new THREE.Mesh(ringGeom, ringMat);
    this.ring.position.set(localX, height * 0.3, localZ);
    this.ring.castShadow = true;
    parent.add(this.ring);
    addOutline(this.ring, { thickness: 1.2 });

    const capGeom = new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, height * 0.45, 16);
    const capMat = makeCelMaterial({
      color: COLORS.bearsOrange,
      rimStrength: 0.7,
      rimPower: 1.8,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    this.cap = new THREE.Mesh(capGeom, capMat);
    this.cap.position.set(localX, height * 0.6, localZ);
    this.cap.castShadow = true;
    parent.add(this.cap);
    addOutline(this.cap, { thickness: 1.3 });

    // Collider in world space — bumpers are static.
    parent.updateWorldMatrix(true, false);
    this.cap.getWorldPosition(this.worldPos);

    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      this.worldPos.x,
      this.worldPos.y - height * 0.2,
      this.worldPos.z,
    );
    const body = world.raw.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius)
      .setFriction(0.0)
      .setRestitution(0.85)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const col = world.raw.createCollider(colDesc, body);
    this.handle = col.handle;
  }

  /** Called by Game's contact handler when this bumper is one of the pair. */
  onHit(): void {
    // Compute outward (radial) direction from bumper to ball, in world space.
    const ballT = this.ball.body.translation();
    this.outwardWorld
      .set(ballT.x - this.worldPos.x, 0, ballT.z - this.worldPos.z)
      .normalize();
    if (this.outwardWorld.lengthSq() < 1e-4) {
      // Ball directly above — give a small forward kick.
      this.outwardWorld.set(0, 0, 1);
    }
    const popStrength = 0.18;
    this.ball.body.applyImpulse(
      {
        x: this.outwardWorld.x * popStrength,
        y: 0.04,
        z: this.outwardWorld.z * popStrength,
      },
      true,
    );
    this.bus.emit({
      type: 'bumperHit',
      id: this.id,
      worldX: this.worldPos.x,
      worldY: this.worldPos.y,
      worldZ: this.worldPos.z,
    });
    this.flashUntil = performance.now() + 120;
  }

  update(): void {
    const now = performance.now();
    const flashing = now < this.flashUntil;
    const mat = this.cap.material as THREE.MeshToonMaterial;
    if (flashing) {
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = 1.5;
      this.cap.scale.setScalar(1.18);
    } else if (mat.emissiveIntensity !== 0) {
      mat.emissiveIntensity = 0;
      this.cap.scale.setScalar(1);
    }
  }
}
