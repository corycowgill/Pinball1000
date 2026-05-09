import * as THREE from 'three';

/**
 * Comic-book cel-shaded material.
 *
 * Built on MeshToonMaterial (which already gives us flat-banded shading via
 * a gradient ramp texture), then patched with `onBeforeCompile` to add a
 * Fresnel rim term that pushes silhouettes toward white — the "ink edge"
 * lighting that makes cel-shading pop.
 *
 * Cheaper than rolling a custom ShaderMaterial because we inherit Three.js's
 * shadowing, fog, and tonemapping for free.
 */

let SHARED_RAMP: THREE.DataTexture | null = null;

/** 3-band toon ramp: shadow, midtone, light. */
function buildToonRamp(): THREE.DataTexture {
  if (SHARED_RAMP) return SHARED_RAMP;
  // 4 pixels: hard breaks at 25% / 50% / 80%.
  const data = new Uint8Array([
    36, 32, 48, 255,    // deep shadow
    96, 92, 110, 255,   // mid-shadow
    198, 196, 200, 255, // mid-light
    255, 255, 255, 255, // highlight
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  SHARED_RAMP = tex;
  return tex;
}

export interface CelMaterialOptions {
  color: THREE.ColorRepresentation;
  /** Fresnel rim color (default: white). */
  rimColor?: THREE.ColorRepresentation;
  /** 0..1 — strength of the rim. */
  rimStrength?: number;
  /** Higher = thinner rim band (sharper edge). 1..6. */
  rimPower?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

export function makeCelMaterial(opts: CelMaterialOptions): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color,
    gradientMap: buildToonRamp(),
    emissive: opts.emissive ?? 0x000000,
  });
  mat.emissiveIntensity = opts.emissiveIntensity ?? 0;

  const uRimColor = { value: new THREE.Color(opts.rimColor ?? 0xffffff) };
  const uRimStrength = { value: opts.rimStrength ?? 0.45 };
  const uRimPower = { value: opts.rimPower ?? 2.5 };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uRimColor;
    shader.uniforms.uRimStrength = uRimStrength;
    shader.uniforms.uRimPower = uRimPower;

    // Pass view-space normal + position to the fragment shader.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vCelViewNormal;
       varying vec3 vCelViewPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
       vCelViewNormal = normalize(normalMatrix * normal);
       vCelViewPos = -mvPosition.xyz;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vCelViewNormal;
       varying vec3 vCelViewPos;
       uniform vec3 uRimColor;
       uniform float uRimStrength;
       uniform float uRimPower;`,
    );
    // Add the rim as an emissive-style boost right before the final tonemap.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `vec3 viewDir = normalize(vCelViewPos);
       float fresnel = 1.0 - max(dot(viewDir, normalize(vCelViewNormal)), 0.0);
       float rim = pow(fresnel, uRimPower) * uRimStrength;
       outgoingLight += uRimColor * rim;
       #include <opaque_fragment>`,
    );
  };

  // Ensure shaders recompile if onBeforeCompile changes (none here, but
  // marking userData lets Three.js cache them per-material).
  mat.customProgramCacheKey = () => 'celMaterial:v1';
  return mat;
}
