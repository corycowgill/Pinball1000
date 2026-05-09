import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { Loop } from './Loop';
import { Input } from './Input';
import { World } from '../physics/World';
import { PhysicsDebug } from '../physics/Debug';
import { Playfield } from '../table/Playfield';
import { Ball } from '../table/elements/Ball';
import { TABLE, COLORS, Z_BOTTOM } from '../table/layout';

/**
 * Top-level orchestrator. Owns renderer, input, fixed-step loop, physics
 * world, the table, and (in later chunks) the game state machine.
 *
 * Chunk 3: full tilted playfield with perimeter walls and drain guides;
 * ball spawns above the plunger lane and rolls toward the drain.
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
  private playfield!: Playfield;
  private ball!: Ball;

  private drainBelowY!: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.Fog(0x05070a, 3.5, 10);

    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.05,
      40,
    );

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

    this.buildLighting();
    this.playfield = new Playfield(this.scene, this.world);
    this.ball = new Ball(this.scene, this.world, this.playfield.ballSpawnWorld);

    this.positionCamera();
    // Drain threshold: a generous margin below the playfield's lowest world Y.
    const drainProbe = new THREE.Vector3();
    this.playfield.localToWorld(0, 0, Z_BOTTOM, drainProbe);
    this.drainBelowY = drainProbe.y - 0.25;

    this.handleResize();
  }

  start(): void {
    this.input.attach();
    this.input.on((action, type) => {
      if (type !== 'down') return;
      if (action === 'debugToggle') this.debug.toggle();
      if (action === 'launch') this.ball.respawn(this.playfield.ballSpawnWorld);
    });
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    this.input.detach();
  }

  private buildLighting(): void {
    const key = new THREE.DirectionalLight(0xfff2c8, 1.6);
    key.position.set(2, 4, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 10;
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 2;
    key.shadow.camera.bottom = -2;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.55);
    fill.position.set(-2, 1, -1);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(0, 2, -3);
    this.scene.add(rim);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222244, 0.45));

    // Halo ground glow under the table — Bears orange.
    const halo = new THREE.PointLight(COLORS.bearsOrange, 1.5, 4);
    halo.position.set(0, -0.4, 0.5);
    this.scene.add(halo);
  }

  private positionCamera(): void {
    // Look down the table from the player's chest. Slight perspective so
    // the top of the playfield reads as further away.
    const fromY = TABLE.depth * 0.65;
    const fromZ = Z_BOTTOM + 0.45;
    this.camera.position.set(0, fromY, fromZ);
    this.camera.lookAt(0, 0, -TABLE.depth * 0.05);
  }

  private fixedUpdate(_dt: number): void {
    this.ball.cachePrev();
    this.world.step();

    if (this.ball.position.y < this.drainBelowY) {
      this.ball.respawn(this.playfield.ballSpawnWorld);
    }
  }

  private render(alpha: number): void {
    this.ball.syncRender(alpha);
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
