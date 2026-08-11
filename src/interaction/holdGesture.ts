/** Travel, in pixels, that turns a hold into a drag. */
const DRAG_THRESHOLD_PX = 10;
/** Longest gap between samples that still counts toward hand speed. */
const MAX_SAMPLE_SECONDS = 0.12;
const MIN_SAMPLE_SECONDS = 0.008;
/** Weight given to the newest sample when smoothing hand speed. */
const SPEED_SMOOTHING = 0.55;

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface MoveResult {
  /** True once this gesture has been classified as a drag. */
  readonly dragging: boolean;
  /** True only on the sample that reclassified it, so callers can react once. */
  readonly becameDrag: boolean;
  /** Horizontal travel since the previous sample, in pixels. */
  readonly deltaX: number;
}

export interface ReleaseResult {
  readonly dragging: boolean;
  /** Hand speed at release, in normalised screen widths per second. */
  readonly throwX: number;
  readonly throwY: number;
}

/**
 * The pointer gesture over the object, kept apart from what it drives.
 *
 * Holding still and dragging are different intents and have to be told apart,
 * and a throw has to be measured from the speed of the hand rather than from
 * where the object ended up — dragging into a wall pins it there with nothing
 * left to give. That is all arithmetic, so it lives here where it can be
 * tested without a renderer, a pointer or a browser.
 */
export class HoldGesture {
  private started = false;
  private dragging = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastAt = 0;
  private speedX = 0;
  private speedY = 0;

  get active(): boolean {
    return this.started;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  begin(x: number, y: number, at: number): void {
    this.started = true;
    this.dragging = false;
    this.startX = x;
    this.startY = y;
    this.lastX = x;
    this.lastY = y;
    this.lastAt = at;
    this.speedX = 0;
    this.speedY = 0;
  }

  move(x: number, y: number, at: number, viewport: Viewport): MoveResult {
    if (!this.started) return { dragging: false, becameDrag: false, deltaX: 0 };

    const deltaX = x - this.lastX;
    const elapsed = Math.min(MAX_SAMPLE_SECONDS, Math.max(MIN_SAMPLE_SECONDS, (at - this.lastAt) / 1000));
    const sampleX = ((x - this.lastX) / viewport.width) * 2 / elapsed;
    const sampleY = ((y - this.lastY) / viewport.height) * 2 / elapsed;
    this.speedX = this.speedX * (1 - SPEED_SMOOTHING) + sampleX * SPEED_SMOOTHING;
    this.speedY = this.speedY * (1 - SPEED_SMOOTHING) + sampleY * SPEED_SMOOTHING;

    this.lastX = x;
    this.lastY = y;
    this.lastAt = at;

    const travelled = Math.hypot(x - this.startX, y - this.startY);
    const becameDrag = !this.dragging && travelled > DRAG_THRESHOLD_PX;
    if (becameDrag) this.dragging = true;

    return { dragging: this.dragging, becameDrag, deltaX };
  }

  end(): ReleaseResult {
    const result: ReleaseResult = {
      dragging: this.dragging,
      throwX: this.speedX,
      throwY: this.speedY,
    };
    this.started = false;
    this.dragging = false;
    this.speedX = 0;
    this.speedY = 0;
    return result;
  }
}
