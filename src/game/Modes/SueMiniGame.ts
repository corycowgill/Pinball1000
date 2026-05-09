import * as THREE from 'three';
import type { EventBus } from '../Events';
import type { Scoring } from '../Scoring';
import type { SueHead } from '../../table/elements/SueHead';
import type { Ball } from '../../table/elements/Ball';
import type { Playfield } from '../../table/Playfield';

/**
 * "Feeding Frenzy" mini-game.
 *
 * Triggered when Sue swallows the ball. The ball is held in her throat
 * (body disabled), the camera focuses on Sue, and a HUD overlay appears
 * with five "bone" buttons for the player to break by tapping
 * Space/LeftShift/RightShift/Z/Slash. Each break = 250k. All five
 * = 2,000,000 + extra-ball cue. After 20 seconds OR all 5 broken,
 * Sue spits the ball back into the playfield via a high-arc impulse.
 *
 * Self-contained — owns its own DOM and timer. No physics during the
 * mini-game (the main world keeps stepping but the ball is disabled).
 */

const DURATION_MS = 20_000;
const BONE_POINTS = 250_000;
const ALL_BONES_BONUS = 2_000_000;

export class SueMiniGame {
  private active = false;
  private bonesLeft = 5;
  private bones: HTMLElement[] = [];
  private timerEl: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private startedAt = 0;
  private timerHandle: number | null = null;
  private extraBallEarned = false;

  constructor(
    private readonly bus: EventBus,
    private readonly scoring: Scoring,
    private readonly sue: SueHead,
    private readonly ball: Ball,
    private readonly playfield: Playfield,
  ) {
    bus.on('sueSwallowed', () => this.start());
  }

  /** True while the mini-game is running. The state machine and ModeManager
   *  can pause normal gameplay accordingly. */
  get isActive(): boolean { return this.active; }

  private start(): void {
    if (this.active) return;
    this.active = true;
    this.bonesLeft = 5;
    this.extraBallEarned = false;
    this.startedAt = performance.now();
    this.buildOverlay();
    this.bindKeys();
    this.timerHandle = window.setInterval(() => this.tickTimer(), 100);
  }

  private buildOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'sue-overlay';
    const isTouch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    const tapHint = isTouch ? 'Tap the bones!' : 'Smash bones — Space / Shift / Z / /';
    overlay.innerHTML = `
      <div id="sue-title">FEEDING FRENZY!</div>
      <div id="sue-subtitle">${tapHint}</div>
      <div id="sue-bones"></div>
      <div id="sue-timer">20.0</div>
    `;
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(11, 22, 42, 0.55)',
      zIndex: '20',
      color: 'var(--halo)',
      fontFamily: 'inherit',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);

    document.getElementById('app')?.appendChild(overlay);
    this.overlay = overlay;

    const title = overlay.querySelector('#sue-title') as HTMLElement;
    Object.assign(title.style, {
      fontSize: '54px',
      letterSpacing: '0.16em',
      WebkitTextStroke: '4px var(--ink)',
      textShadow: '6px 6px 0 var(--ink)',
      animation: 'pulse 800ms ease-in-out infinite',
    } as Partial<CSSStyleDeclaration>);

    const sub = overlay.querySelector('#sue-subtitle') as HTMLElement;
    Object.assign(sub.style, {
      fontSize: '20px',
      opacity: '0.9',
      marginTop: '8px',
      marginBottom: '24px',
      color: 'var(--paper)',
    } as Partial<CSSStyleDeclaration>);

    const bonesHost = overlay.querySelector('#sue-bones') as HTMLElement;
    Object.assign(bonesHost.style, {
      display: 'flex',
      gap: '20px',
    } as Partial<CSSStyleDeclaration>);

    for (let i = 0; i < 5; i++) {
      const bone = document.createElement('div');
      bone.className = 'sue-bone';
      bone.textContent = '🦴';
      Object.assign(bone.style, {
        fontSize: '64px',
        textShadow: '4px 4px 0 var(--ink)',
        transition: 'transform 200ms ease-out, opacity 200ms ease-out',
        // Bones are tappable on touch — needs pointer-events to override
        // the parent overlay's `none`.
        pointerEvents: 'auto',
        cursor: 'pointer',
        padding: '8px 12px',
        touchAction: 'none',
      } as Partial<CSSStyleDeclaration>);
      bone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.breakBone();
      });
      bonesHost.appendChild(bone);
      this.bones.push(bone);
    }

    this.timerEl = overlay.querySelector('#sue-timer') as HTMLElement;
    Object.assign(this.timerEl.style, {
      marginTop: '24px',
      fontSize: '36px',
      color: 'var(--bears-orange)',
      textShadow: '4px 4px 0 var(--ink)',
    } as Partial<CSSStyleDeclaration>);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', this.onKey, { capture: true });
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (!['Space', 'ShiftLeft', 'ShiftRight', 'KeyZ', 'Slash'].includes(e.code)) return;
    if (e.repeat) return;
    e.preventDefault();
    e.stopPropagation();
    this.breakBone();
  };

  private breakBone(): void {
    const idx = 5 - this.bonesLeft;
    const bone = this.bones[idx];
    if (!bone) return;
    bone.style.transform = 'scale(1.6) rotate(40deg)';
    bone.style.opacity = '0';
    this.bonesLeft -= 1;
    this.scoring.award(BONE_POINTS);
    if (this.bonesLeft <= 0) {
      this.scoring.award(ALL_BONES_BONUS);
      this.extraBallEarned = true;
      this.bus.emit({ type: 'extraBallAwarded' });
      // Slight delay so the player sees the fanfare before returning.
      window.setTimeout(() => this.end(), 800);
    }
  }

  private tickTimer(): void {
    if (!this.active || !this.timerEl) return;
    const remaining = Math.max(0, DURATION_MS - (performance.now() - this.startedAt));
    this.timerEl.textContent = (remaining / 1000).toFixed(1);
    if (remaining <= 0) this.end();
  }

  private end(): void {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this.onKey, { capture: true } as EventListenerOptions);
    if (this.timerHandle != null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.overlay) {
      this.overlay.style.transition = 'opacity 400ms ease-out';
      this.overlay.style.opacity = '0';
      setTimeout(() => this.overlay?.remove(), 450);
      this.overlay = null;
    }
    this.bones = [];

    // Spit the ball back toward the L-train loop entry — high arc, modest
    // forward impulse so it lands somewhere fun.
    const targetWorld = new THREE.Vector3();
    this.playfield.localToWorld(0.0, 0.20, -0.40, targetWorld);
    const direction = targetWorld.sub(this.sue.worldPos).normalize();
    direction.y = Math.max(direction.y, 0.4); // minimum upward arc
    direction.normalize();
    this.sue.release(direction, 0.32);

    if (!this.extraBallEarned) {
      // Mute consolation: emit a generic "ball back in play" cue.
      this.bus.emit({ type: 'ballLaunched' });
    }
  }
}
