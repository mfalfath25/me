import { describe, expect, it } from 'vitest';

import { createWeather, parseWeatherParam } from './weather';

/** A fixed sequence of rolls, repeating. */
const rolls = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('parseWeatherParam', () => {
  it('runs free without the parameter', () => {
    expect(parseWeatherParam(null)).toBeNull();
  });

  it('reads any mix, and clear as all off', () => {
    expect(parseWeatherParam('Rain, autumn')).toEqual({ rain: true, wind: false, autumn: true });
    expect(parseWeatherParam('clear')).toEqual({ rain: false, wind: false, autumn: false });
  });
});

describe('createWeather', () => {
  it('holds forced weather fixed', () => {
    const weather = createWeather(rolls(0), { rain: true, wind: false, autumn: true });
    for (let s = 0; s < 600; s++) weather.update(1);
    expect(weather.rain).toBe(1);
    expect(weather.wind).toBe(0);
    expect(weather.autumn).toBe(true);
  });

  it('builds a spell up gradually', () => {
    // Rolls high at load (dry, still, not autumn), then low at every roll (start).
    let first = 4;
    const rand = () => (first-- > 0 ? 0.99 : 0);
    const weather = createWeather(rand);
    expect(weather.autumn).toBe(false);
    expect(weather.rain).toBe(0);
    // The first roll lands about 70s in (30s plus a 0.99 share of 40s).
    for (let s = 0; s < 75; s++) weather.update(1);
    expect(weather.rain).toBeGreaterThan(0);
    expect(weather.rain).toBeLessThan(1);
    // Before the next roll (30s after the start) it is all but full.
    for (let s = 0; s < 24; s++) weather.update(1);
    expect(weather.rain).toBeGreaterThan(0.99);
  });
});
