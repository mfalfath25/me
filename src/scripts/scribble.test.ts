import { describe, expect, it } from 'vitest';

import { scribble, scribbleBox } from './scribble';

/** A seeded stand-in for Math.random, so a run is repeatable. */
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe('scribble', () => {
  it('draws the box first, then one to three arrows of shaft and head', () => {
    for (let s = 1; s < 40; s++) {
      const strokes = scribble(320, 120, seeded(s));
      expect(strokes[0]!.at).toBe(0);
      const arrows = (strokes.length - 1) / 2;
      expect([1, 2, 3]).toContain(arrows);
      // Each arrow starts after the box is under way and after the arrow before; its head lands after its shaft.
      for (let i = 1; i < strokes.length; i += 2) {
        expect(strokes[i]!.at).toBeGreaterThan(i > 1 ? strokes[i - 2]!.at : 0);
        expect(strokes[i + 1]!.at).toBeGreaterThan(strokes[i]!.at);
      }
    }
  });
  it('deals a different mark each time', () => {
    const rand = seeded(7);
    expect(scribbleBox(320, 120, rand)).not.toBe(scribbleBox(320, 120, rand));
  });
  it('writes only finite numbers', () => {
    for (let s = 1; s < 40; s++) {
      for (const { d } of scribble(320, 120, seeded(s))) expect(d).not.toMatch(/NaN|Infinity/);
    }
  });
});
