import type { EventBus } from './Events';

/**
 * CHICAGO lane spell logic and the multiplier ladder.
 *
 * Listens for `chicagoLaneRollover` (one per lane crossed) and lights that
 * letter. When all 7 letters are lit, emits `chicagoSpelled` carrying the
 * next multiplier on the ladder, then resets the lit set.
 *
 * Multiplier ladder: 1x -> 2x -> 3x -> 5x -> 10x (capped).
 */
const LADDER: readonly number[] = [1, 2, 3, 5, 10];

export class ChicagoBonus {
  private lit: boolean[] = [false, false, false, false, false, false, false];
  private level = 0; // index into LADDER

  /** Listeners poll this each frame to render lit/unlit lane lights. */
  get litLanes(): readonly boolean[] { return this.lit; }
  get currentMultiplier(): number { return LADDER[this.level] ?? 1; }

  constructor(private readonly bus: EventBus) {
    bus.on('chicagoLaneRollover', (e) => this.markLit(e.index));
    bus.on('ballDrained', () => this.onBallDrained());
  }

  reset(): void {
    this.lit = this.lit.map(() => false);
    this.level = 0;
  }

  private markLit(index: number): void {
    if (index < 0 || index >= this.lit.length) return;
    if (this.lit[index]) return; // already lit; rollover still scores via Scoring
    this.lit[index] = true;
    if (this.lit.every((l) => l)) {
      // Advance the ladder, but cap at the top tier.
      this.level = Math.min(this.level + 1, LADDER.length - 1);
      this.lit = this.lit.map(() => false);
      this.bus.emit({
        type: 'chicagoSpelled',
        level: this.level,
        multiplier: LADDER[this.level] ?? 1,
      });
    }
  }

  private onBallDrained(): void {
    // Lit letters carry over between balls, but the multiplier doesn't decay
    // mid-game — pinball convention. (Reset at game-over only.)
  }
}
