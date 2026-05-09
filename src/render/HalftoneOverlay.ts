import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Comic-book halftone overlay. Adds a screen-space dot pattern whose density
 * is modulated by the inverse of luminance — shadows pick up the dot
 * pattern, highlights stay clean. Subtle by default so it reads as
 * comic-book texture without becoming optical illusion.
 */
export function makeHalftonePass(opts: { strength?: number; dotSize?: number } = {}): ShaderPass {
  const strength = opts.strength ?? 0.18;
  const dotSize = opts.dotSize ?? 4.0;

  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uStrength: { value: strength },
      uDotSize: { value: dotSize },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uStrength;
      uniform float uDotSize;
      uniform vec2 uResolution;
      varying vec2 vUv;

      float luma(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        // Sample-grid in screen pixels.
        vec2 grid = (vUv * uResolution) / uDotSize;
        vec2 cell = fract(grid) - 0.5;
        // Dot radius scales with darkness — dark areas grow bigger dots.
        float L = luma(src.rgb);
        float darkness = 1.0 - L;
        float r = darkness * 0.55;
        float d = length(cell);
        float dot = smoothstep(r, r - 0.12, d);
        // Pure black dot, blended in proportional to strength (and to darkness
        // so highlights stay clean).
        float mix_amount = uStrength * darkness;
        vec3 outColor = mix(src.rgb, src.rgb * (1.0 - dot * 0.7), mix_amount);
        gl_FragColor = vec4(outColor, src.a);
      }
    `,
  });
}

/**
 * Vignette + tiny chromatic aberration — comic-poster polish.
 */
export function makeVignettePass(opts: { intensity?: number; aberration?: number } = {}): ShaderPass {
  const intensity = opts.intensity ?? 0.5;
  const aberration = opts.aberration ?? 0.0018;

  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uIntensity: { value: intensity },
      uAberration: { value: aberration },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uIntensity;
      uniform float uAberration;
      varying vec2 vUv;

      void main() {
        vec2 dir = vUv - 0.5;
        float r = texture2D(tDiffuse, vUv + dir * uAberration).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv - dir * uAberration).b;
        vec3 col = vec3(r, g, b);

        float dist = length(dir);
        float vignette = smoothstep(0.85, 0.35, dist);
        col *= mix(1.0, vignette, uIntensity);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
