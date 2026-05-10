/**
 * Friction / restitution presets used across the table.
 *
 * Real pinballs have tightly-tuned bounce characteristics — the ball is hard
 * steel (~0.85 restitution off rubber), but ramps are wood/plastic (low
 * restitution). These values are the starting point; Tweakpane will expose
 * them in chunk 17.
 */
export const Materials = {
  ball: {
    // Tuned to ~80g actual mass at our 0.027m visual radius:
    //   m = density * (4/3)*pi*r^3 = 1000 * 8.24e-5 = 0.082 kg
    // Steel density (7850) at this radius gives 0.65kg, ~8x a real pinball,
    // which made flippers/bumpers/plunger feel completely dead.
    density: 1000,
    friction: 0.05,
    restitution: 0.25,
    linearDamping: 0.12,
    angularDamping: 0.4,
  },
  playfield: {
    friction: 0.28,
    restitution: 0.12,
  },
  wall: {
    friction: 0.05,
    restitution: 0.5,
  },
  bumper: {
    friction: 0.0,
    restitution: 0.92,
  },
  rubber: {
    friction: 0.05,
    restitution: 0.85,
  },
  flipper: {
    friction: 0.06,
    restitution: 0.05,
  },
  ramp: {
    friction: 0.18,
    restitution: 0.05,
  },
} as const;

/** Collision groups for filtering. Bits 0-15 = membership, 16-31 = mask. */
export const Groups = {
  BALL: makeGroup(0b1, 0xffff),
  PLAYFIELD: makeGroup(0b10, 0xffff),
  FLIPPER: makeGroup(0b100, 0xffff),
  WALL: makeGroup(0b1000, 0xffff),
  BUMPER: makeGroup(0b10000, 0xffff),
  SENSOR: makeGroup(0b100000, 0b1), // sensors only see balls
  RAMP: makeGroup(0b1000000, 0xffff),
} as const;

function makeGroup(membership: number, filter: number): number {
  return (membership << 16) | (filter & 0xffff);
}
