import type { EventBus } from '../game/Events';

/**
 * Procedural audio bus.
 *
 * No assets ship in v1, so every sound is synthesized via the Web Audio API:
 * short oscillator-driven envelopes for "ding"/"pop"/"zing" feedback, white-
 * noise bursts for slingshots, descending arpeggios for drains. Cheap, no
 * loading, and lets us iterate without an asset pipeline.
 *
 * Browsers require user interaction before AudioContext can produce sound,
 * so we lazily create the context on the first key press.
 */

type SfxName =
  | 'bumper'
  | 'slingshot'
  | 'lane'
  | 'spinner'
  | 'drop'
  | 'bankComplete'
  | 'rampComplete'
  | 'beanHit'
  | 'sueChomp'
  | 'modeStart'
  | 'jackpot'
  | 'launch'
  | 'drain'
  | 'extraBall'
  | 'tilt';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  constructor(bus: EventBus) {
    // Wire all events to their corresponding sounds.
    bus.on('bumperHit', () => this.play('bumper'));
    bus.on('slingshotHit', () => this.play('slingshot'));
    bus.on('chicagoLaneRollover', () => this.play('lane'));
    bus.on('chicagoSpelled', () => this.play('jackpot'));
    bus.on('teamTargetHit', () => this.play('modeStart'));
    bus.on('rampComplete', () => this.play('rampComplete'));
    bus.on('spinnerRotation', (e) => {
      // Don't spam — only every 3 rotations.
      if (e.count % 3 === 0) this.play('spinner');
    });
    bus.on('dropTargetHit', () => this.play('drop'));
    bus.on('dropBankComplete', () => this.play('bankComplete'));
    bus.on('beanKick', () => this.play('beanHit'));
    bus.on('sueSwallowed', () => this.play('sueChomp'));
    bus.on('ballLaunched', () => this.play('launch'));
    bus.on('ballDrained', () => this.play('drain'));
    bus.on('extraBallAwarded', () => this.play('extraBall'));
    bus.on('tilt', () => this.play('tilt'));

    // Resume context on first interaction (browser policy).
    const resume = (): void => { void this.ensure(); };
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('pointerdown', resume, { once: true });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.6;
  }

  private async ensure(): Promise<AudioContext | null> {
    if (this.ctx) return this.ctx;
    type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : 0.6;
    gain.connect(ctx.destination);
    this.masterGain = gain;
    this.ctx = ctx;
    return ctx;
  }

  play(name: SfxName): void {
    void this.playAsync(name);
  }

  private async playAsync(name: SfxName): Promise<void> {
    const ctx = await this.ensure();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    switch (name) {
      case 'bumper': pingTone(ctx, this.masterGain, 880, 0.08, 0.4, now); break;
      case 'slingshot': noiseBurst(ctx, this.masterGain, 0.06, 0.5, now); break;
      case 'lane': pingTone(ctx, this.masterGain, 1320, 0.04, 0.25, now); break;
      case 'spinner': pingTone(ctx, this.masterGain, 1760, 0.03, 0.18, now); break;
      case 'drop': pingTone(ctx, this.masterGain, 220, 0.10, 0.4, now, 'square'); break;
      case 'bankComplete': arp(ctx, this.masterGain, [440, 660, 880, 1320], 0.06, 0.5, now); break;
      case 'rampComplete': arp(ctx, this.masterGain, [330, 440, 660], 0.08, 0.45, now); break;
      case 'beanHit': pingTone(ctx, this.masterGain, 990, 0.06, 0.35, now, 'triangle'); break;
      case 'sueChomp': noiseBurst(ctx, this.masterGain, 0.18, 0.55, now); break;
      case 'modeStart': arp(ctx, this.masterGain, [330, 415, 494, 622], 0.10, 0.45, now); break;
      case 'jackpot': arp(ctx, this.masterGain, [523, 659, 784, 1047, 1319], 0.10, 0.55, now); break;
      case 'launch': sweepTone(ctx, this.masterGain, 220, 880, 0.20, 0.5, now); break;
      case 'drain': arp(ctx, this.masterGain, [440, 330, 220, 165], 0.18, 0.5, now, 'sawtooth'); break;
      case 'extraBall': arp(ctx, this.masterGain, [659, 880, 1175, 1568], 0.09, 0.6, now); break;
      case 'tilt': sweepTone(ctx, this.masterGain, 120, 60, 0.5, 0.4, now, 'sawtooth'); break;
    }
  }
}

function pingTone(
  ctx: AudioContext,
  out: GainNode,
  freq: number,
  duration: number,
  level: number,
  startAt: number,
  shape: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = shape;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(level, startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(out);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function noiseBurst(
  ctx: AudioContext,
  out: GainNode,
  duration: number,
  level: number,
  startAt: number,
): void {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = level;
  // Lowpass for grit rather than hiss.
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 0.6;
  src.connect(filter).connect(gain).connect(out);
  src.start(startAt);
}

function sweepTone(
  ctx: AudioContext,
  out: GainNode,
  fromFreq: number,
  toFreq: number,
  duration: number,
  level: number,
  startAt: number,
  shape: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = shape;
  osc.frequency.setValueAtTime(fromFreq, startAt);
  osc.frequency.exponentialRampToValueAtTime(toFreq, startAt + duration);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(level, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(out);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function arp(
  ctx: AudioContext,
  out: GainNode,
  freqs: number[],
  noteDuration: number,
  level: number,
  startAt: number,
  shape: OscillatorType = 'triangle',
): void {
  for (let i = 0; i < freqs.length; i++) {
    const t = startAt + i * noteDuration * 0.6;
    pingTone(ctx, out, freqs[i]!, noteDuration, level, t, shape);
  }
}
