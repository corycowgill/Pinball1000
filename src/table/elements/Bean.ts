import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { Ball } from './Ball';
import { COLORS, ELEMENTS } from '../layout';
import { addOutline } from '../../render/OutlinePass';

/**
 * Cloud Gate ("the Bean"). A high-restitution chrome sphere in the center of
 * the playfield. The ball ricochets off it sharply; each contact emits
 * `beanKick` for the Fire mode jackpot and the comic callouts.
 *
 * Reflections come from a small procedural cube map generated from the
 * surrounding lights — fast, no asset loading, looks plausibly like the
 * Chicago skyline reflected in chrome (warm/cool gradient).
 */
export class Bean {
  readonly handle: number;
  private readonly mesh: THREE.Mesh;
  readonly worldPos = new THREE.Vector3();

  constructor(
    world: World,
    private readonly bus: EventBus,
    private readonly ball: Ball,
    parent: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
  ) {
    const radius = ELEMENTS.bean.radius;
    const geom = new THREE.SphereGeometry(radius, 32, 24);

    // Procedural skybox cube map — orange Bears top-front gradient,
    // cool blue Lake bottom-back. Captured into a CubeRenderTarget so the
    // material reads it as a real env-map.
    const envMap = buildSkylineEnv(renderer);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xf0f4f8,
      metalness: 1.0,
      roughness: 0.05,
      envMap,
      envMapIntensity: 1.6,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    // Position vertically so the bean sits on the playfield deck.
    this.mesh.position.set(ELEMENTS.bean.x, radius * 0.85, ELEMENTS.bean.z);
    parent.add(this.mesh);
    addOutline(this.mesh, { thickness: 1.6 });

    parent.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(this.worldPos);

    // Static collider — high restitution so the ball really pops off.
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      this.worldPos.x,
      this.worldPos.y,
      this.worldPos.z,
    );
    const body = world.raw.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.ball(radius)
      .setFriction(0.0)
      .setRestitution(0.95)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const col = world.raw.createCollider(colDesc, body);
    this.handle = col.handle;
  }

  onHit(): void {
    // Tiny extra outward kick on top of the natural restitution to make the
    // bean feel "alive" — ball never sits on it.
    const ballT = this.ball.body.translation();
    const dir = new THREE.Vector3(
      ballT.x - this.worldPos.x,
      0.05,
      ballT.z - this.worldPos.z,
    );
    if (dir.lengthSq() < 1e-5) dir.set(0, 0.05, 1);
    dir.normalize().multiplyScalar(0.012);
    this.ball.body.applyImpulse({ x: dir.x, y: dir.y, z: dir.z }, true);
    this.bus.emit({ type: 'beanKick' });
  }
}

/**
 * Build a 256-pixel cube map gradient suggestive of the Chicago skyline:
 * navy Lake horizon → orange Bears sky → halo highlight at zenith. Cheap,
 * no IO, runs once on construction.
 */
function buildSkylineEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 256;
  const scene = new THREE.Scene();
  const camera = new THREE.CubeCamera(0.1, 10, new THREE.WebGLCubeRenderTarget(size, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipMapLinearFilter,
    type: THREE.HalfFloatType,
  }));

  // Background gradient sphere (rendered from inside).
  const skyGeom = new THREE.SphereGeometry(5, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTop: { value: new THREE.Color(COLORS.bearsOrange) },
      uMid: { value: new THREE.Color(COLORS.halo) },
      uBottom: { value: new THREE.Color(COLORS.bearsNavy) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y * 0.5 + 0.5;
        vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, h));
        col = mix(col, uTop, smoothstep(0.55, 1.0, h));
        // Add a faint horizon glow.
        float horizon = 1.0 - abs(vDir.y);
        col += vec3(1.0, 0.6, 0.2) * pow(horizon, 8.0) * 0.4;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeom, skyMat));

  camera.update(renderer, scene);
  // Keep the cube target alive past this function.
  return camera.renderTarget.texture;
}
