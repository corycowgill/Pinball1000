import type { EventBus } from './Events';

/**
 * Score table + multiplier ladder. Listens for hit events on the bus and
 * accumulates the score. The CHICAGO bonus chunk (chunk 6) plugs into the
 * `multiplier` getter to scale all hits.
 *
 * Pure module — no DOM, no three.js. Easy to unit-test.
 */
export const POINT_VALUES: Readonly<Record<string, number>> = {
  bumperHit: 100,
  slingshotHit: 50,
  chicagoLaneRollover: 250,
  chicagoSpelled: 5_000,
  teamTargetHit: 750,
  rampComplete: 2_500,
  spinnerRotation: 100,
  dropTargetHit: 500,
  dropBankComplete: 10_000,
  beanKick: 1_500,
  sueSwallowed: 25_000,
};

export class Scoring {
  private _score = 0;
  private _multiplier = 1;
  private _modeMultiplier = 1;

  constructor(private readonly bus: EventBus) {
    bus.on('bumperHit', () => this.add(POINT_VALUES.bumperHit ?? 0));
    bus.on('slingshotHit', () => this.add(POINT_VALUES.slingshotHit ?? 0));
    bus.on('chicagoLaneRollover', () => this.add(POINT_VALUES.chicagoLaneRollover ?? 0));
    bus.on('chicagoSpelled', (e) => {
      this._multiplier = e.multiplier;
      this.add(POINT_VALUES.chicagoSpelled ?? 0);
    });
    bus.on('teamTargetHit', () => this.add(POINT_VALUES.teamTargetHit ?? 0));
    bus.on('rampComplete', () => this.add(POINT_VALUES.rampComplete ?? 0));
    bus.on('spinnerRotation', () => this.add(POINT_VALUES.spinnerRotation ?? 0));
    bus.on('dropTargetHit', () => this.add(POINT_VALUES.dropTargetHit ?? 0));
    bus.on('dropBankComplete', () => this.add(POINT_VALUES.dropBankComplete ?? 0));
    bus.on('beanKick', () => this.add(POINT_VALUES.beanKick ?? 0));
    bus.on('sueSwallowed', () => this.add(POINT_VALUES.sueSwallowed ?? 0));
  }

  get score(): number { return this._score; }
  get multiplier(): number { return this._multiplier * this._modeMultiplier; }

  setModeMultiplier(m: number): void { this._modeMultiplier = m; }

  reset(): void {
    this._score = 0;
    this._multiplier = 1;
    this._modeMultiplier = 1;
  }

  /** Called by external hooks (e.g. multiball jackpot) to add raw points. */
  award(points: number): void { this.add(points); }

  private add(base: number): void {
    this._score += Math.round(base * this.multiplier);
  }
}
