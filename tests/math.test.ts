import { describe, expect, it } from 'vitest';
import { clamp, damp, mapRange, smoothstep } from '../src/utils/math';

describe('math helpers', () => {
  it('clamps values to bounds', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(0.4)).toBe(0.4);
  });

  it('maps and clamps a range', () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(-5, 0, 10, 0, 100)).toBe(0);
    expect(mapRange(15, 0, 10, 0, 100)).toBe(100);
  });

  it('damps without overshooting', () => {
    const value = damp(0, 1, 0.1, 1 / 60);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it('smoothsteps at its boundaries', () => {
    expect(smoothstep(0.2, 0.8, 0.2)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.8)).toBe(1);
  });
});
