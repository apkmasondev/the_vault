import { describe, expect, it } from 'vitest';
import { HoldGesture } from '../src/interaction/holdGesture';

const VIEWPORT = { width: 1000, height: 800 };

/** Walks the pointer in a straight line at a fixed sample rate. */
const sweep = (
  gesture: HoldGesture,
  { fromX, toX, y = 0, samples, msPerSample }: {
    fromX: number; toX: number; y?: number; samples: number; msPerSample: number;
  },
): void => {
  const stepX = (toX - fromX) / samples;
  for (let index = 1; index <= samples; index += 1) {
    gesture.move(fromX + stepX * index, y, index * msPerSample, VIEWPORT);
  }
};

describe('HoldGesture', () => {
  it('ignores movement before it has begun', () => {
    const gesture = new HoldGesture();
    expect(gesture.active).toBe(false);
    const result = gesture.move(100, 100, 16, VIEWPORT);
    expect(result).toEqual({ dragging: false, becameDrag: false, deltaX: 0 });
  });

  it('treats a still hold as a hold, however long it lasts', () => {
    const gesture = new HoldGesture();
    gesture.begin(500, 400, 0);
    for (let index = 1; index <= 60; index += 1) {
      const result = gesture.move(500, 400, index * 16, VIEWPORT);
      expect(result.dragging).toBe(false);
    }
    expect(gesture.end().dragging).toBe(false);
  });

  it('tolerates a small tremor without becoming a drag', () => {
    const gesture = new HoldGesture();
    gesture.begin(500, 400, 0);
    // Well inside the threshold, and back again.
    gesture.move(505, 403, 16, VIEWPORT);
    gesture.move(497, 398, 32, VIEWPORT);
    expect(gesture.isDragging).toBe(false);
  });

  it('becomes a drag once past the threshold, and says so only once', () => {
    const gesture = new HoldGesture();
    gesture.begin(500, 400, 0);
    expect(gesture.move(506, 400, 16, VIEWPORT).becameDrag).toBe(false);
    expect(gesture.move(520, 400, 32, VIEWPORT).becameDrag).toBe(true);
    expect(gesture.move(540, 400, 48, VIEWPORT).becameDrag).toBe(false);
    expect(gesture.isDragging).toBe(true);
  });

  it('measures the threshold diagonally, not per axis', () => {
    const gesture = new HoldGesture();
    gesture.begin(0, 0, 0);
    // Eight in each direction is under the threshold on either axis alone,
    // but over eleven pixels of actual travel.
    expect(gesture.move(8, 8, 16, VIEWPORT).becameDrag).toBe(true);
  });

  it('reports horizontal travel between samples', () => {
    const gesture = new HoldGesture();
    gesture.begin(100, 100, 0);
    expect(gesture.move(140, 100, 16, VIEWPORT).deltaX).toBe(40);
    expect(gesture.move(120, 100, 32, VIEWPORT).deltaX).toBe(-20);
  });

  it('takes the throw from hand speed, so a fast flick beats a slow drag', () => {
    const slow = new HoldGesture();
    slow.begin(200, 400, 0);
    sweep(slow, { fromX: 200, toX: 700, y: 400, samples: 25, msPerSample: 40 });

    const fast = new HoldGesture();
    fast.begin(200, 400, 0);
    sweep(fast, { fromX: 200, toX: 700, y: 400, samples: 5, msPerSample: 16 });

    const slowThrow = slow.end().throwX;
    const fastThrow = fast.end().throwX;
    expect(slowThrow).toBeGreaterThan(0);
    expect(fastThrow).toBeGreaterThan(slowThrow * 3);
  });

  it('signs the throw by direction on both axes', () => {
    const gesture = new HoldGesture();
    gesture.begin(500, 400, 0);
    sweep(gesture, { fromX: 500, toX: 200, y: 400, samples: 5, msPerSample: 16 });
    expect(gesture.end().throwX).toBeLessThan(0);

    const vertical = new HoldGesture();
    vertical.begin(500, 400, 0);
    for (let index = 1; index <= 5; index += 1) {
      vertical.move(500, 400 - index * 40, index * 16, VIEWPORT);
    }
    expect(vertical.end().throwY).toBeLessThan(0);
  });

  it('does not let one jittery sample register as a throw', () => {
    const gesture = new HoldGesture();
    gesture.begin(500, 400, 0);
    // Still, then a single large jump, then still again.
    for (let index = 1; index <= 6; index += 1) gesture.move(500, 400, index * 16, VIEWPORT);
    gesture.move(700, 400, 7 * 16, VIEWPORT);
    for (let index = 8; index <= 12; index += 1) gesture.move(700, 400, index * 16, VIEWPORT);

    const smoothed = gesture.end().throwX;
    // A sustained flick of the same span reaches far higher.
    const sustained = new HoldGesture();
    sustained.begin(500, 400, 0);
    sweep(sustained, { fromX: 500, toX: 700, y: 400, samples: 5, msPerSample: 16 });
    expect(smoothed).toBeLessThan(sustained.end().throwX);
  });

  it('clamps the sample interval so a stalled frame is not a throw', () => {
    const gesture = new HoldGesture();
    gesture.begin(0, 400, 0);
    // One sample after a two second stall: without clamping this divides by a
    // tiny elapsed figure and reports an enormous speed.
    gesture.move(40, 400, 2_000, VIEWPORT);
    expect(Math.abs(gesture.end().throwX)).toBeLessThan(1);
  });

  it('forgets everything on release, so the next gesture starts clean', () => {
    const gesture = new HoldGesture();
    gesture.begin(200, 400, 0);
    sweep(gesture, { fromX: 200, toX: 700, y: 400, samples: 5, msPerSample: 16 });
    expect(gesture.end().throwX).toBeGreaterThan(0);

    expect(gesture.active).toBe(false);
    gesture.begin(500, 400, 0);
    expect(gesture.isDragging).toBe(false);
    const second = gesture.end();
    expect(second.throwX).toBe(0);
    expect(second.dragging).toBe(false);
  });
});
