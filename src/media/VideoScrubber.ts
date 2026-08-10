import { VIDEO_FPS } from '../app/constants';
import { clamp } from '../utils/math';

const MIN_SEEK_DELTA = 0.5 / VIDEO_FPS;
const BASE_MAX_SEEK_STEP = 2.5 / VIDEO_FPS;
const MIN_SEEK_INTERVAL_MS = 1000 / 30;

export interface ScrubberMetrics {
  readonly requestedTime: number;
  readonly presentedTime: number;
  readonly targetTime: number;
  readonly seeking: boolean;
}

export class VideoScrubber {
  private requestedTime = 0;
  private presentedTime = 0;
  private targetTime = 0;
  private lastSeekAt = -Infinity;
  private seeking = false;
  private frameCallbackId: number | null = null;

  constructor(private readonly video: HTMLVideoElement) {
    this.video.addEventListener('seeked', this.handleSeeked);
    this.observePresentedFrames();
  }

  update(targetTime: number, now: number, force = false): void {
    if (this.video.readyState < HTMLMediaElement.HAVE_METADATA || !Number.isFinite(this.video.duration)) {
      return;
    }

    const safeTarget = clamp(targetTime, 0, this.video.duration);
    this.targetTime = safeTarget;
    const delta = safeTarget - this.requestedTime;

    if (!force && Math.abs(delta) < MIN_SEEK_DELTA) return;
    if (!force && now - this.lastSeekAt < MIN_SEEK_INTERVAL_MS) return;

    const absoluteDelta = Math.abs(delta);
    const maxStep =
      absoluteDelta > 0.75 ? 0.75 : absoluteDelta > 0.25 ? 0.25 : BASE_MAX_SEEK_STEP;

    if (!force && this.seeking && absoluteDelta < 0.45) return;

    this.requestedTime = force
      ? safeTarget
      : clamp(this.requestedTime + clamp(delta, -maxStep, maxStep), 0, this.video.duration);
    this.lastSeekAt = now;
    this.seeking = true;

    try {
      this.video.currentTime = this.requestedTime;
    } catch {
      this.seeking = false;
    }
  }

  reset(): void {
    this.requestedTime = 0;
    this.presentedTime = 0;
    this.targetTime = 0;
    this.seeking = false;
    this.update(0, performance.now(), true);
  }

  getMetrics(): ScrubberMetrics {
    return {
      requestedTime: this.requestedTime,
      presentedTime: this.presentedTime,
      targetTime: this.targetTime,
      seeking: this.seeking,
    };
  }

  destroy(): void {
    this.video.removeEventListener('seeked', this.handleSeeked);
    if (this.frameCallbackId !== null && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.frameCallbackId);
    }
  }

  private readonly handleSeeked = (): void => {
    this.seeking = false;
  };

  private observePresentedFrames(): void {
    if (!('requestVideoFrameCallback' in this.video)) return;

    const observe = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata): void => {
      this.presentedTime = metadata.mediaTime;
      this.frameCallbackId = this.video.requestVideoFrameCallback(observe);
    };

    this.frameCallbackId = this.video.requestVideoFrameCallback(observe);
  }
}
