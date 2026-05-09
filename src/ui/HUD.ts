import type { EventBus } from '../game/Events';
import type { Scoring } from '../game/Scoring';

/**
 * DOM HUD. Reads the score each frame (cheap), updates only when changed.
 * Listens to the event bus for mode/ball/multiplier changes.
 */
export class HUD {
  private readonly scoreEl: HTMLElement;
  private readonly modeEl: HTMLElement;
  private readonly ballEl: HTMLElement;
  private readonly multEl: HTMLElement;

  private displayedScore = 0;
  private displayedMult = 1;

  constructor(private readonly scoring: Scoring, _bus: EventBus) {
    this.scoreEl = this.el('score-value');
    this.modeEl = this.el('mode-value');
    this.ballEl = this.el('ball-value');
    this.multEl = this.el('mult-value');
  }

  setMode(mode: string): void {
    this.modeEl.textContent = mode.toUpperCase();
  }

  setBall(current: number, max: number): void {
    this.ballEl.textContent = `${current} / ${max}`;
  }

  /** Call once per render frame. Updates score with a snappy roll. */
  update(): void {
    if (this.scoring.score !== this.displayedScore) {
      // Smooth count-up so big jackpots feel rewarding.
      const diff = this.scoring.score - this.displayedScore;
      const step = Math.max(1, Math.ceil(Math.abs(diff) / 8));
      this.displayedScore += diff > 0 ? step : -step;
      if ((diff > 0) === (this.scoring.score >= this.displayedScore)) {
        this.displayedScore = this.scoring.score;
      }
      this.scoreEl.textContent = this.formatScore(this.displayedScore);
    }
    if (this.scoring.multiplier !== this.displayedMult) {
      this.displayedMult = this.scoring.multiplier;
      this.multEl.textContent = `${this.displayedMult}x`;
    }
  }

  private formatScore(n: number): string {
    return n.toLocaleString('en-US');
  }

  private el(id: string): HTMLElement {
    const e = document.getElementById(id);
    if (!e) throw new Error(`HUD element #${id} missing`);
    return e;
  }
}
