import * as THREE from 'three';
import type { EventBus } from '../game/Events';

/**
 * Comic-book speech-bubble popups. When something cool happens, a "BAM!"
 * floats up and out at the screen-projected position of the impact.
 *
 * Lightweight DOM nodes — no canvas overhead, browser handles the CSS
 * animation defined in styles.css.
 */
const PHRASES = {
  bumperHit: ['BAM!', 'POW!', 'WHAM!', 'BIFF!'],
  slingshotHit: ['ZAP!', 'KICK!'],
  chicagoLaneRollover: ['ROLL!'],
  chicagoSpelled: ['CHICAGO!', 'WIND-Y CITY!'],
  teamTargetHit: ['DA BEARS!', 'BULLS!', 'CUBS WIN!', 'GO SOX!', 'HAWKS!', 'FIRE!'],
  rampComplete: ['LOOP!', 'COMBO!'],
  spinnerRotation: ['SPIN!'],
  dropTargetHit: ['CLACK!'],
  dropBankComplete: ['SLAM!'],
  beanKick: ['BEAN BOUNCE!', 'CLOUD GATE!'],
  sueSwallowed: ['CHOMP!', 'GULP!'],
  ballDrained: ['DRAIN!'],
  extraBallAwarded: ['EXTRA BALL!'],
  tilt: ['TILT!'],
} as const;

interface WorldHit { worldX: number; worldY: number; worldZ: number }

export class ComicCallouts {
  private readonly host: HTMLElement;
  private readonly project = new THREE.Vector3();

  constructor(
    bus: EventBus,
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const host = document.getElementById('callouts');
    if (!host) throw new Error('#callouts host missing');
    this.host = host;

    bus.on('bumperHit', (e) => this.popAtWorld(this.pick('bumperHit'), e));
    bus.on('slingshotHit', (e) => this.popAtWorld(this.pick('slingshotHit'), e));
    bus.on('chicagoSpelled', () => this.popCenter(this.pick('chicagoSpelled')));
    bus.on('teamTargetHit', (e) => {
      const idx = ['bears', 'bulls', 'cubs', 'sox', 'hawks', 'fire'].indexOf(e.team);
      const phrase = PHRASES.teamTargetHit[idx] ?? 'GO!';
      this.popCenter(phrase);
    });
    bus.on('beanKick', () => this.popCenter(this.pick('beanKick')));
    bus.on('sueSwallowed', () => this.popCenter(this.pick('sueSwallowed')));
    bus.on('ballDrained', () => this.popCenter(this.pick('ballDrained')));
    bus.on('extraBallAwarded', () => this.popCenter(this.pick('extraBallAwarded')));
    bus.on('tilt', () => this.popCenter(this.pick('tilt')));
  }

  private pick(key: keyof typeof PHRASES): string {
    const arr = PHRASES[key];
    return arr[Math.floor(Math.random() * arr.length)] ?? '!';
  }

  private popAtWorld(text: string, hit: WorldHit): void {
    this.project.set(hit.worldX, hit.worldY, hit.worldZ).project(this.camera);
    const x = (this.project.x * 0.5 + 0.5) * this.canvas.clientWidth;
    const y = (-this.project.y * 0.5 + 0.5) * this.canvas.clientHeight;
    this.spawn(text, x, y);
  }

  private popCenter(text: string): void {
    this.spawn(text, this.canvas.clientWidth / 2, this.canvas.clientHeight * 0.4);
  }

  private spawn(text: string, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'callout';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--rot', `${(Math.random() - 0.5) * 18}deg`);
    this.host.appendChild(el);
    // Keep DOM small — animation is 900ms, drop after 1100ms.
    window.setTimeout(() => el.remove(), 1100);
  }
}
