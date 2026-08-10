import { describe, expect, it } from 'vitest';
import { TIMELINE, VIDEO_2_REVEAL_CUTOFF } from '../src/app/constants';
import { cueForProgress, video1TimeForProgress, video2TimeForProgress } from '../src/utils/timeline';

describe('timeline video mapping', () => {
  it('maps the first video boundaries exactly', () => {
    expect(video1TimeForProgress(TIMELINE.video1Start, 10)).toBe(0);
    expect(video1TimeForProgress(TIMELINE.video1End, 10)).toBe(10);
  });

  it('clamps progress outside the first video range', () => {
    expect(video1TimeForProgress(-1, 10)).toBe(0);
    expect(video1TimeForProgress(2, 10)).toBe(10);
  });

  it('stops the second video at the selected reveal frame', () => {
    expect(video2TimeForProgress(TIMELINE.video2End, 10)).toBeCloseTo(VIDEO_2_REVEAL_CUTOFF);
    expect(video2TimeForProgress(1, 7)).toBe(7);
  });

  it('selects deterministic cues at timeline boundaries', () => {
    expect(cueForProgress(TIMELINE.video1Start)).toBe('sequence');
    expect(cueForProgress(TIMELINE.warningStart)).toBe('released');
    expect(cueForProgress(TIMELINE.failureStart)).toBe('failure');
    expect(cueForProgress(TIMELINE.finalStart)).toBe('final');
  });
});
