import { describe, expect, it } from 'vitest';
import { CHAPTERS, TIMELINE, VIDEO_2_REVEAL_CUTOFF } from '../src/app/constants';
import {
  chapterIdForProgress,
  cueForProgress,
  video1TimeForProgress,
  video2TimeForProgress,
} from '../src/utils/timeline';

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

  it('covers the whole range with cues in ascending order', () => {
    expect(cueForProgress(0)).toBe('idle');
    expect(cueForProgress(1)).toBe('final');
    for (let progress = 0; progress <= 1; progress += 0.001) {
      expect(cueForProgress(progress)).toBeTypeOf('string');
    }
  });
});

describe('timeline budget', () => {
  it('keeps the phase boundaries in ascending order', () => {
    const ordered = [
      TIMELINE.introEnd,
      TIMELINE.disengagedStart,
      TIMELINE.video1End,
      TIMELINE.doNotOpenStart,
      TIMELINE.video2Start,
      TIMELINE.video2End,
      TIMELINE.originStart,
      TIMELINE.stabilityStart,
      TIMELINE.revealEnd,
      TIMELINE.failureStart,
      TIMELINE.collapseStart,
      TIMELINE.finalStart,
    ];
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]!).toBeGreaterThan(ordered[index - 1]!);
    }
    expect(TIMELINE.finalStart).toBeLessThan(1);
  });

  it('gives the containment failure room to play out', () => {
    // It is the climax; it was once a tenth the length of the unlock film.
    const failure = TIMELINE.finalStart - TIMELINE.failureStart;
    const object = TIMELINE.failureStart - TIMELINE.revealStart;
    expect(failure).toBeGreaterThan(0.1);
    expect(failure).toBeGreaterThan(object * 0.75);
  });
});

describe('chapter navigation', () => {
  it('keeps chapters ordered and inside the timeline', () => {
    let previous = -1;
    for (const chapter of CHAPTERS) {
      expect(chapter.progress).toBeGreaterThan(previous);
      expect(chapter.progress).toBeLessThanOrEqual(1);
      previous = chapter.progress;
    }
  });

  it('reports the last chapter the sequence has reached', () => {
    expect(chapterIdForProgress(0)).toBe(CHAPTERS[0]!.id);
    expect(chapterIdForProgress(1)).toBe(CHAPTERS[CHAPTERS.length - 1]!.id);
    for (const chapter of CHAPTERS) {
      expect(chapterIdForProgress(chapter.progress)).toBe(chapter.id);
    }
  });
});
