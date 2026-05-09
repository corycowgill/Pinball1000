import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { TeamId } from '../layout';
import { COLORS, TABLE } from '../layout';
import { makeCelMaterial } from '../../render/CelMaterial';
import { addOutline } from '../../render/OutlinePass';

const TEAM_COLOR: Record<TeamId, number> = {
  bears: COLORS.bearsOrange,
  bulls: COLORS.bullsRed,
  cubs: COLORS.cubsBlue,
  sox: COLORS.soxBlack,
  hawks: COLORS.hawksRed,
  fire: COLORS.fireRed,
};

/**
 * Standup target. A small static plate; on contact emits teamTargetHit
 * which the ModeManager listens for to start the team's mode.
 *
 * Kept simple — no animation other than a flash. The ball bounces off
 * normally (modest restitution) so it can rebound into the playfield.
 */
export class TeamTarget {
  readonly handle: number;
  readonly mesh: THREE.Mesh;
  readonly worldPos = new THREE.Vector3();
  private flashUntil = 0;

  constructor(
    world: World,
    private readonly bus: EventBus,
    parent: THREE.Object3D,
    localX: number,
    localZ: number,
    public readonly team: TeamId,
  ) {
    const width = 0.06;
    const height = TABLE.wallHeight * 0.85;
    const thickness = 0.020;

    const geom = new THREE.BoxGeometry(width, height, thickness);
    const mat = makeCelMaterial({
      color: TEAM_COLOR[team],
      rimColor: COLORS.paper,
      rimStrength: 0.65,
      rimPower: 1.8,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.set(localX, height / 2, localZ);
    this.mesh.castShadow = true;
    parent.add(this.mesh);
    addOutline(this.mesh, { thickness: 1.3 });

    parent.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(this.worldPos);
    const worldQuat = new THREE.Quaternion();
    this.mesh.getWorldQuaternion(worldQuat);

    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(this.worldPos.x, this.worldPos.y, this.worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
    const body = world.raw.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, thickness / 2)
      .setFriction(0.05)
      .setRestitution(0.6)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const col = world.raw.createCollider(colDesc, body);
    this.handle = col.handle;
  }

  onHit(): void {
    this.bus.emit({ type: 'teamTargetHit', team: this.team });
    this.flashUntil = performance.now() + 200;
  }

  update(): void {
    const flashing = performance.now() < this.flashUntil;
    const mat = this.mesh.material as THREE.MeshToonMaterial;
    if (flashing) {
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = 1.6;
    } else if (mat.emissiveIntensity !== 0) {
      mat.emissiveIntensity = 0;
    }
  }
}
