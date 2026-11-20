/**
 * Marker scribbles for a hovered Work card, in px: a crisp hand-drawn box round the card and one
 * to three clean arrows pointing at it. Every call deals a new one (start side, bow, overshoot,
 * arrow count, placement and curve), so no two hovers draw the same marks.
 * `rand` returns 0 to 1, like Math.random; tests pass a seeded one.
 */

export type Rand = () => number;

/** One stroke and when it draws: `at` and `len` are multiples of `--dur-scribble`. */
export interface Stroke {
  d: string;
  at: number;
  len: number;
  width?: number;
}

type Pt = [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = ([x, y]: Pt) => `${r1(x)} ${r1(y)}`;
const between = (rand: Rand, lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T>(rand: Rand, list: readonly T[]) => list[Math.floor(rand() * list.length) % list.length]!;

/**
 * A crisp hand-drawn box round a `w` by `h` card: four gently bowed sides with light corner
 * overshoot, starting on a random side and finishing with a short confident tail.
 */
export function scribbleBox(w: number, h: number, rand: Rand = Math.random): string {
  const jit = (n: number) => between(rand, -n, n);
  // The corners, clockwise from top left, nudged slightly off true for a hand-drawn feel.
  const corners: Pt[] = [
    [jit(2.2), jit(2.2)],
    [w + jit(2.2), jit(2.2)],
    [w + jit(2.2), h + jit(2.2)],
    [jit(2.2), h + jit(2.2)],
  ];
  const start = Math.floor(rand() * 4);
  const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // A side from corner a to b, gently bowed in one direction and overshooting b slightly.
  const side = (a: Pt, b: Pt, from: Pt) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / len, dy / len];
    const over = between(rand, 1.5, 5.5);
    const end: Pt = [b[0] + ux * over + jit(1.2), b[1] + uy * over + jit(1.2)];
    const bow = jit(Math.min(4.2, len * 0.032));
    const c1 = lerp(from, end, between(rand, 0.28, 0.4));
    const c2 = lerp(from, end, between(rand, 0.6, 0.72));
    return {
      d: `C${pt([c1[0] - uy * bow, c1[1] + ux * bow])} ${pt([c2[0] - uy * bow * 0.9, c2[1] + ux * bow * 0.9])} ${pt(end)}`,
      end,
    };
  };
  // Start part way along the side before the start corner.
  const prev = corners[(start + 3) % 4]!;
  let at = lerp(prev, corners[start]!, between(rand, 0.65, 0.88));
  const parts = [`M${pt(at)}`];
  const laps = rand() < 0.15 ? 5 : 4;
  // The first stroke finishes that side, then the pen goes round corner by corner.
  for (let i = 0; i <= laps; i += 1) {
    const s = side(i === 0 ? prev : corners[(start + i - 1) % 4]!, corners[(start + i) % 4]!, at);
    parts.push(s.d);
    at = s.end;
  }
  // Run on a touch past the last corner and lift.
  const a = corners[(start + laps) % 4]!;
  const b = corners[(start + laps + 1) % 4]!;
  const tail = lerp(a, b, between(rand, 0.08, 0.24));
  parts.push(`Q${pt(lerp(at, tail, 0.5))} ${pt([tail[0] + jit(1.5), tail[1] + jit(1.5)])}`);
  return parts.join(' ');
}

const SHAFTS = ['swoop', 'swoop', 'straight'] as const;
export type Shaft = (typeof SHAFTS)[number];

/**
 * A clean arrow from `from` to `to`: either a graceful swoop or a brisk near-straight stroke,
 * with a neat head aligned to its arrival angle.
 */
export function arrow(from: Pt, to: Pt, shape: Shaft, rand: Rand = Math.random): [string, string] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const [px, py] = [-dy / len, dx / len];
  const side = rand() < 0.5 ? 1 : -1;
  const along = (t: number, off = 0): Pt => [from[0] + dx * t + px * off * side, from[1] + dy * t + py * off * side];
  let d: string;
  let last: Pt; // a point just before the tip, for the head's heading
  if (shape === 'swoop') {
    const bend = len * between(rand, 0.18, 0.34);
    const c1 = along(0.32, bend);
    last = along(0.76, bend * 0.35);
    d = `M${pt(from)} C${pt(c1)} ${pt(last)} ${pt(to)}`;
  } else {
    last = along(0.58, len * between(rand, -0.05, 0.05));
    d = `M${pt(from)} Q${pt(last)} ${pt(to)}`;
  }
  // The head: two crisp strokes back from the tip.
  const hx = to[0] - last[0];
  const hy = to[1] - last[1];
  const hl = Math.hypot(hx, hy) || 1;
  const size = between(rand, 6.5, 9);
  const spread = between(rand, 0.42, 0.56);
  const wing = (s: number): Pt => {
    const a = Math.atan2(hy / hl, hx / hl) + Math.PI + spread * s;
    return [to[0] + Math.cos(a) * size, to[1] + Math.sin(a) * size * between(rand, 0.9, 1.1)];
  };
  return [d, `M${pt(wing(1))} L${pt(to)} L${pt(wing(-1))}`];
}

/**
 * The whole mark for a `w` by `h` card: the box, then one to three clean arrows from different
 * sides, each landing just outside the box and pointing in. Strokes come back in drawing order.
 */
export function scribble(w: number, h: number, rand: Rand = Math.random): Stroke[] {
  const strokes: Stroke[] = [{ d: scribbleBox(w, h, rand), at: 0, len: 1 }];
  const roll = rand();
  const count = roll < 0.55 ? 1 : roll < 0.88 ? 2 : 3;
  // Sides to come from: top and right most often; the left least, it borders the rail.
  const sides = ['top', 'right', 'bottom', 'top', 'right', 'left'] as const;
  const used = new Set<string>();
  let at = 0.55;
  for (let i = 0; i < count; i += 1) {
    let s = pick(rand, sides);
    for (let k = 0; used.has(s) && k < 6; k += 1) s = pick(rand, sides);
    used.add(s);
    const gap = between(rand, 5, 9);
    const reach = between(rand, 30, 48);
    const tilt = between(rand, -0.48, 0.48);
    const t = between(rand, 0.18, 0.82);
    // The tip, just off the box, and the outward direction it comes from.
    const [to, out]: [Pt, Pt] =
      s === 'top'
        ? [[w * t, -gap], [0, -1]]
        : s === 'bottom'
          ? [[w * t, h + gap], [0, 1]]
          : s === 'right'
            ? [[w + gap, h * t], [1, 0]]
            : [[-gap, h * t], [-1, 0]];
    const ang = Math.atan2(out[1], out[0]) + tilt;
    const from: Pt = [to[0] + Math.cos(ang) * reach, to[1] + Math.sin(ang) * reach];
    const [shaft, head] = arrow(from, to, pick(rand, SHAFTS), rand);
    const width = between(rand, 1.35, 1.7);
    strokes.push({ d: shaft, at, len: 0.48, width }, { d: head, at: at + 0.4, len: 0.22, width });
    at += between(rand, 0.22, 0.34);
  }
  return strokes;
}
