import * as THREE from 'three';

/**
 * Wraps WebGLRenderer with sane defaults for cel-shading.
 * EffectComposer pipeline (bloom + halftone) is added in chunk 8.
 */
export class Renderer {
  private readonly gl: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  setSize(w: number, h: number): void {
    this.gl.setSize(w, h, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.gl.render(scene, camera);
  }

  get raw(): THREE.WebGLRenderer {
    return this.gl;
  }
}
