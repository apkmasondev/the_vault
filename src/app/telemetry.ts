import type { QualityTier } from '../webgl/quality';
import type { TimelineCue } from '../utils/timeline';

/**
 * A live snapshot of the machinery behind the sequence. The About panel reads
 * it every frame, which turns the black box into the actual exhibit.
 */
export interface Telemetry {
  progress: number;
  targetProgress: number;
  cue: TimelineCue;
  video1Target: number;
  video1Presented: number;
  video2Target: number;
  video2Presented: number;
  resolution: string;
  webglTier: QualityTier | 'fallback';
  fps: number;
  drawCalls: number;
  dpr: number;
  charge: number;
  contacts: number;
  strikes: number;
}

export type TelemetryReader = () => Readonly<Telemetry>;

export const createTelemetry = (resolution: string): Telemetry => ({
  progress: 0,
  targetProgress: 0,
  cue: 'idle',
  video1Target: 0,
  video1Presented: 0,
  video2Target: 0,
  video2Presented: 0,
  resolution,
  webglTier: 'fallback',
  fps: 0,
  drawCalls: 0,
  dpr: 1,
  charge: 0,
  contacts: 0,
  strikes: 0,
});
