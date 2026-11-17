import { describe, expect, it } from 'vitest';

import { createWildlife, parseWildlifeParam } from './wildlife';

describe('parseWildlifeParam', () => {
  it('reads birds and rabbits among the weather', () => {
    expect(parseWildlifeParam('rain, birds')).toEqual({ birdsSoon: true, rabbitsSoon: false });
    expect(parseWildlifeParam(null)).toEqual({ birdsSoon: false, rabbitsSoon: false });
  });
});

describe('createWildlife', () => {
  it('sends birds and a rabbit soon when asked, and lets them leave the page', () => {
    const life = createWildlife(() => 0.5, { birdsSoon: true, rabbitsSoon: true });
    for (let s = 0; s < 30; s++) life.update(1 / 30, 1440, 900, 1, 0);
    expect(life.flocks).toBe(1);
    expect(life.rabbits).toBe(1);
    // The flock is across within half a minute, before the next is due (38.5s in).
    for (let s = 0; s < 30 * 29; s++) life.update(1 / 30, 1440, 900, 1, 0);
    expect(life.flocks).toBe(0);
    // The rabbit, hopping and sitting, is across before the next is due (50.8s in).
    for (let s = 0; s < 30 * 17; s++) life.update(1 / 30, 1440, 900, 1, 0);
    expect(life.rabbits).toBe(0);
  });

  it('sends none on its own when switched off', () => {
    const life = createWildlife(() => 0.5, { enabled: false });
    for (let s = 0; s < 30 * 120; s++) life.update(1 / 30, 1440, 900, 1, 0);
    expect(life.flocks + life.rabbits).toBe(0);
  });

  it('draws without throwing', () => {
    const life = createWildlife(() => 0.3, { birdsSoon: true, rabbitsSoon: true });
    for (let s = 0; s < 40; s++) life.update(1 / 30, 800, 600, 1, 0.2);
    let marks = 0;
    life.draw({ stroke: () => marks++, tri: () => marks++ }, 598);
    expect(marks).toBeGreaterThan(0);
  });
});
