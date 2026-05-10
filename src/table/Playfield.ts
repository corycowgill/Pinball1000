import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../physics/World';
import { Materials } from '../physics/Materials';
import { TABLE, TILT_RAD, COLORS, ELEMENTS, BALL, Z_BOTTOM, Z_TOP, X_LEFT, X_RIGHT } from './layout';
import { makeCelMaterial } from '../render/CelMaterial';

/**
 * Builds the static playfield: deck, perimeter walls, drain lane, ball trough.
 * The whole thing is parented to a tilted root so all child poses can stay in
 * intuitive top-down coordinates.
 *
 * Future chunks attach flippers, bumpers, ramps, etc. as children of `root`.
 */
export class Playfield {
  readonly root: THREE.Group;
  readonly tiltedRoot: THREE.Group;

  /** Ball spawn position in WORLD space, computed from the tilted root. */
  readonly ballSpawnWorld = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly world: World) {
    this.root = new THREE.Group();
    this.tiltedRoot = new THREE.Group();
    this.tiltedRoot.rotation.x = -TILT_RAD;
    this.root.add(this.tiltedRoot);
    scene.add(this.root);
    // Force world matrices so static colliders can be positioned in world
    // space immediately during construction.
    this.root.updateMatrixWorld(true);

    this.buildDeck();
    this.buildPerimeterWalls();
    this.buildDrainGuides();

    this.computeBallSpawn();
  }

  /** Convert a playfield-local (x, y, z) into world coordinates. */
  localToWorld(x: number, y: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(x, y, z).applyMatrix4(this.tiltedRoot.matrixWorld);
  }

  private buildDeck(): void {
    // Visual deck — Chicago skyline blue felt with a soft cel ramp so the
    // tilt direction reads even on flat shading.
    const geom = new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth);
    const mat = makeCelMaterial({
      color: COLORS.field,
      rimStrength: 0.0,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = -TABLE.thickness / 2;
    mesh.receiveShadow = true;
    this.tiltedRoot.add(mesh);

    // Painted "lake" along the right gutter — placeholder visual touch.
    const lakeGeom = new THREE.PlaneGeometry(0.18, TABLE.depth * 0.8);
    const lakeMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.35,
    });
    const lake = new THREE.Mesh(lakeGeom, lakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(X_RIGHT - 0.13, 0.001, 0);
    this.tiltedRoot.add(lake);

    // Static collider for the deck — pose copied from the mesh's world matrix.
    this.colliderForBox(
      mesh,
      TABLE.width / 2,
      TABLE.thickness / 2,
      TABLE.depth / 2,
      Materials.playfield,
    );
  }

  private buildPerimeterWalls(): void {
    const wallMat = makeCelMaterial({
      color: COLORS.bearsNavy,
      rimColor: COLORS.halo,
      rimStrength: 0.55,
      rimPower: 2.4,
    });
    const wallY = TABLE.wallHeight / 2;

    // Left wall (full length).
    this.addWall(
      new THREE.Vector3(X_LEFT - TABLE.wallThickness / 2, wallY, 0),
      new THREE.Vector3(TABLE.wallThickness / 2, TABLE.wallHeight / 2, TABLE.depth / 2),
      wallMat,
    );
    // Right wall — split to leave a plunger lane (we cut around the plunger later).
    this.addWall(
      new THREE.Vector3(X_RIGHT + TABLE.wallThickness / 2, wallY, 0),
      new THREE.Vector3(TABLE.wallThickness / 2, TABLE.wallHeight / 2, TABLE.depth / 2),
      wallMat,
    );
    // Top wall.
    this.addWall(
      new THREE.Vector3(0, wallY, Z_TOP - TABLE.wallThickness / 2),
      new THREE.Vector3(TABLE.width / 2 + TABLE.wallThickness, TABLE.wallHeight / 2, TABLE.wallThickness / 2),
      wallMat,
    );
    // Plunger-lane divider — vertical wall separating the launch lane from
    // the playfield. Stops short of the top so the ball can exit into the
    // main playfield.
    const dividerHalfLen = (TABLE.depth / 2 - 0.18); // shorter at top
    const dividerCenterZ = (Z_BOTTOM - dividerHalfLen) - 0.01;
    this.addWall(
      new THREE.Vector3(X_RIGHT - 0.12, wallY, dividerCenterZ),
      new THREE.Vector3(0.012, TABLE.wallHeight / 2, dividerHalfLen),
      wallMat,
    );

    // Kicker rail at the TOP of the plunger lane — angled so a ball flying
    // up the lane bounces off into the playfield instead of straight back
    // down. This is the classic "ball arch" you see at the top of every
    // pinball table's plunger lane.
    const kickerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, TABLE.wallHeight, 0.018),
      wallMat,
    );
    kickerMesh.position.set(X_RIGHT - 0.10, wallY, Z_TOP + 0.10);
    kickerMesh.rotation.y = Math.PI / 4; // 45° — redirects -Z motion into -X
    this.tiltedRoot.add(kickerMesh);
    this.colliderForBox(kickerMesh, 0.11, TABLE.wallHeight / 2, 0.009, Materials.wall);
  }

  /**
   * Drain "lane" between the flippers. Two angled guide rails funnel a missed
   * ball into the gap. The actual drain sensor and ball-loss handling lives
   * in BallController (chunk 4) — for now we just shape the geometry.
   */
  private buildDrainGuides(): void {
    const guideMat = makeCelMaterial({
      color: COLORS.bearsNavy,
      rimColor: COLORS.halo,
      rimStrength: 0.45,
    });

    // Left drain guide — angled bar from outer wall to flipper pivot.
    const leftLen = 0.36;
    const leftGuide = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, TABLE.wallHeight, leftLen),
      guideMat,
    );
    leftGuide.position.set(X_LEFT + 0.08, TABLE.wallHeight / 2, Z_BOTTOM - leftLen / 2 - 0.04);
    leftGuide.rotation.y = Math.PI / 7;
    this.tiltedRoot.add(leftGuide);
    this.colliderForBox(leftGuide, 0.01, TABLE.wallHeight / 2, leftLen / 2);

    // Right drain guide — mirror.
    const rightGuide = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, TABLE.wallHeight, leftLen),
      guideMat,
    );
    rightGuide.position.set(X_RIGHT - 0.08, TABLE.wallHeight / 2, Z_BOTTOM - leftLen / 2 - 0.04);
    rightGuide.rotation.y = -Math.PI / 7;
    this.tiltedRoot.add(rightGuide);
    this.colliderForBox(rightGuide, 0.01, TABLE.wallHeight / 2, leftLen / 2);

    // Below the flipper line, an open mouth — the ball falls free past Z_BOTTOM
    // and gets caught by Game's drain detection. No geometry needed there.
  }

  private addWall(localPos: THREE.Vector3, halfExtents: THREE.Vector3, mat: THREE.Material): void {
    const geom = new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(localPos);
    mesh.castShadow = true;
    this.tiltedRoot.add(mesh);
    this.colliderForBox(mesh, halfExtents.x, halfExtents.y, halfExtents.z);
  }

  /** Create a static cuboid collider matching the mesh's WORLD pose. */
  private colliderForBox(
    mesh: THREE.Mesh,
    hx: number,
    hy: number,
    hz: number,
    material: { friction: number; restitution: number } = Materials.wall,
  ): void {
    mesh.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    mesh.getWorldPosition(worldPos);
    mesh.getWorldQuaternion(worldQuat);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldPos.x, worldPos.y, worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
    const body = this.world.raw.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(material.friction)
      .setRestitution(material.restitution);
    this.world.raw.createCollider(colDesc, body);
  }

  private computeBallSpawn(): void {
    const localY = BALL.radius + BALL.spawnAboveLane + TABLE.thickness;
    this.localToWorld(ELEMENTS.ballSpawn.x, localY, ELEMENTS.ballSpawn.z, this.ballSpawnWorld);
  }
}
