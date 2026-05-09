import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeHalftonePass, makeVignettePass } from './HalftoneOverlay';

/**
 * WebGLRenderer + EffectComposer with the cel-shaded post stack:
 *
 *   RenderPass -> Bloom (low threshold for neon) -> Halftone overlay
 *              -> Vignette + chromatic aberration -> FXAA -> Output
 *
 * The composer is created lazily so the scene+camera don't have to exist
 * yet at construction time.
 */
export class Renderer {
  private readonly gl: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private fxaaPass: ShaderPass | null = null;
  private halftonePass: ShaderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  /** True if the renderer was constructed in mobile-tuned mode. */
  readonly isMobile: boolean;

  constructor(canvas: HTMLCanvasElement, opts: { mobile?: boolean } = {}) {
    this.isMobile = opts.mobile ?? false;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // FXAA handles AA inside the composer chain
      powerPreference: 'high-performance',
      stencil: false,
    });
    // Mobile GPUs choke on full DPR + post-processing. Cap at 1.5 on mobile,
    // 2 on desktop. This roughly halves fragment cost vs. uncapped.
    const dprCap = this.isMobile ? 1.5 : 2;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    // Shadows are expensive on mobile; disable them entirely.
    this.gl.shadowMap.enabled = !this.isMobile;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  /** Build the composer once we have a scene + camera. */
  attach(scene: THREE.Scene, camera: THREE.Camera): void {
    const composer = new EffectComposer(this.gl);
    composer.setPixelRatio(this.gl.getPixelRatio());

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Bloom — low threshold so neon (Bean, lit lanes, slingshot flash) blooms
    // but everyday surfaces don't smear. Lower strength on mobile for perf.
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.isMobile ? 0.30 : 0.45,
      this.isMobile ? 0.40 : 0.55,
      0.85,
    );
    composer.addPass(bloomPass);
    this.bloomPass = bloomPass;

    // Halftone — lighter dots and bigger cells on mobile (cheaper, still
    // reads as comic).
    const halftone = makeHalftonePass({
      strength: this.isMobile ? 0.12 : 0.18,
      dotSize: this.isMobile ? 6.0 : 4.0,
    });
    composer.addPass(halftone);
    this.halftonePass = halftone;

    // Vignette + a hint of chromatic aberration. Skip aberration on mobile —
    // it's a triple texture lookup per pixel.
    const vignette = makeVignettePass({
      intensity: 0.55,
      aberration: this.isMobile ? 0 : 0.0014,
    });
    composer.addPass(vignette);

    // FXAA only on desktop — on mobile we already cap DPR, FXAA is a tax.
    if (!this.isMobile) {
      const fxaa = new ShaderPass(FXAAShader);
      composer.addPass(fxaa);
      this.fxaaPass = fxaa;
    }

    // sRGB output / tone-map application.
    composer.addPass(new OutputPass());

    this.composer = composer;
    this.applyResolutionToPasses();
  }

  setSize(w: number, h: number): void {
    this.gl.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
      this.applyResolutionToPasses();
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer) {
      this.composer.render();
    } else {
      this.gl.render(scene, camera);
    }
  }

  setBloomStrength(s: number): void {
    if (this.bloomPass) this.bloomPass.strength = s;
  }

  get raw(): THREE.WebGLRenderer {
    return this.gl;
  }

  private applyResolutionToPasses(): void {
    const w = this.gl.domElement.width;
    const h = this.gl.domElement.height;
    const pr = this.gl.getPixelRatio();
    if (this.fxaaPass) {
      const u = this.fxaaPass.material.uniforms['resolution'];
      if (u && 'value' in u) (u.value as THREE.Vector2).set(1 / (w / pr), 1 / (h / pr));
    }
    if (this.halftonePass) {
      const u = this.halftonePass.material.uniforms['uResolution'];
      if (u && 'value' in u) (u.value as THREE.Vector2).set(w / pr, h / pr);
    }
  }
}
