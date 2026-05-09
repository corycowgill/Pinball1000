import * as THREE from 'three';
import type { World } from './World';

/**
 * Renders Rapier's internal collider geometry as a wireframe overlay so we can
 * see exactly what the physics engine "sees". Toggle with `D`.
 */
export class PhysicsDebug {
  private readonly mesh: THREE.LineSegments;
  private enabled = false;

  constructor(scene: THREE.Scene) {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });
    this.mesh = new THREE.LineSegments(geom, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.mesh.visible = this.enabled;
    return this.enabled;
  }

  set visible(v: boolean) {
    this.enabled = v;
    this.mesh.visible = v;
  }

  update(world: World): void {
    if (!this.enabled) return;
    const buffers = world.raw.debugRender();
    this.mesh.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(buffers.vertices, 3),
    );
    this.mesh.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(buffers.colors, 4),
    );
  }
}
