/**
 * Fixed-timestep accumulator.
 *
 * Pinball physics is unstable at variable timestep — fast balls tunnel through
 * thin walls, flippers feel mushy, restitution stacks unpredictably. We run
 * physics at a fixed 240Hz (4ms) and interpolate render transforms each RAF.
 *
 * Pattern from Glenn Fiedler "Fix Your Timestep!".
 */
export interface LoopOptions {
  fixedStep: number; // seconds per physics step
  maxSubSteps: number; // ceiling on catch-up steps to avoid spiral-of-death
  onFixedStep: (dt: number) => void;
  onRender: (alpha: number) => void;
}

export class Loop {
  private readonly opts: LoopOptions;
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;

  constructor(opts: LoopOptions) {
    this.opts = opts;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (): void => {
    if (!this.running) return;
    const now = performance.now() / 1000;
    let frameTime = now - this.lastTime;
    this.lastTime = now;

    // Cap frame time so a stalled tab doesn't trigger hundreds of physics steps.
    if (frameTime > 0.25) frameTime = 0.25;

    this.accumulator += frameTime;

    let steps = 0;
    while (this.accumulator >= this.opts.fixedStep && steps < this.opts.maxSubSteps) {
      this.opts.onFixedStep(this.opts.fixedStep);
      this.accumulator -= this.opts.fixedStep;
      steps += 1;
    }

    if (steps === this.opts.maxSubSteps) {
      // We hit the cap — drop residual accumulator to prevent spiral-of-death.
      this.accumulator = 0;
    }

    const alpha = this.accumulator / this.opts.fixedStep;
    this.opts.onRender(alpha);

    this.rafId = requestAnimationFrame(this.frame);
  };
}
