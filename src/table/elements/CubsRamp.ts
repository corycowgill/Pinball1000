import * as THREE from 'three';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { Ball } from './Ball';
import { Ramp } from './Ramp';
import { COLORS, ELEMENTS } from '../layout';

/**
 * The Cubs Ivy Ramp — a short rising ramp on the right that arcs up to a
 * "Wrigley" target visible from the player POV. Loop completion triggers
 * `rampComplete:cubs` (used by the Cubs mode for jackpot scoring).
 */
export function buildCubsRamp(
  world: World,
  bus: EventBus,
  ball: Ball,
  parent: THREE.Object3D,
): Ramp {
  const entry = ELEMENTS.cubsRamp;

  const points = [
    new THREE.Vector3(entry.entryX, 0.04, entry.entryZ + 0.10),
    new THREE.Vector3(entry.entryX + 0.06, 0.10, entry.entryZ - 0.05),
    new THREE.Vector3(entry.entryX + 0.10, 0.14, entry.entryZ - 0.30),
    new THREE.Vector3(entry.entryX - 0.05, 0.12, entry.entryZ - 0.55),
    new THREE.Vector3(entry.entryX - 0.30, 0.05, entry.entryZ - 0.40),
  ];
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);

  return new Ramp(world, bus, ball, parent, {
    curve,
    surfaceWidth: 0.08,
    wallHeight: 0.06,
    segments: 18,
    color: COLORS.cubsBlue,
    onEntry: () => { /* light Cubs lamp */ },
    onExit: (b) => b.emit({ type: 'rampComplete', ramp: 'cubs' }),
  });
}
