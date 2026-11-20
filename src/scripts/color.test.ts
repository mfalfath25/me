import { describe, expect, it } from 'vitest';

import { percentileRange } from './color';

describe('percentileRange', () => {
  it('returns [0, 1] for an empty array', () => {
    expect(percentileRange(new Float32Array(0))).toEqual([0, 1]);
  });

  it('finds low and high percentiles without sorting', () => {
    const values = new Float32Array(100);
    for (let i = 0; i < 100; i++) values[i] = i / 99;
    const [lo, hi] = percentileRange(values, 0.02, 0.98);
    expect(lo).toBeGreaterThanOrEqual(0.01);
    expect(lo).toBeLessThanOrEqual(0.04);
    expect(hi).toBeGreaterThanOrEqual(0.96);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it('handles uniform values', () => {
    const values = new Float32Array(50).fill(0.5);
    const [lo, hi] = percentileRange(values, 0.02, 0.98);
    expect(lo).toBeCloseTo(0.5, 2);
    expect(hi).toBeCloseTo(0.5, 2);
  });
});
