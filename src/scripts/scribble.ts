/**
 * Marker scribbles for a hovered Work card, in px: a hand-drawn box round the card and one to three
 * arrows pointing at it. Every call deals a new one (start side, wobble, overshoot, how many arrows,
 * where they come from and what shape they take), so no two hovers draw the same marks.
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
 * A box round a `w` by `h` card: four bowed sides, each running a little past its corner, starting
 * on a random side and running on past the start. Sometimes the pen goes round a second time.
 */
export function scribbleBox(w: number, h: number, rand: Rand = Math.random): string {
  const jit = (n: number) => between(rand, -n, n);
  // The corners, clockwise from top left, each pushed off true by a few px.
  const corners: Pt[] = [
    [jit(4), jit(4)],
    [w + jit(4), jit(4)],
    [w + jit(4), h + jit(4)],
    [jit(4), h + jit(4)],
  ];
  const start = Math.floor(rand() * 4);
  const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // A side from corner a to b, bowed off the straight and overshooting b.
  const side = (a: Pt, b: Pt, from: Pt) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / len, dy / len];
    const over = between(rand, 2, 9);
    const end: Pt = [b[0] + ux * over + jit(2), b[1] + uy * over + jit(2)];
    const bow = jit(Math.min(7, len * 0.06));
    const c1 = lerp(from, end, between(rand, 0.25, 0.4));
    const c2 = lerp(from, end, between(rand, 0.6, 0.75));
    const bow2 = bow * jitSign(rand);
    return {
      d: `C${pt([c1[0] - uy * bow, c1[1] + ux * bow])} ${pt([c2[0] - uy * bow2, c2[1] + ux * bow2])} ${pt(end)}`,
      end,
    };
  };
  // Start part way along the side before the start corner.
  const prev = corners[(start + 3) % 4]!;
  let at = lerp(prev, corners[start]!, between(rand, 0.55, 0.85));
  const parts = [`M${pt(at)}`];
  const laps = rand() < 0.3 ? 5 + Math.floor(rand() * 3) : 4;
  // The first stroke finishes that side, then the pen goes round corner by corner.
  for (let i = 0; i <= laps; i += 1) {
    const s = side(i === 0 ? prev : corners[(start + i - 1) % 4]!, corners[(start + i) % 4]!, at);
    parts.push(s.d);
    at = s.end;
  }
  // Run on a little past the last corner and lift.
  const a = corners[(start + laps) % 4]!;
  const b = corners[(start + laps + 1) % 4]!;
  const tail = lerp(a, b, between(rand, 0.15, 0.45));
  parts.push(`Q${pt(lerp(at, tail, 0.5))} ${pt([tail[0] + jit(3), tail[1] + jit(3)])}`);
  return parts.join(' ');
}

/** Mostly the same way, now and then the other: a side that wobbles rather than bows. */
function jitSign(rand: Rand) {
  return rand() < 0.75 ? 1 : -0.6;
}

const SHAFTS = ['swoop', 'loop', 'zigzag', 'straight'] as const;
export type Shaft = (typeof SHAFTS)[number];

/**
 * An arrow from `from` to `to`: its shaft in one of four hands and a head along its last heading.
 * Returns the shaft and the head as separate strokes so the head can land last.
 */
export function arrow(from: Pt, to: Pt, shape: Shaft, rand: Rand = Math.random): [string, string] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const [px, py] = [-uy, ux];
  const side = rand() < 0.5 ? 1 : -1;
  const along = (t: number, off = 0): Pt => [from[0] + dx * t + px * off * side, from[1] + dy * t + py * off * side];
  let d: string;
  let last: Pt; // a point just before the tip, for the head's heading
  if (shape === 'swoop') {
    const bend = len * between(rand, 0.25, 0.45);
    const c1 = along(0.3, bend);
    last = along(0.75, bend * 0.4);
    d = `M${pt(from)} C${pt(c1)} ${pt(last)} ${pt(to)}`;
  } else if (shape === 'loop') {
    // Crossed control points tie a loop part way along.
    const r = len * between(rand, 0.18, 0.26);
    const mid = along(between(rand, 0.35, 0.5));
    const c1 = [mid[0] + ux * r * 2.2 + px * r * 1.6 * side, mid[1] + uy * r * 2.2 + py * r * 1.6 * side] as Pt;
    const c2 = [mid[0] - ux * r * 1.4 + px * r * 1.8 * side, mid[1] - uy * r * 1.4 + py * r * 1.8 * side] as Pt;
    last = along(0.8, -len * 0.05);
    d = `M${pt(from)} Q${pt(along(0.2, len * 0.08))} ${pt(mid)} C${pt(c1)} ${pt(c2)} ${pt(mid)} Q${pt(last)} ${pt(to)}`;
  } else if (shape === 'zigzag') {
    const kinks = 2 + Math.floor(rand() * 2);
    const amp = len * between(rand, 0.12, 0.2);
    const pts: Pt[] = [];
    for (let i = 1; i <= kinks; i += 1) pts.push(along((i / (kinks + 1)) * 0.85, amp * (i % 2 ? 1 : -1)));
    last = pts[pts.length - 1]!;
    d = `M${pt(from)} ${pts.map((p) => `L${pt(p)}`).join(' ')} L${pt(to)}`;
  } else {
    last = along(0.6, len * between(rand, -0.06, 0.06));
    d = `M${pt(from)} Q${pt(last)} ${pt(to)}`;
  }
  // The head: two strokes back from the tip, about 30 degrees either side of the last heading.
  const hx = to[0] - last[0];
  const hy = to[1] - last[1];
  const hl = Math.hypot(hx, hy) || 1;
  const size = between(rand, 7, 10);
  const spread = between(rand, 0.42, 0.6);
  const wing = (s: number): Pt => {
    const a = Math.atan2(hy / hl, hx / hl) + Math.PI + spread * s;
    return [to[0] + Math.cos(a) * size, to[1] + Math.sin(a) * size * between(rand, 0.85, 1.15)];
  };
  return [d, `M${pt(wing(1))} L${pt(to)} L${pt(wing(-1))}`];
}

/**
 * The whole mark for a `w` by `h` card: the box, then one to three arrows from different sides,
 * each landing just outside the box and pointing in. Strokes come back in drawing order.
 */
export function scribble(w: number, h: number, rand: Rand = Math.random): Stroke[] {
  const strokes: Stroke[] = [{ d: scribbleBox(w, h, rand), at: 0, len: 1 }];
  const count = 1 + Math.floor(rand() * 3);
  // Sides to come from: top and right most often; the left least, it borders the rail.
  const sides = ['top', 'right', 'bottom', 'top', 'right', 'left'] as const;
  const used = new Set<string>();
  let at = 0.75;
  for (let i = 0; i < count; i += 1) {
    let s = pick(rand, sides);
    for (let k = 0; used.has(s) && k < 6; k += 1) s = pick(rand, sides);
    used.add(s);
    const gap = between(rand, 5, 10);
    const reach = between(rand, 38, 64);
    const tilt = between(rand, -0.6, 0.6);
    const t = between(rand, 0.15, 0.85);
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
    const width = between(rand, 1.5, 2);
    strokes.push({ d: shaft, at, len: 0.6, width }, { d: head, at: at + 0.55, len: 0.25, width });
    at += between(rand, 0.35, 0.55);
  }
  return strokes;
}
