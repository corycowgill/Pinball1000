import type { Input, InputAction } from '../core/Input';

/**
 * Touch overlay for phones / tablets.
 *
 * Each visible button is a Pointer Events target that translates
 * pointerdown/up into the same `InputAction` events keyboard fires —
 * so flippers, plunger, nudges, and start/launch all work identically.
 *
 * Why Pointer Events (not touchstart/end)?
 *   - Single API for touch + mouse + Apple Pencil.
 *   - `pointercapture` keeps tracking even if the finger drifts off the
 *     button while held (you'd lose touchend on iOS otherwise).
 *   - `e.preventDefault()` on pointerdown blocks Safari's 300ms tap delay
 *     and synthetic mouse events.
 *
 * iOS Safari specifics handled here:
 *   - `touchstart`/`touchmove` listeners with `passive: false` so we can
 *     preventDefault and stop the page from rubber-banding.
 *   - Multi-touch: each pointer gets its own tracked button (left + right
 *     flippers can be held simultaneously).
 */

interface ButtonConfig {
  id: string;
  action: InputAction | null;
  /** If non-null, fires action both on down and on up (toggle behaviour). */
  momentary: boolean;
  /** If true, only fires down event (not held; e.g. nudge). */
  oneShot?: boolean;
}

const BUTTONS: ButtonConfig[] = [
  { id: 'touch-flipper-left',  action: 'flipperLeft',  momentary: true },
  { id: 'touch-flipper-right', action: 'flipperRight', momentary: true },
  { id: 'touch-plunger',       action: 'plunger',      momentary: true },
  { id: 'touch-launch',        action: 'launch',       momentary: false, oneShot: true },
  { id: 'touch-nudge-left',    action: 'nudgeLeft',    momentary: false, oneShot: true },
  { id: 'touch-nudge-right',   action: 'nudgeRight',   momentary: false, oneShot: true },
];

export function isTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    // Safari on macOS reports coarse pointer when in iPad sim mode.
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}

export function setupTouchControls(input: Input): void {
  const overlay = document.getElementById('touch-controls');
  if (!overlay) return;
  overlay.removeAttribute('hidden');
  document.body.dataset['touch'] = '1';

  // Prevent Safari pinch-zoom and double-tap-zoom anywhere on the canvas
  // and overlay. `gesturestart` is a Safari-specific event for pinch.
  const blockGesture = (e: Event): void => { e.preventDefault(); };
  document.addEventListener('gesturestart', blockGesture);
  document.addEventListener('gesturechange', blockGesture);
  document.addEventListener('gestureend', blockGesture);
  // Block double-tap zoom on iOS (rare but happens on rapid taps).
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 350 && e.cancelable) e.preventDefault();
    lastTap = now;
  }, { passive: false });

  for (const cfg of BUTTONS) {
    const el = document.getElementById(cfg.id);
    if (!el) continue;
    wireButton(el, cfg, input);
  }

  showStartButton(true);
}

/** Toggles visibility of the on-screen START button (e.g. hidden mid-play). */
export function showStartButton(visible: boolean): void {
  if (visible) document.body.dataset['showStart'] = '1';
  else delete document.body.dataset['showStart'];
}

function wireButton(el: HTMLElement, cfg: ButtonConfig, input: Input): void {
  const onDown = (e: PointerEvent): void => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-pressed');
    if (cfg.action) {
      input.dispatch(cfg.action, 'down');
      if (cfg.oneShot) {
        // Release immediately for one-shot actions so they aren't "held".
        input.dispatch(cfg.action, 'up');
      }
    }
  };

  const onUp = (e: PointerEvent): void => {
    el.releasePointerCapture?.(e.pointerId);
    el.classList.remove('is-pressed');
    if (cfg.action && cfg.momentary && !cfg.oneShot) {
      input.dispatch(cfg.action, 'up');
    }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', (e) => {
    // Only release on leave if we don't still own the capture.
    if (!el.hasPointerCapture?.(e.pointerId)) onUp(e);
  });

  // Stop the canvas from receiving these touches.
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}
