import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { Loop } from './Loop';
import { Input } from './Input';

/**
 * Top-level orchestrator. Owns the renderer, input, fixed-step loop,
 * and (later) the physics world, table, and game state machine.
 *
 * Chunk 1: just renders a spinning cube to verify the pipeline.
 * Subsequent chunks add physics, table elements, modes, etc.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loop: Loop;
  private readonly input: Input;

  // Placeholder spinner — removed once the playfield ships in chunk 3.
  private spinner: THREE.Mesh | null = null;

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
    this.buildScene();
    this.handleResize();
  }

  start(): void {
    this.input.attach();
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    this.input.detach();
  }

  private buildScene(): void {
    // Placeholder lighting — replaced by Lighting.ts in chunk 7.
    const key = new THREE.DirectionalLight(0xfff2c8, 1.4);
    key.position.set(2, 4, 2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
    fill.position.set(-2, 1, -1);
    this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222244, 0.4));

    // Spinning placeholder pinball — Bears orange + Chicago star vibes.
    const geom = new THREE.IcosahedronGeometry(0.4, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf96b1a,
      roughness: 0.3,
      metalness: 0.6,
      flatShading: true,
    });
    this.spinner = new THREE.Mesh(geom, mat);
    this.spinner.position.set(0, 0.5, 0);
    this.scene.add(this.spinner);

    // Floor reference grid.
    const grid = new THREE.GridHelper(6, 12, 0xffd84d, 0x1c2436);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    this.scene.add(grid);
  }

  private fixedUpdate(_dt: number): void {
    // Physics step lives here in chunk 2+. Placeholder: nothing yet.
  }

  private render(_alpha: number): void {
    if (this.spinner) {
      this.spinner.rotation.x += 0.012;
      this.spinner.rotation.y += 0.018;
    }
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
