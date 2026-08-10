import { CHAPTERS, TIMELINE, VIDEO_2_REVEAL_CUTOFF } from '../app/constants';
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
  | 'collapse'
  | 'final';

/** Highest threshold first; the first entry the progress reaches wins. */
const CUE_THRESHOLDS: readonly (readonly [number, TimelineCue])[] = [
  [TIMELINE.finalStart, 'final'],
  [TIMELINE.collapseStart, 'collapse'],
  [TIMELINE.failureStart, 'failure'],
  [TIMELINE.stabilityStart, 'stability'],
  [TIMELINE.originStart, 'origin'],
  [TIMELINE.revealStart, 'object'],
  [TIMELINE.video2Start, 'opening'],
  [TIMELINE.doNotOpenStart, 'warning'],
  [TIMELINE.warningStart, 'released'],
  [TIMELINE.disengagedStart, 'disengaged'],
  [TIMELINE.video1Start, 'sequence'],
];

export const cueForProgress = (progress: number): TimelineCue => {
  for (const [threshold, cue] of CUE_THRESHOLDS) {
    if (progress >= threshold) return cue;
  }
  return 'idle';
};

/** The last chapter the sequence has reached, for the navigation rail. */
export const chapterIdForProgress = (progress: number): string => {
  let active = CHAPTERS[0]!.id;
  for (const chapter of CHAPTERS) {
    if (progress >= chapter.progress) active = chapter.id;
  }
  return active;
};
