/**
 * Keyboard input map. Edge-triggered (down/up) for plunger and tilt;
 * level-held for flippers (so the motor stays driven while held).
 */
export type InputAction =
  | 'flipperLeft'
  | 'flipperRight'
  | 'plunger'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeUp'
  | 'launch'
  | 'cameraToggle'
  | 'debugToggle'
  | 'tweakToggle';

const KEY_MAP: Readonly<Record<string, InputAction>> = {
  ShiftLeft: 'flipperLeft',
  ShiftRight: 'flipperRight',
  KeyZ: 'flipperLeft',
  Slash: 'flipperRight',
  Space: 'plunger',
  Enter: 'launch',
  ArrowLeft: 'nudgeLeft',
  ArrowRight: 'nudgeRight',
  ArrowUp: 'nudgeUp',
  KeyC: 'cameraToggle',
  KeyD: 'debugToggle',
  KeyT: 'tweakToggle',
};

type Listener = (action: InputAction, type: 'down' | 'up') => void;

export class Input {
  private readonly held = new Set<InputAction>();
  private readonly listeners = new Set<Listener>();
  private attached = false;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.held.clear();
  }

  isHeld(action: InputAction): boolean {
    return this.held.has(action);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (e.repeat) return;
    e.preventDefault();
    this.held.add(action);
    for (const l of this.listeners) l(action, 'down');
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.held.delete(action);
    for (const l of this.listeners) l(action, 'up');
  };

  private readonly handleBlur = (): void => {
    // Release everything if the window loses focus, otherwise flippers get stuck up.
    for (const action of this.held) {
      for (const l of this.listeners) l(action, 'up');
    }
    this.held.clear();
  };
}
