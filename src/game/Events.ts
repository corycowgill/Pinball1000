/**
 * Tiny typed event bus shared by physics elements (which emit "I was hit"
 * events) and game systems (Scoring, HUD, ComicCallouts, Announcer).
 *
 * Physics elements stay decoupled from scoring rules — they just publish
 * what happened. Scoring decides how many points and which multipliers.
 */

import type { TeamId } from '../table/layout';

export type GameEvent =
  | { type: 'bumperHit'; id: string; worldX: number; worldY: number; worldZ: number }
  | { type: 'slingshotHit'; id: 'left' | 'right'; worldX: number; worldY: number; worldZ: number }
  | { type: 'chicagoLaneRollover'; index: number; letter: string }
  | { type: 'chicagoSpelled'; level: number; multiplier: number }
  | { type: 'teamTargetHit'; team: TeamId }
  | { type: 'rampComplete'; ramp: 'cubs' | 'lTrain' | 'bulls' }
  | { type: 'spinnerRotation'; count: number }
  | { type: 'dropTargetHit'; index: number }
  | { type: 'dropBankComplete' }
  | { type: 'beanKick' }
  | { type: 'sueSwallowed' }
  | { type: 'ballDrained' }
  | { type: 'ballLaunched' }
  | { type: 'extraBallAwarded' }
  | { type: 'tilt' };

export type GameEventType = GameEvent['type'];
export type GameEventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;

type AnyListener = (e: GameEvent) => void;
type Listener<T extends GameEventType> = (e: GameEventOf<T>) => void;

export class EventBus {
  private listeners: Partial<Record<GameEventType, AnyListener[]>> = {};

  on<T extends GameEventType>(type: T, listener: Listener<T>): () => void {
    const arr: AnyListener[] = (this.listeners[type] ??= [] as AnyListener[]);
    arr.push(listener as AnyListener);
    return () => {
      const i = arr.indexOf(listener as AnyListener);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  emit<T extends GameEventType>(event: GameEventOf<T>): void {
    const arr = this.listeners[event.type];
    if (!arr) return;
    for (const l of arr) l(event);
  }
}
