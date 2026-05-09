/**
 * Single source of truth for the table's dimensions and the pose of every
 * element on it. All other modules read from this — never hardcode coords.
 *
 * Coordinate system (PRE-tilt, in playfield-local space):
 *   +X right, +Y up, +Z toward player (drain).
 *   So the CHICAGO lanes at z=-1.0 are at the *top* of the table,
 *   and the flippers near z=+0.78 are at the *bottom*.
 *
 * The whole playfield root is tilted -TILT_RAD around X at the scene level,
 * so gravity (world-down) naturally rolls the ball toward the drain.
 *
 * Units are meters. A real pinball is ~1.35cm radius — we use 2.7cm for
 * visual clarity at this physical scale.
 */

import * as THREE from 'three';

export const TILT_DEG = 6.5;
export const TILT_RAD = THREE.MathUtils.degToRad(TILT_DEG);

export const TABLE = {
  width: 1.10,    // X span
  depth: 2.20,    // Z span
  thickness: 0.04,
  wallHeight: 0.08,
  wallThickness: 0.04,
  drainGap: 0.32, // gap between flippers at the bottom
} as const;

export const BALL = {
  radius: 0.027,
  density: 7850,
  spawnAboveLane: 0.04,
} as const;

/** Convenience: Z of the bottom edge of the playfield (drain side). */
export const Z_BOTTOM = TABLE.depth / 2;
/** Convenience: Z of the top edge (CHICAGO lanes side). */
export const Z_TOP = -TABLE.depth / 2;
/** Convenience: X half-width. */
export const X_RIGHT = TABLE.width / 2;
export const X_LEFT = -TABLE.width / 2;

/**
 * Element positions (top-down, +Z toward player). Matches the ASCII layout
 * in the implementation plan. These are pre-tilt; they get rotated into world
 * space by the Playfield root transform.
 */
export const ELEMENTS = {
  flipperLeft: { x: -0.18, z: 0.78, restAngle: -0.45, raisedAngle: 0.55 },
  flipperRight: { x: 0.18, z: 0.78, restAngle: 0.45, raisedAngle: -0.55 },
  slingLeft: { x: -0.32, z: 0.62 },
  slingRight: { x: 0.32, z: 0.62 },
  plunger: { x: X_RIGHT - 0.06, z: 0.95 },
  ballSpawn: { x: X_RIGHT - 0.06, z: 0.85 },

  bean: { x: 0.0, z: -0.20, radius: 0.07 },

  popBumpers: [
    { x: -0.26, z: -0.85 },
    { x: -0.04, z: -0.92 },
    { x: -0.30, z: -1.02 },
  ],

  chicagoLanes: [
    // 7 letters spanning C H I C A G O across the top, just below the loop entry.
    { x: -0.42, z: -1.15, letter: 'C' },
    { x: -0.28, z: -1.15, letter: 'H' },
    { x: -0.14, z: -1.15, letter: 'I' },
    { x:  0.00, z: -1.15, letter: 'C' },
    { x:  0.14, z: -1.15, letter: 'A' },
    { x:  0.28, z: -1.15, letter: 'G' },
    { x:  0.42, z: -1.15, letter: 'O' },
  ] as const,

  teamTargets: [
    { team: 'bears',   x: -0.42, z: -0.55 },
    { team: 'bulls',   x: -0.18, z: -0.55 },
    { team: 'cubs',    x:  0.42, z: -0.55 },
    { team: 'sox',     x: -0.42, z:  0.10 },
    { team: 'hawks',   x:  0.42, z:  0.10 },
    { team: 'fire',    x:  0.40, z:  0.35 },
  ] as const,

  sueHead: { x: 0.40, z: -0.80 },
  hawksSpinner: { x: 0.30, z: 0.10 },
  soxDropTargets: [
    { x: -0.45, z: 0.05 },
    { x: -0.45, z: 0.10 },
    { x: -0.45, z: 0.15 },
    { x: -0.45, z: 0.20 },
  ],

  cubsRamp: { entryX: 0.30, entryZ: -0.45 },
  bullsLoop: { entryX: -0.28, entryZ: -0.40 },
  lTrainLoopEntry: { x: 0.45, z: -1.05 },
  lTrainLoopExit: { x: -0.30, z: 0.62 },
} as const;

export type TeamId = (typeof ELEMENTS.teamTargets)[number]['team'];

/** Chicago color palette — used by HUD, materials, callouts. */
export const COLORS = {
  ink: 0x0d0d12,
  paper: 0xf4ecd8,
  bearsOrange: 0xf96b1a,
  bearsNavy: 0x0b162a,
  bullsRed: 0xce1141,
  cubsBlue: 0x0e3386,
  soxBlack: 0x111111,
  hawksRed: 0xcf0a2c,
  fireRed: 0xaf2626,
  halo: 0xffd84d,
  field: 0x1a3a52,
  rail: 0xc7c9cc,
} as const;
