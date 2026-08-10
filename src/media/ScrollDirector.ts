import { clamp } from '../utils/math';

/** Fraction of the run spent accelerating, and the same again decelerating. */
const RAMP = 0.12;

/**
 * Distance covered by a trapezoidal velocity profile at normalised time `t`.
 * A constant middle speed reads as a deliberate camera move, while the linear
 * ramps keep the start and the stop from snapping.
 */
const traverse = (t: number): number => {
  const peak = 1 / (1 - RAMP);
  if (t < RAMP) return (peak * t * t) / (2 * RAMP);
  if (t > 1 - RAMP) return 1 - (peak * (1 - t) * (1 - t)) / (2 * RAMP);
  return peak * (RAMP / 2 + (t - RAMP));
};

/**
 * Drives the window scroll position for the hands-off cinematic pass. Visitors
 * who never realise the sequence is scroll-driven still get to see all of it.
 */
export class ScrollDirector {
  private running = false;
  private startY = 0;
  private endY = 0;
  private startedAt = 0;
  private durationMs = 1;

  get isRunning(): boolean {
    return this.running;
  }

  /** `fullDurationMs` covers the whole timeline; a partial run is scaled to it. */
  start(fromY: number, toY: number, fullDurationMs: number, now: number): void {
    const span = Math.abs(toY - fromY);
    if (span < 1) return;
    this.startY = fromY;
    this.endY = toY;
    this.startedAt = now;
    this.durationMs = Math.max(1_200, (span / Math.max(1, toY)) * fullDurationMs);
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  /** Returns the scroll offset to apply this frame, or null when idle. */
  step(now: number): number | null {
    if (!this.running) return null;
    const t = clamp((now - this.startedAt) / this.durationMs);
    const y = this.startY + (this.endY - this.startY) * traverse(t);
    if (t >= 1) this.running = false;
    return y;
  }
}
