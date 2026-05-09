import type { EventBus } from './Events';
import type { Scoring } from './Scoring';
import type { ChicagoBonus } from './ChicagoBonus';
import type { ModeManager } from './Modes/TeamMode';
import type { SueMiniGame } from './Modes/SueMiniGame';

/**
 * High-level game flow state machine.
 *
 *   Boot -> Attract -> BallReady -> BallInPlay -> BonusCount -> BallReady
 *                                                    \-> GameOver
 *
 * BallReady displays "PLUNGE!"; the player presses Space to launch.
 * BallInPlay is the normal gameplay loop. SueMiniGame is OWNED by the mini-
 * game module; we just observe its `isActive` flag. ModeManager runs
 * orthogonally to this FSM (a team mode can be active in BallInPlay).
 */
export type GameState =
  | 'boot'
  | 'attract'
  | 'ballReady'
  | 'ballInPlay'
  | 'bonusCount'
  | 'gameOver';

export interface GameContext {
  scoring: Scoring;
  chicagoBonus: ChicagoBonus;
  modeManager: ModeManager;
  sueMiniGame: SueMiniGame;
}

export class StateMachine {
  private _state: GameState = 'boot';
  /** 1-indexed. Game over after ball 3 (or earlier if no extras). */
  ballNumber = 1;
  readonly maxBalls = 3;
  /** Set true when extra ball awarded — consumed on next drain. */
  pendingExtraBall = false;
  /** Last bonus added during a BonusCount transition (for HUD display). */
  lastBonusPoints = 0;

  constructor(
    private readonly bus: EventBus,
    private readonly ctx: GameContext,
    private readonly onStateChange: (s: GameState) => void,
  ) {
    bus.on('extraBallAwarded', () => {
      this.pendingExtraBall = true;
    });
    bus.on('ballDrained', () => this.onDrain());
    bus.on('ballLaunched', () => {
      if (this._state === 'ballReady') this.transition('ballInPlay');
    });
  }

  get state(): GameState { return this._state; }

  /** Called once at boot. Drops into attract until the player presses Enter. */
  begin(): void {
    this.transition('attract');
  }

  /** Player presses Enter from attract or game-over to start a fresh game. */
  startGame(): void {
    if (this._state !== 'attract' && this._state !== 'gameOver') return;
    this.ctx.scoring.reset();
    this.ctx.chicagoBonus.reset();
    this.ballNumber = 1;
    this.pendingExtraBall = false;
    this.transition('ballReady');
  }

  private onDrain(): void {
    if (this.ctx.sueMiniGame.isActive) return; // capture-related drain isn't a real drain
    if (this._state !== 'ballInPlay' && this._state !== 'ballReady') return;

    if (this.pendingExtraBall) {
      this.pendingExtraBall = false;
      // Award the same ball number again — no advance.
      this.transition('ballReady');
      return;
    }

    this.transition('bonusCount');
  }

  /** Called by Game once the bonus animation finishes. */
  bonusCountFinished(): void {
    if (this._state !== 'bonusCount') return;
    this.ballNumber += 1;
    if (this.ballNumber > this.maxBalls) {
      this.transition('gameOver');
    } else {
      this.transition('ballReady');
    }
  }

  /** Compute end-of-ball bonus points: lit lanes * 5000 + multiplier kicker. */
  computeBonus(): number {
    const lit = this.ctx.chicagoBonus.litLanes.filter((l) => l).length;
    const multBonus = (this.ctx.chicagoBonus.currentMultiplier - 1) * 25_000;
    const points = lit * 5_000 + multBonus;
    this.lastBonusPoints = points;
    return points;
  }

  private transition(next: GameState): void {
    this._state = next;
    this.onStateChange(next);
  }
}
