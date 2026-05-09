import * as THREE from 'three';

/**
 * Inverted-hull outline. Adds a child mesh that renders the same geometry
 * as the host, scaled outward along the vertex normals, with `side: BackSide`
 * and depth writes off so the host punches through.
 *
 * This is the most reliable comic outline technique for dynamic geometry —
 * post-process OutlinePass struggles with moving meshes (jitter, halos at
 * silhouette transitions). Inverted-hull is per-mesh, no compositing cost.
 *
 * Use sparingly — adds one extra draw call per mesh. Skip on tiny props.
 */

const VERT_SHADER = /* glsl */ `
  uniform float uThickness;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Scale outward proportional to view-space distance so the outline
    // stays a near-constant pixel width across depth.
    vec3 viewNormal = normalize(normalMatrix * normal);
    mv.xyz += viewNormal * uThickness * (-mv.z * 0.012 + 0.0035);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG_SHADER = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

export interface OutlineOptions {
  /** Outline color (default: ink). */
  color?: THREE.ColorRepresentation;
  /** Multiplier on the per-vertex scale. ~1.0 is a normal comic ink line. */
  thickness?: number;
}

export function addOutline(
  host: THREE.Mesh,
  opts: OutlineOptions = {},
): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: opts.thickness ?? 1.0 },
      uColor: { value: new THREE.Color(opts.color ?? 0x0d0d12) },
    },
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    side: THREE.BackSide,
    depthWrite: true,
    transparent: false,
  });
  const outline = new THREE.Mesh(host.geometry, mat);
  // Render outlines slightly before their host so depth resolves correctly.
  outline.renderOrder = host.renderOrder - 1;
  // Same transform as host — parent it as a child so it follows automatically.
  host.add(outline);
  outline.position.set(0, 0, 0);
  outline.rotation.set(0, 0, 0);
  outline.quaternion.identity();
  outline.scale.set(1, 1, 1);
  outline.frustumCulled = host.frustumCulled;
  outline.castShadow = false;
  outline.receiveShadow = false;
  return outline;
}

/** Walk a subtree and add outlines to every mesh whose userData.outline === true. */
export function addOutlinesByTag(root: THREE.Object3D, opts: OutlineOptions = {}): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.userData['outline'] === true) {
      addOutline(obj, opts);
      obj.userData['outline'] = false; // prevent double-adding
    }
  });
}
