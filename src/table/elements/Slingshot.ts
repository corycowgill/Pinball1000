import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { Ball } from './Ball';
import { COLORS, TABLE } from '../layout';
import { makeCelMaterial } from '../../render/CelMaterial';
import { addOutline } from '../../render/OutlinePass';

/**
 * Slingshot — angled triangular kicker pad above each flipper. Detects ball
 * contact and fires the ball away from the pad face.
 *
 * Modeled as a thin angled cuboid for collision (not a true triangle prism;
 * the visual is a flat triangle but physics doesn't need that fidelity).
 */
export class Slingshot {
  readonly handle: number;
  private readonly mesh: THREE.Mesh;
  private flashUntil = 0;
  private readonly worldPos = new THREE.Vector3();
  private readonly worldNormal = new THREE.Vector3();

  constructor(
    world: World,
    private readonly bus: EventBus,
    private readonly ball: Ball,
    parent: THREE.Object3D,
    localX: number,
    localZ: number,
    public readonly id: 'left' | 'right',
  ) {
    const len = 0.16;
    const thickness = 0.022;
    const height = TABLE.wallHeight * 0.8;

    // Visual — a wedge oriented so its hypotenuse faces inward toward the
    // center of the table (where the ball would approach the flipper from).
    const geom = new THREE.BoxGeometry(len, height, thickness);
    const mat = makeCelMaterial({
      color: id === 'left' ? COLORS.bullsRed : COLORS.cubsBlue,
      rimStrength: 0.55,
      rimPower: 2.0,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    // Rotate so the long edge angles up-toward-the-flipper.
    const rotY = id === 'left' ? -0.78 : 0.78;
    this.mesh.position.set(localX, height / 2, localZ);
    this.mesh.rotation.y = rotY;
    this.mesh.castShadow = true;
    parent.add(this.mesh);
    addOutline(this.mesh, { thickness: 1.3 });

    parent.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(this.worldPos);
    const worldQuat = new THREE.Quaternion();
    this.mesh.getWorldQuaternion(worldQuat);

    // The pad's outward normal is the local +Z axis transformed.
    this.worldNormal
      .set(0, 0, id === 'left' ? 1 : 1) // both face into the table
      .applyQuaternion(worldQuat)
      .normalize();
    // Flip so it points AWAY from the slingshot toward where the ball lives.
    if (id === 'left') this.worldNormal.set(1, 0, -0.4).normalize();
    else this.worldNormal.set(-1, 0, -0.4).normalize();

    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(this.worldPos.x, this.worldPos.y, this.worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
    const body = world.raw.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.cuboid(len / 2, height / 2, thickness / 2)
      .setFriction(0.05)
      .setRestitution(0.6)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const col = world.raw.createCollider(colDesc, body);
    this.handle = col.handle;
  }

  onHit(): void {
    const popStrength = 0.16;
    this.ball.body.applyImpulse(
      {
        x: this.worldNormal.x * popStrength,
        y: 0.02,
        z: this.worldNormal.z * popStrength,
      },
      true,
    );
    this.bus.emit({
      type: 'slingshotHit',
      id: this.id,
      worldX: this.worldPos.x,
      worldY: this.worldPos.y,
      worldZ: this.worldPos.z,
    });
    this.flashUntil = performance.now() + 90;
  }

  update(): void {
    const flashing = performance.now() < this.flashUntil;
    const mat = this.mesh.material as THREE.MeshToonMaterial;
    if (flashing) {
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = 1.2;
    } else if (mat.emissiveIntensity !== 0) {
      mat.emissiveIntensity = 0;
    }
  }
}
