import { Pane } from 'tweakpane';
import type { Renderer } from '../render/Renderer';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Tweakpane's bundled .d.ts hides folder/binding methods inherited from
// @tweakpane/core's FolderApi. The runtime is fine; we type-cast to any
// for the API surface we actually use.
type AnyFolder = any;

/**
 * Tweakpane settings panel. Hidden by default; toggle with `T`. Exposes the
 * tunable constants we'd otherwise have to recompile to change: post-process
 * intensity, audio mute, and a "respawn ball" trigger for quick playtesting.
 *
 * Physics constants are centralized in src/physics/Materials.ts and would
 * need a "rebuild colliders" call to apply at runtime, so they're not yet
 * here — easy to add when the iteration loop demands it.
 */
export interface SettingsState {
  bloomStrength: number;
  audioMuted: boolean;
}

export class Settings {
  readonly state: SettingsState = {
    bloomStrength: 0.45,
    audioMuted: false,
  };

  private pane: Pane | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly hooks: {
      onAudioMutedChange(muted: boolean): void;
      onRespawnBall(): void;
      onForceModeStart(team: string): void;
    },
  ) {}

  toggle(): void {
    if (this.pane) {
      this.pane.dispose();
      this.pane = null;
      return;
    }
    this.build();
  }

  private build(): void {
    const pane = new Pane({ title: 'Chicago Pinball — Tuning' }) as Pane & AnyFolder;

    const post: AnyFolder = pane.addFolder({ title: 'Post-processing' });
    post.addBinding(this.state, 'bloomStrength', { min: 0, max: 2, step: 0.01 })
      .on('change', (e: { value: number }) => this.renderer.setBloomStrength(e.value));

    const audio: AnyFolder = pane.addFolder({ title: 'Audio' });
    audio.addBinding(this.state, 'audioMuted')
      .on('change', (e: { value: boolean }) => this.hooks.onAudioMutedChange(e.value));

    const debug: AnyFolder = pane.addFolder({ title: 'Debug' });
    debug.addButton({ title: 'Respawn ball' }).on('click', () => this.hooks.onRespawnBall());
    for (const team of ['bears', 'bulls', 'cubs', 'sox', 'hawks', 'fire']) {
      debug.addButton({ title: `Start ${team} mode` })
        .on('click', () => this.hooks.onForceModeStart(team));
    }

    this.pane = pane;
  }
}
