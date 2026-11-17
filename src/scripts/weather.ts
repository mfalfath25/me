/**
 * The Weather over the bamboo: what it is doing, never how it is drawn (that is bamboo-field.ts).
 *
 * The season is set once per page load: some loads are autumn, when leaves can fall. Rain and
 * wind come and go in spells: every half minute or so each one rolls to start or stop, and its
 * level eases between 0 and 1 over a few seconds, so a shower builds and clears rather than
 * switching on.
 *
 * `?weather=rain,wind,autumn` (any mix, or `clear`) holds the weather fixed, for checking a look.
 */

export interface ForcedWeather {
  rain: boolean;
  wind: boolean;
  autumn: boolean;
}

/** Odds that a load is autumn. */
export const AUTUMN_ODDS = 0.4;

interface SpellRules {
  /** Odds it is already on when the page loads. */
  atLoad: number;
  /** Odds it starts, at each roll while off. */
  start: number;
  /** Odds it stops, at each roll while on. */
  stop: number;
  /** Seconds between rolls: min and spread. */
  every: [number, number];
  /** Seconds for the level to ease most of the way to its target. */
  ease: number;
}

const RAIN: SpellRules = { atLoad: 0.3, start: 0.3, stop: 0.5, every: [30, 40], ease: 5 };
const WIND: SpellRules = { atLoad: 0.3, start: 0.35, stop: 0.55, every: [20, 35], ease: 3.5 };

/** Reads `?weather=`; null when it is absent, so the weather runs free. */
export function parseWeatherParam(value: string | null): ForcedWeather | null {
  if (value === null) return null;
  const parts = value
    .toLowerCase()
    .split(',')
    .map((part) => part.trim());
  return { rain: parts.includes('rain'), wind: parts.includes('wind'), autumn: parts.includes('autumn') };
}

class Spell {
  on: boolean;
  level: number;
  private timer: number;

  constructor(
    private readonly rules: SpellRules,
    private readonly rand: () => number,
    private readonly held: boolean | null,
  ) {
    this.on = held ?? rand() < rules.atLoad;
    this.level = this.on ? 1 : 0;
    this.timer = this.wait();
  }

  private wait() {
    return this.rules.every[0] + this.rand() * this.rules.every[1];
  }

  /** Advances by dt seconds; true when the spell has just started. */
  update(dt: number): boolean {
    let started = false;
    if (this.held === null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.wait();
        const roll = this.rand();
        if (this.on && roll < this.rules.stop) this.on = false;
        else if (!this.on && roll < this.rules.start) started = this.on = true;
      }
    }
    const target = this.on ? 1 : 0;
    this.level += (target - this.level) * (1 - Math.exp(-dt / this.rules.ease));
    if (Math.abs(target - this.level) < 0.001) this.level = target;
    return started;
  }
}

export interface Weather {
  readonly autumn: boolean;
  /** 0 dry to 1 a full shower. */
  readonly rain: number;
  /** 0 still to 1 a full wind. */
  readonly wind: number;
  /** Which way the wind blows: -1 to the left, 1 to the right. A new spell may turn it. */
  readonly windDir: -1 | 1;
  update(dt: number): void;
}

export function createWeather(rand: () => number, forced: ForcedWeather | null = null): Weather {
  const autumn = forced ? forced.autumn : rand() < AUTUMN_ODDS;
  const rain = new Spell(RAIN, rand, forced ? forced.rain : null);
  const wind = new Spell(WIND, rand, forced ? forced.wind : null);
  let windDir: -1 | 1 = rand() < 0.5 ? -1 : 1;
  return {
    autumn,
    get rain() {
      return rain.level;
    },
    get wind() {
      return wind.level;
    },
    get windDir() {
      return windDir;
    },
    update(dt: number) {
      rain.update(dt);
      if (wind.update(dt)) windDir = rand() < 0.5 ? -1 : 1;
    },
  };
}
