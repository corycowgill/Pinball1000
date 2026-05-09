import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { Ball } from './Ball';
import type { ChicagoBonus } from '../../game/ChicagoBonus';
import { COLORS, ELEMENTS, TABLE } from '../layout';

/**
 * Seven rollover lanes spelling C-H-I-C-A-G-O across the top of the table.
 * Each lane is a sensor (intersection-only) collider. We poll intersection
 * with the ball every fixed step; the first frame of contact triggers the
 * rollover event and bumps the bonus state machine.
 *
 * Visuals: glowing letter plate above each lane. Lit state polled from
 * `ChicagoBonus.litLanes`.
 */
const SENSOR_HALF = { x: 0.05, y: 0.025, z: 0.04 };

interface Lane {
  letter: string;
  index: number;
  collider: RAPIER.Collider;
  letterMesh: THREE.Mesh;
  litMaterial: THREE.MeshStandardMaterial;
  unlitMaterial: THREE.MeshStandardMaterial;
  insideLastTick: boolean;
}

export class ChicagoLanes {
  private readonly lanes: Lane[] = [];

  constructor(
    private readonly world: World,
    private readonly bus: EventBus,
    private readonly ball: Ball,
    private readonly bonus: ChicagoBonus,
    parent: THREE.Object3D,
  ) {
    parent.updateWorldMatrix(true, false);

    for (let i = 0; i < ELEMENTS.chicagoLanes.length; i++) {
      const cfg = ELEMENTS.chicagoLanes[i]!;

      // Sensor collider in world space.
      const localPos = new THREE.Vector3(cfg.x, TABLE.wallHeight * 0.4, cfg.z);
      const worldPos = parent.localToWorld(localPos.clone());
      const worldQuat = parent.getWorldQuaternion(new THREE.Quaternion());

      const desc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(worldPos.x, worldPos.y, worldPos.z)
        .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
      const body = world.raw.createRigidBody(desc);
      const colDesc = RAPIER.ColliderDesc.cuboid(SENSOR_HALF.x, SENSOR_HALF.y, SENSOR_HALF.z)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const collider = world.raw.createCollider(colDesc, body);

      // Visual: glowing letter plate (the letter as a small cube; later we
      // can swap for an extruded text mesh once we wire FontLoader).
      const plateGeom = new THREE.BoxGeometry(0.09, 0.04, 0.09);
      const litMat = new THREE.MeshStandardMaterial({
        color: COLORS.halo,
        emissive: COLORS.halo,
        emissiveIntensity: 1.5,
        roughness: 0.4,
        metalness: 0.1,
      });
      const unlitMat = new THREE.MeshStandardMaterial({
        color: COLORS.bearsNavy,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.6,
        metalness: 0.2,
      });
      const plate = new THREE.Mesh(plateGeom, unlitMat);
      plate.position.copy(localPos);
      plate.position.y += 0.03;
      parent.add(plate);

      this.lanes.push({
        letter: cfg.letter,
        index: i,
        collider,
        letterMesh: plate,
        litMaterial: litMat,
        unlitMaterial: unlitMat,
        insideLastTick: false,
      });
    }
  }

  /** Call once per FIXED step. */
  tick(): void {
    for (const lane of this.lanes) {
      const inside = this.world.raw.intersectionPair(lane.collider, this.ball.collider);
      // Edge-trigger: only count the first frame the ball enters the sensor.
      if (inside && !lane.insideLastTick) {
        this.bus.emit({
          type: 'chicagoLaneRollover',
          index: lane.index,
          letter: lane.letter,
        });
      }
      lane.insideLastTick = inside;
    }
  }

  /** Render-side: swap material based on bonus state. */
  syncRender(): void {
    const lit = this.bonus.litLanes;
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = this.lanes[i]!;
      const wantLit = lit[i] === true;
      const currentMat = lane.letterMesh.material as THREE.MeshStandardMaterial;
      const want = wantLit ? lane.litMaterial : lane.unlitMaterial;
      if (currentMat !== want) lane.letterMesh.material = want;
    }
  }
}
