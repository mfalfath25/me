/**
 * Wildlife in the bamboo: now and then a few birds cross the sky, or a rabbit hops along the bottom
 * of the page. This module keeps them moving and says what to draw; bamboo-field.ts supplies the
 * pen, so they are inked and dithered with the grove.
 *
 * Birds come in flocks of one to four at one depth: the further the flock, the smaller, slower and
 * fainter. Each bird flaps on its own beat and now and then glides. A rabbit hops in runs of two to
 * five, sits a moment with its ears up, and hops on until it leaves the page.
 *
 * `?weather=birds` or `?weather=rabbits` (with any weather) sends the first ones within a second.
 */

/** Draws into the ink buffer. Warmth 0 is the cool ink, 1 the warm. */
export interface Pen {
  stroke(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, ink: number, warm: number): void;
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, warm: number, ink: number): void;
}

export interface WildlifeOptions {
  /** Send birds and rabbits on their own schedule. Off, only the ones asked for below come. */
  enabled?: boolean;
  /** Send the first flock, or the first rabbit, within a second. */
  birdsSoon?: boolean;
  rabbitsSoon?: boolean;
}

/** Seconds between flocks, and between rabbits: min and spread. */
const BIRDS_EVERY: [number, number] = [18, 40];
const RABBITS_EVERY: [number, number] = [25, 50];
/** Seconds a hop takes in the air. */
const HOP = 0.36;

interface Bird {
  /** Offset from the flock's lead, px. */
  dx: number;
  dy: number;
  phase: number;
  beat: number;
}

interface Flock {
  x: number;
  y: number;
  z: number;
  dir: -1 | 1;
  speed: number;
  size: number;
  age: number;
  birds: Bird[];
}

interface Rabbit {
  x: number;
  dir: -1 | 1;
  size: number;
  hopping: boolean;
  /** Seconds into the current hop or sit. */
  t: number;
  sitFor: number;
  hopsLeft: number;
  reach: number;
  lift: number;
  twitch: number;
}

export function parseWildlifeParam(value: string | null): WildlifeOptions {
  const parts = (value ?? '').toLowerCase().split(',');
  return { birdsSoon: parts.some((p) => p.trim() === 'birds'), rabbitsSoon: parts.some((p) => p.trim() === 'rabbits') };
}

export function createWildlife(rand: () => number, options: WildlifeOptions = {}) {
  const wait = ([min, spread]: [number, number]) => min + rand() * spread;
  const enabled = options.enabled ?? true;
  const first = (soon: boolean | undefined, delay: number, every: [number, number]) =>
    soon ? delay : enabled ? wait(every) * (0.3 + rand() * 0.7) : Infinity;
  let birdsDue = first(options.birdsSoon, 0.5, BIRDS_EVERY);
  let rabbitsDue = first(options.rabbitsSoon, 0.8, RABBITS_EVERY);
  let flocks: Flock[] = [];
  let rabbits: Rabbit[] = [];
  let clock = 0;

  function sendFlock(W: number, H: number, scale: number) {
    const dir: -1 | 1 = rand() < 0.5 ? -1 : 1;
    const z = rand();
    const k = 1 - z * 0.55;
    const n = 1 + Math.floor(rand() * 4);
    const size = (12 + rand() * 5) * k * scale;
    const birds: Bird[] = Array.from({ length: n }, (_, i) => ({
      // A loose V behind the lead.
      dx: -i * size * (2.2 + rand() * 1.2),
      dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * size * (0.9 + rand() * 0.8),
      phase: rand() * Math.PI * 2,
      beat: 7 + rand() * 3,
    }));
    flocks.push({
      x: dir > 0 ? -size * 4 : W + size * 4,
      y: H * (0.08 + rand() * 0.35),
      z,
      dir,
      speed: (80 + rand() * 60) * (1 - z * 0.5) * Math.max(0.8, scale),
      size,
      age: 0,
      birds,
    });
  }

  function sendRabbit(W: number, scale: number) {
    const dir: -1 | 1 = rand() < 0.5 ? -1 : 1;
    const size = 24 * Math.max(0.75, scale);
    rabbits.push({
      x: dir > 0 ? -size * 2 : W + size * 2,
      dir,
      size,
      hopping: true,
      t: 0,
      sitFor: 0,
      hopsLeft: 2 + Math.floor(rand() * 4),
      reach: size * (1.8 + rand() * 0.8),
      lift: size * (0.7 + rand() * 0.4),
      twitch: rand() * 10,
    });
  }

  return {
    get flocks() {
      return flocks.length;
    },
    get rabbits() {
      return rabbits.length;
    },

    clear() {
      flocks = [];
      rabbits = [];
    },

    /** Advances dt seconds over a W x H page; `drift` is the breeze, pushing the birds along. */
    update(dt: number, W: number, H: number, scale: number, drift: number) {
      clock += dt;
      if ((birdsDue -= dt) <= 0) {
        birdsDue = enabled ? wait(BIRDS_EVERY) : Infinity;
        if (flocks.length < 2) sendFlock(W, H, scale);
      }
      if ((rabbitsDue -= dt) <= 0) {
        rabbitsDue = enabled ? wait(RABBITS_EVERY) : Infinity;
        if (rabbits.length < 2) sendRabbit(W, scale);
      }

      for (const f of flocks) {
        f.age += dt;
        f.x += (f.dir * f.speed + drift * 60 * (1 - f.z * 0.5)) * dt;
      }
      flocks = flocks.filter((f) => {
        const tail = f.x + f.birds.reduce((far, b) => Math.min(far, b.dx), 0) * f.dir;
        return f.dir > 0 ? tail < W + f.size * 4 : tail > -f.size * 4;
      });

      for (const r of rabbits) {
        r.t += dt;
        if (r.hopping) {
          r.x += (r.dir * r.reach * dt) / HOP;
          if (r.t >= HOP) {
            r.t = 0;
            r.hopsLeft--;
            r.hopping = false;
            // A beat on the ground between hops; a proper sit after the last of a run.
            r.sitFor = r.hopsLeft > 0 ? 0.08 + rand() * 0.06 : 0.8 + rand() * 2.4;
            if (r.hopsLeft <= 0) r.hopsLeft = 2 + Math.floor(rand() * 4);
          }
        } else if (r.t >= r.sitFor) {
          r.t = 0;
          r.hopping = true;
        }
      }
      rabbits = rabbits.filter((r) => (r.dir > 0 ? r.x < W + r.size * 3 : r.x > -r.size * 3));
    },

    /** Inks every bird and rabbit; `ground` is the y the rabbits sit on. */
    draw(pen: Pen, ground: number) {
      for (const f of flocks) {
        const ink = 0.8 - f.z * 0.45;
        const s = f.size;
        for (const b of f.birds) {
          const x = f.x + b.dx * f.dir;
          const y = f.y + b.dy + Math.sin(clock * 1.3 + b.phase) * s * 0.5;
          // Flaps, with a glide now and then: the wings held, slightly raised.
          const gliding = Math.sin(clock * 0.45 + b.phase * 3) > 0.55;
          const flap = gliding ? 0.25 : Math.sin(clock * b.beat + b.phase);
          const elbowY = y - s * 0.45 * flap;
          const tipY = elbowY + s * 0.2 - s * 0.35 * flap;
          for (const side of [-1, 1]) {
            const ex = x + side * s * 0.5;
            const tx = x + side * s * 1.05;
            pen.stroke(x, y, ex, elbowY, 1.7 * (1 - f.z * 0.5), 1.4 * (1 - f.z * 0.5), ink, 0.1);
            pen.stroke(ex, elbowY, tx, tipY, 1.4 * (1 - f.z * 0.5), 0.5, ink, 0.1);
          }
          // Head and body, a short dash along the line of flight.
          pen.stroke(
            x - f.dir * s * 0.25,
            y + s * 0.05,
            x + f.dir * s * 0.3,
            y - s * 0.02,
            2.4 * (1 - f.z * 0.5),
            1.6 * (1 - f.z * 0.5),
            ink,
            0.1,
          );
        }
      }

      for (const r of rabbits) drawRabbit(pen, r, ground);
    },
  };

  function drawRabbit(pen: Pen, r: Rabbit, ground: number) {
    const s = r.size;
    const p = r.hopping ? r.t / HOP : 0;
    const air = Math.sin(p * Math.PI);
    // Nose up as it leaves the ground, down as it lands.
    const pitch = r.hopping ? (0.5 - p) * 0.7 : 0;
    const cos = Math.cos(pitch);
    const sin = Math.sin(pitch);
    const baseY = ground - air * r.lift;
    // Full ink in the cool family, so it stands out dark against the paler, warmer ground.
    const ink = 1;
    const warm = 0;
    // Local space: lx forward, ly up, in units of the rabbit's size.
    const at = (lx: number, ly: number): [number, number] => [
      r.x + r.dir * (lx * cos - ly * sin) * s,
      baseY - (lx * sin + ly * cos) * s,
    ];
    const blob = (cx: number, cy: number, rx: number, ry: number) => {
      const [ox, oy] = at(cx, cy);
      let [px, py] = at(cx + rx, cy);
      for (let i = 1; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const [nx, ny] = at(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
        pen.tri(ox, oy, px, py, nx, ny, warm, ink);
        px = nx;
        py = ny;
      }
    };
    const line = (ax: number, ay: number, bx: number, by: number, w0: number, w1: number) => {
      const [x0, y0] = at(ax, ay);
      const [x1, y1] = at(bx, by);
      pen.stroke(x0, y0, x1, y1, w0 * s, w1 * s, ink, warm);
    };

    // Stretched long in the air, gathered up on the ground.
    const stretch = 1 + air * 0.3;
    blob(0, 0.42, 0.58 * stretch, 0.38 * (1 - air * 0.15));
    if (!r.hopping) blob(-0.3, 0.32, 0.36, 0.32); // the haunch, tucked under
    blob(0.55 * stretch, 0.78, 0.27, 0.22); // head
    blob(-0.6 * stretch, 0.52, 0.12, 0.12); // tail

    // Ears: up and twitching while it sits, laid back in a hop.
    const back = r.hopping ? 0.35 + air * 0.4 : 0.05 + Math.max(0, Math.sin(r.t * 9 + r.twitch)) * 0.12;
    line(0.5 * stretch, 0.95, 0.5 * stretch - back * 0.9, 1.55 - back * 0.35, 0.13, 0.07);
    line(0.6 * stretch, 0.95, 0.62 * stretch - back * 0.8, 1.5 - back * 0.3, 0.12, 0.06);

    if (r.hopping) {
      // Hind legs kicked back, forelegs reaching ahead.
      line(-0.35, 0.22, -0.95 - air * 0.2, 0.05, 0.16, 0.08);
      line(0.4, 0.2, 0.75 + air * 0.25, 0.02, 0.1, 0.06);
    } else {
      line(0.35, 0.15, 0.42, 0, 0.1, 0.07);
    }
  }
}

export type Wildlife = ReturnType<typeof createWildlife>;
