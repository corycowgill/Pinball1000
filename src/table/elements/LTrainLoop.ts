import * as THREE from 'three';
import type { World } from '../../physics/World';
import type { EventBus } from '../../game/Events';
import type { Ball } from './Ball';
import { Ramp } from './Ramp';
import { COLORS, ELEMENTS, X_LEFT, X_RIGHT, Z_TOP } from '../layout';

/**
 * The CTA Loop — an elevated rail running counter-clockwise around the top
 * half of the playfield. The ball enters at top-right (above the Sue head),
 * arcs over the CHICAGO lanes, comes down the left side, and dumps out
 * above the left flipper.
 *
 * Built as a Ramp with a hand-tuned CatmullRomCurve3. Tube radius is sized
 * just larger than the ball, giving it a snug rail feel.
 */
export function buildLTrainLoop(
  world: World,
  bus: EventBus,
  ball: Ball,
  parent: THREE.Object3D,
): Ramp {
  const entry = ELEMENTS.lTrainLoopEntry;
  const exit = ELEMENTS.lTrainLoopExit;

  // Hand-tuned waypoints. Y rises as the rail climbs above the playfield,
  // peaks at the top arc, then descends back near the deck at the exit.
  const railHigh = 0.18;
  const railMid = 0.13;
  const railLow = 0.08;

  const points: THREE.Vector3[] = [
    new THREE.Vector3(entry.x, 0.05, entry.z),
    new THREE.Vector3(X_RIGHT - 0.04, railLow, entry.z + 0.05),
    new THREE.Vector3(X_RIGHT - 0.02, railMid, Z_TOP + 0.20),
    new THREE.Vector3(X_RIGHT * 0.7, railHigh, Z_TOP - 0.02),
    new THREE.Vector3(0.0, railHigh + 0.02, Z_TOP - 0.06),
    new THREE.Vector3(X_LEFT * 0.7, railHigh, Z_TOP - 0.02),
    new THREE.Vector3(X_LEFT + 0.02, railMid, Z_TOP + 0.20),
    new THREE.Vector3(X_LEFT + 0.04, railLow, exit.z - 0.20),
    new THREE.Vector3(exit.x, 0.05, exit.z),
  ];

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);

  return new Ramp(world, bus, ball, parent, {
    curve,
    surfaceWidth: 0.07,
    wallHeight: 0.06,
    segments: 36,
    color: COLORS.bearsNavy,
    railColor: COLORS.halo,
    onEntry: () => { /* could light a "loop entered" lamp */ },
    onExit: (b) => b.emit({ type: 'rampComplete', ramp: 'lTrain' }),
  });
}
