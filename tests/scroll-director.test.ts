import { describe, expect, it } from 'vitest';
import { ScrollDirector } from '../src/media/ScrollDirector';

describe('ScrollDirector', () => {
  it('is idle until started', () => {
    const director = new ScrollDirector();
    expect(director.isRunning).toBe(false);
    expect(director.step(0)).toBeNull();
  });

  it('ignores a run with nothing to traverse', () => {
    const director = new ScrollDirector();
    director.start(500, 500, 60_000, 0);
    expect(director.isRunning).toBe(false);
  });

  it('starts and finishes exactly on its endpoints', () => {
    const director = new ScrollDirector();
    director.start(0, 1_000, 10_000, 0);
    expect(director.step(0)).toBe(0);
    expect(director.step(10_000)).toBeCloseTo(1_000);
    expect(director.isRunning).toBe(false);
  });

  it('advances monotonically and never overshoots', () => {
    const director = new ScrollDirector();
    director.start(0, 1_000, 10_000, 0);
    let previous = -1;
    for (let time = 0; time <= 10_000; time += 100) {
      const y = director.step(time) ?? 1_000;
      expect(y).toBeGreaterThanOrEqual(previous);
      expect(y).toBeLessThanOrEqual(1_000);
      previous = y;
    }
  });

  it('eases in and out rather than moving at a constant rate throughout', () => {
    const director = new ScrollDirector();
    director.start(0, 1_000, 10_000, 0);
    const early = director.step(500)!;
    const middle = director.step(5_000)!;
    const late = director.step(9_500)!;
    // The soft start covers less ground than a linear run would.
    expect(early).toBeLessThan(50);
    expect(middle).toBeCloseTo(500, 0);
    expect(late).toBeGreaterThan(950);
  });

  it('scales a partial run against the full timeline duration', () => {
    const director = new ScrollDirector();
    director.start(500, 1_000, 10_000, 0);
    // Half the distance remains, so it should complete in about half the time.
    expect(director.step(5_000)).toBeCloseTo(1_000);
    expect(director.isRunning).toBe(false);
  });

  it('stops on demand', () => {
    const director = new ScrollDirector();
    director.start(0, 1_000, 10_000, 0);
    director.stop();
    expect(director.isRunning).toBe(false);
    expect(director.step(1_000)).toBeNull();
  });

  it('enforces a floor on the duration of very short runs', () => {
    const director = new ScrollDirector();
    director.start(0, 5, 60_000, 0);
    expect(director.step(600)).toBeLessThan(5);
  });
});
