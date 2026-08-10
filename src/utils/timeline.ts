import { TIMELINE, VIDEO_2_REVEAL_CUTOFF } from '../app/constants';
import { clamp, mapRange } from './math';

export const video1TimeForProgress = (progress: number, duration: number): number =>
  clamp(
    mapRange(progress, TIMELINE.video1Start, TIMELINE.video1End, 0, duration),
    0,
    duration,
  );

export const video2TimeForProgress = (progress: number, duration: number): number => {
  const cutoff = Math.min(duration, VIDEO_2_REVEAL_CUTOFF);
  return clamp(
    mapRange(progress, TIMELINE.video2Start, TIMELINE.video2End, 0, cutoff),
    0,
    cutoff,
  );
};

export type TimelineCue =
  | 'idle'
  | 'sequence'
  | 'disengaged'
  | 'released'
  | 'warning'
  | 'opening'
  | 'object'
  | 'origin'
  | 'stability'
  | 'failure'
  | 'final';

export const cueForProgress = (progress: number): TimelineCue => {
  if (progress >= TIMELINE.finalStart) return 'final';
  if (progress >= TIMELINE.failureStart) return 'failure';
  if (progress >= 0.93) return 'stability';
  if (progress >= 0.89) return 'origin';
  if (progress >= TIMELINE.revealStart) return 'object';
  if (progress >= TIMELINE.video2Start) return 'opening';
  if (progress >= 0.535) return 'warning';
  if (progress >= TIMELINE.warningStart) return 'released';
  if (progress >= 0.38) return 'disengaged';
  if (progress >= TIMELINE.video1Start) return 'sequence';
  return 'idle';
};
