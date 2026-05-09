import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Renderer } from '../render/Renderer';
import { Loop } from './Loop';
import { Input } from './Input';
import { World } from '../physics/World';
import { PhysicsDebug } from '../physics/Debug';
import { Materials } from '../physics/Materials';

/**
 * Top-level orchestrator. Owns the renderer, input, fixed-step loop,
 * physics world, and (later) the table and game state machine.
 *
 * Chunk 2: ball drops onto a tilted plane. Verifies Rapier integration,
 * fixed-step timing, mesh-body sync, and the debug overlay.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loop: Loop;
  private readonly input: Input;

  private world!: World;
  private debug!: PhysicsDebug;

  private ballBody: RAPIER.RigidBody | null = null;
  private ballMesh: THREE.Mesh | null = null;
  private prevBallPos = new THREE.Vector3();
  private currBallPos = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b162a);
    this.scene.fog = new THREE.Fog(0x0b162a, 4, 14);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.05,
      50,
    );
    this.camera.position.set(0, 1.4, 2.6);
    this.camera.lookAt(0, 0.4, 0);

    this.input = new Input();
    this.loop = new Loop({
      fixedStep: 1 / 240,
      maxSubSteps: 8,
      onFixedStep: (dt) => this.fixedUpdate(dt),
      onRender: (alpha) => this.render(alpha),
    });

    window.addEventListener('resize', () => this.handleResize());
  }

  async init(): Promise<void> {
    await World.init();
    this.world = new World();
    this.debug = new PhysicsDebug(this.scene);
    this.buildScene();
    this.handleResize();
  }

  start(): void {
    this.input.attach();
    this.input.on((action, type) => {
      if (type !== 'down') return;
      if (action === 'debugToggle') this.debug.toggle();
      if (action === 'launch') this.respawnBall();
    });
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    this.input.detach();
  }

  private buildScene(): void {
    // Lighting (placeholder).
    const key = new THREE.DirectionalLight(0xfff2c8, 1.4);
    key.position.set(2, 4, 2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
    fill.position.set(-2, 1, -1);
    this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222244, 0.4));

    // Tilted "playfield" — temporary green slab. Real table arrives in chunk 3.
    const tilt = THREE.MathUtils.degToRad(6.5);
    const fieldGeom = new THREE.BoxGeometry(1.2, 0.04, 2.0);
    const fieldMat = new THREE.MeshStandardMaterial({
      color: 0x1d4f2a,
      roughness: 0.85,
      metalness: 0.05,
    });
    const fieldMesh = new THREE.Mesh(fieldGeom, fieldMat);
    fieldMesh.rotation.x = -tilt;
    fieldMesh.position.set(0, 0, 0);
    this.scene.add(fieldMesh);

    // Static collider matching the playfield slab.
    const fieldBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 0, 0)
      .setRotation({ x: Math.sin(-tilt / 2), y: 0, z: 0, w: Math.cos(-tilt / 2) });
    const fieldBody = this.world.raw.createRigidBody(fieldBodyDesc);
    const fieldColDesc = RAPIER.ColliderDesc.cuboid(0.6, 0.02, 1.0)
      .setFriction(Materials.playfield.friction)
      .setRestitution(Materials.playfield.restitution);
    this.world.raw.createCollider(fieldColDesc, fieldBody);

    // Drain catcher — invisible static below the playfield's low edge.
    const catcherDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1.5, 0);
    const catcherBody = this.world.raw.createRigidBody(catcherDesc);
    this.world.raw.createCollider(
      RAPIER.ColliderDesc.cuboid(3, 0.05, 3),
      catcherBody,
    );

    // The ball.
    this.spawnBall();
  }

  private spawnBall(): void {
    const radius = 0.027; // slightly larger than real for visibility at this scale
    const startY = 0.6;
    const startZ = -0.7;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, startY, startZ)
      .setLinearDamping(Materials.ball.linearDamping)
      .setAngularDamping(Materials.ball.angularDamping)
      .setCcdEnabled(true);
    const body = this.world.raw.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.ball(radius)
      .setDensity(Materials.ball.density)
      .setFriction(Materials.ball.friction)
      .setRestitution(Materials.ball.restitution);
    this.world.raw.createCollider(colDesc, body);
    this.ballBody = body;

    // Mesh — chrome-ish steel pinball.
    const geom = new THREE.SphereGeometry(radius, 24, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe6ecf2,
      roughness: 0.18,
      metalness: 0.92,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.ballMesh = mesh;

    this.prevBallPos.set(0, startY, startZ);
    this.currBallPos.copy(this.prevBallPos);
  }

  private respawnBall(): void {
    if (!this.ballBody) return;
    this.ballBody.setTranslation({ x: 0, y: 0.6, z: -0.7 }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  private fixedUpdate(_dt: number): void {
    if (!this.world || !this.ballBody) return;

    // Track previous position for render interpolation.
    const t = this.ballBody.translation();
    this.prevBallPos.copy(this.currBallPos);
    this.currBallPos.set(t.x, t.y, t.z);

    this.world.step();

    // Drain detection: if the ball falls below the catcher, respawn.
    if (this.currBallPos.y < -1.0) {
      this.respawnBall();
      const r = this.ballBody.translation();
      this.prevBallPos.set(r.x, r.y, r.z);
      this.currBallPos.copy(this.prevBallPos);
    }
  }

  private render(alpha: number): void {
    if (this.ballMesh && this.ballBody) {
      // Interpolate render position between the last two physics steps.
      this.ballMesh.position.lerpVectors(this.prevBallPos, this.currBallPos, alpha);
      const r = this.ballBody.rotation();
      this.ballMesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    this.debug.update(this.world);
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
