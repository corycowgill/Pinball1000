import type { EventBus, GameEvent, GameEventType } from '../Events';
import type { Scoring } from '../Scoring';
import type { TeamId } from '../../table/layout';

/**
 * Per-team mode definition. Each mode runs for a fixed duration when
 * activated by hitting the team's standup target. While active:
 *   - score multiplier is bumped (modeMultiplier on Scoring)
 *   - "jackpot" event triggers a big score
 *   - mode-specific scoring rules apply via the onEvent hook
 *
 * Modes are intentionally lightweight — most of the visual flair (HUD
 * banner, callouts, music) flows through the EventBus.
 */
export interface ModeConfig {
  team: TeamId;
  durationMs: number;
  modeMultiplier: number;
  banner: string;
  jackpotPoints: number;
  /** Which event(s) count as "jackpot shots" for this mode. */
  jackpotEvent: GameEventType;
  /** Optional event predicate for nuanced jackpot logic. */
  jackpotPredicate?: (e: GameEvent) => boolean;
}

export const TEAM_MODES: Readonly<Record<TeamId, ModeConfig>> = {
  bears: {
    team: 'bears',
    durationMs: 30_000,
    modeMultiplier: 2,
    banner: 'GOAL-LINE STAND',
    jackpotPoints: 250_000,
    jackpotEvent: 'dropBankComplete',
  },
  bulls: {
    team: 'bulls',
    durationMs: 30_000,
    modeMultiplier: 2,
    banner: 'THREE-PEAT',
    jackpotPoints: 300_000,
    jackpotEvent: 'rampComplete',
    jackpotPredicate: (e) => e.type === 'rampComplete' && e.ramp === 'lTrain',
  },
  cubs: {
    team: 'cubs',
    durationMs: 30_000,
    modeMultiplier: 2,
    banner: 'WRIGLEY!',
    jackpotPoints: 400_000,
    jackpotEvent: 'rampComplete',
    jackpotPredicate: (e) => e.type === 'rampComplete' && e.ramp === 'cubs',
  },
  sox: {
    team: 'sox',
    durationMs: 30_000,
    modeMultiplier: 3,
    banner: 'SOUTH SIDE SLAM',
    jackpotPoints: 350_000,
    jackpotEvent: 'dropBankComplete',
  },
  hawks: {
    team: 'hawks',
    durationMs: 30_000,
    modeMultiplier: 2,
    banner: 'HAT TRICK',
    jackpotPoints: 300_000,
    jackpotEvent: 'spinnerRotation',
    jackpotPredicate: (e) => e.type === 'spinnerRotation' && e.count > 0 && e.count % 5 === 0,
  },
  fire: {
    team: 'fire',
    durationMs: 30_000,
    modeMultiplier: 2,
    banner: 'OPEN THE GOAL',
    jackpotPoints: 250_000,
    jackpotEvent: 'beanKick',
  },
};

/**
 * ModeManager owns the active mode (if any), runs the timer, applies the
 * multiplier, listens for jackpot events, and emits modeTimeout via the bus.
 *
 * (Only one mode active at a time in v1; chaining can come later.)
 */
export class ModeManager {
  private active: ModeConfig | null = null;
  private startedAt = 0;

  constructor(
    private readonly bus: EventBus,
    private readonly scoring: Scoring,
  ) {
    bus.on('teamTargetHit', (e) => this.maybeStart(e.team));
    // Wire jackpot detection — listen for ANY event that could be a jackpot.
    const allJackpotEvents: GameEventType[] = [
      'dropBankComplete', 'rampComplete', 'spinnerRotation', 'beanKick',
    ];
    for (const t of allJackpotEvents) {
      bus.on(t, (e) => this.onPossibleJackpot(e));
    }
  }

  get activeMode(): ModeConfig | null { return this.active; }
  get remainingMs(): number {
    return this.active ? Math.max(0, this.active.durationMs - (performance.now() - this.startedAt)) : 0;
  }

  /** Call each render frame. Triggers timeout when a mode expires. */
  update(): void {
    if (!this.active) return;
    if (this.remainingMs <= 0) this.end();
  }

  private maybeStart(team: TeamId): void {
    if (this.active) return; // ignore re-hits while a mode runs
    const cfg = TEAM_MODES[team];
    this.active = cfg;
    this.startedAt = performance.now();
    this.scoring.setModeMultiplier(cfg.modeMultiplier);
  }

  private end(): void {
    if (!this.active) return;
    this.active = null;
    this.scoring.setModeMultiplier(1);
    // Bonus count + extra ball awards land in chunk 15 (BonusCount state).
  }

  private onPossibleJackpot(e: GameEvent): void {
    if (!this.active) return;
    if (e.type !== this.active.jackpotEvent) return;
    if (this.active.jackpotPredicate && !this.active.jackpotPredicate(e)) return;
    this.scoring.award(this.active.jackpotPoints);
  }
}
