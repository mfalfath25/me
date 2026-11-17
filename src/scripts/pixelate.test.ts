import { describe, expect, it } from 'vitest';

import { mosaicSize, REST_BLOCK, RESOLVE_STEPS } from './pixelate';

describe('mosaicSize', () => {
  it('cuts a box into blocks of the given size', () => {
    expect(mosaicSize(360, 288, 12)).toEqual([30, 24]);
  });
  it('never returns an empty grid', () => {
    expect(mosaicSize(4, 4, 12)).toEqual([1, 1]);
  });
});

describe('RESOLVE_STEPS', () => {
  it('starts at the resting block and gets finer', () => {
    expect(RESOLVE_STEPS[0]).toBe(REST_BLOCK);
    for (let i = 1; i < RESOLVE_STEPS.length; i++) expect(RESOLVE_STEPS[i]).toBeLessThan(RESOLVE_STEPS[i - 1]!);
  });
});
