import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import { COLORS, TABLE } from '../layout';
import { makeCelMaterial } from '../../render/CelMaterial';
import { addOutline } from '../../render/OutlinePass';

/**
 * Drop target. A flat target plate that, when struck by the ball, sinks into
 * a slot in the playfield (kinematic position-based body) and disables its
 * collider until the bank is reset.
 *
 * The bank (DropTargetBank) tracks the group and emits dropBankComplete
 * once all targets are down, then re-raises them.
 */
const TARGET_HEIGHT = TABLE.wallHeight * 0.7;
const TARGET_WIDTH = 0.05;
const TARGET_DEPTH = 0.018;

export class DropTarget {
  readonly mesh: THREE.Mesh;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private isDown = false;
  private animStart = 0;
  private readonly raisedY: number;
  private readonly droppedY: number;
  readonly worldPos = new THREE.Vector3();

  constructor(
    world: World,
    private readonly bus: EventBus,
    parent: THREE.Object3D,
    localX: number,
    localZ: number,
    public readonly index: number,
    color: number = COLORS.soxBlack,
  ) {
    const geom = new THREE.BoxGeometry(TARGET_WIDTH, TARGET_HEIGHT, TARGET_DEPTH);
    const mat = makeCelMaterial({
      color,
      rimColor: COLORS.paper,
      rimStrength: 0.55,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    this.raisedY = TARGET_HEIGHT * 0.5;
    this.droppedY = -TARGET_HEIGHT * 0.45;
    this.mesh.position.set(localX, this.raisedY, localZ);
    parent.add(this.mesh);
    addOutline(this.mesh, { thickness: 1.1 });

    parent.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(this.worldPos);
    const worldQuat = new THREE.Quaternion();
    this.mesh.getWorldQuaternion(worldQuat);

    // Kinematic position-based body so we can move it without it being pushed.
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.worldPos.x, this.worldPos.y, this.worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
    this.body = world.raw.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.cuboid(TARGET_WIDTH / 2, TARGET_HEIGHT / 2, TARGET_DEPTH / 2)
      .setFriction(0.05)
      .setRestitution(0.15)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.collider = world.raw.createCollider(colDesc, this.body);
  }

  onHit(): void {
    if (this.isDown) return;
    this.isDown = true;
    this.animStart = performance.now();
    this.bus.emit({ type: 'dropTargetHit', index: this.index });
  }

  reset(): void {
    if (!this.isDown) return;
    this.isDown = false;
    this.animStart = performance.now();
    this.collider.setEnabled(true);
  }

  /** Animate the drop/raise; called each render frame. */
  update(): void {
    const t = Math.min(1, (performance.now() - this.animStart) / 220);
    if (this.isDown) {
      const y = THREE.MathUtils.lerp(this.raisedY, this.droppedY, easeOutCubic(t));
      this.mesh.position.y = y;
      // Disable collider once it's mostly under the deck.
      if (t > 0.6 && this.collider.isEnabled()) this.collider.setEnabled(false);
    } else {
      const y = THREE.MathUtils.lerp(this.droppedY, this.raisedY, easeOutCubic(t));
      this.mesh.position.y = y;
    }

    // Sync the kinematic body to the new mesh world position.
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(this.worldPos);
    this.body.setNextKinematicTranslation({ x: this.worldPos.x, y: this.worldPos.y, z: this.worldPos.z });
  }

  get down(): boolean { return this.isDown; }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** A bank of N drop targets that resets together once all are down. */
export class DropTargetBank {
  readonly targets: DropTarget[];
  /** Lookup from collider handle to target. */
  readonly byHandle = new Map<number, DropTarget>();

  constructor(targets: DropTarget[], private readonly bus: EventBus) {
    this.targets = targets;
    for (const t of targets) this.byHandle.set(t.collider.handle, t);
    bus.on('dropTargetHit', () => this.checkBankComplete());
  }

  private checkBankComplete(): void {
    if (this.targets.every((t) => t.down)) {
      this.bus.emit({ type: 'dropBankComplete' });
      // Stagger the reset slightly so the player sees the empty bank.
      setTimeout(() => {
        for (const t of this.targets) t.reset();
      }, 600);
    }
  }
}
