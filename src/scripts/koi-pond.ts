/**
 * A koi pond under the page, drawn in ASCII on a 2D canvas.
 *
 * The viewport is a grid of character cells. Each frame fills a cell buffer layer by layer, later
 * layers overwriting earlier ones, then stamps every non-empty cell from a glyph atlas (one strip
 * per ink and opacity step, drawn once from a monospace font). Bottom to top:
 *
 *   the floor: a static mosaic of stone tiles (Voronoi edges) and boulders at the edges, lit from
 *     the top left, mossy on top, with tufts of grass along their rims;
 *   caustics: the moving web of light the surface throws on the floor;
 *   water weed: strands swaying up from the bottom and from the stones;
 *   koi: a spine of joints that follows a wandering head, so the body bends as it turns, with a
 *     tail that wags, pectoral fins, a shadow on the floor below, and one of six varieties
 *     (kohaku, sanke, showa, tancho, ogon, asagi) in its own size;
 *   ripples where a fish touches the surface;
 *   lily pads (some in bloom) and petals drifting on the surface;
 *   overhanging foliage at the edges, swaying.
 *
 * Inks come from --color-pond-* and --color-koi-*, overall strength from --pond-strength, re-read
 * when the theme changes. Capped at 24fps, paused while the tab is hidden, drawn once (still)
 * under reduced motion. No script: the canvas stays empty and the paper shows.
 */

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FRAME_MS = 1000 / 24;
const CHARS = ' .,:;-=+*#%@o0O~^\'"|/\\()<>v`&';
const LEVELS = 5;
const LEVEL_ALPHA = [0.26, 0.42, 0.6, 0.8, 1];
const TAU = Math.PI * 2;

const INKS = [
  'pond-water',
  'pond-deep',
  'pond-stone',
  'pond-stone-light',
  'pond-leaf',
  'pond-leaf-light',
  'pond-pad',
  'pond-bloom',
  'koi-red',
  'koi-gold',
  'koi-white',
  'koi-black',
  'koi-blue',
] as const;
const FALLBACK = [
  '#4f8f99',
  '#3c4f6e',
  '#6b5a48',
  '#a1958a',
  '#3f7550',
  '#a7b94a',
  '#4f8f55',
  '#e98b95',
  '#e0562a',
  '#e3a83a',
  '#d6cfc2',
  '#2a2633',
  '#6f7f95',
];
const [WATER, DEEP, STONE, STONE_HI, LEAF, LEAF_HI, PAD, BLOOM, RED, GOLD, WHITE, BLACK, BLUE] = INKS.map((_, i) => i);

const G: Record<string, number> = {};
for (let i = 0; i < CHARS.length; i++) G[CHARS[i]] = i;

// ---------------------------------------------------------------- noise

function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The character that draws a line running in direction (dx, dy), screen y down. */
function lineChar(dx: number, dy: number): number {
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI;
  return G['-\\|/'[Math.round(a / (Math.PI / 4)) % 4]];
}

/**
 * Like lineChar, but a near-vertical edge bows: '(' on its left side, ')' on its right, as on
 * a round outline. nx is the outward normal's x.
 */
function roundChar(dx: number, dy: number, nx: number): number {
  const g = lineChar(dx, dy);
  if (g === G['|']) return G[nx < 0 ? '(' : ')'];
  return g;
}

// ---------------------------------------------------------------- world

interface Rock {
  x: number;
  y: number;
  r: number;
  s: number;
}
interface Leaf {
  dx: number;
  dy: number;
  ang: number;
  len: number;
  wid: number;
  ink: number;
  bloom: boolean;
}
interface Cluster {
  x: number;
  y: number;
  phase: number;
  leaves: Leaf[];
}
interface Pad {
  x: number;
  y: number;
  r: number;
  rot: number;
  vr: number;
  vx: number;
  vy: number;
  bloom: number;
}
interface Weed {
  x: number;
  y: number;
  dx: number;
  dy: number;
  h: number;
  phase: number;
  amp: number;
}
interface Petal {
  x: number;
  y: number;
  ink: number;
  ch: number;
  phase: number;
}
interface Ripple {
  x: number;
  y: number;
  age: number;
  life: number;
}
type Variety = 'kohaku' | 'sanke' | 'showa' | 'tancho' | 'ogon' | 'asagi';
const VARIETIES: Variety[] = ['kohaku', 'ogon', 'showa', 'tancho', 'sanke', 'asagi'];
const JOINTS = 10;

interface Koi {
  j: Float32Array; // joints, head first, css px
  r: Float32Array; // joints as drawn, with the swim wave
  heading: number;
  turn: number;
  speed: number;
  len: number;
  width: number;
  variety: Variety;
  seed: number;
  depth: number;
  phase: number;
  surface: number;
}

/** Body half-width at u (0 at the snout, 1 at the root of the tail), as a share of the width. */
function bodyWidth(u: number): number {
  if (u < 0.3) return 0.55 + 0.45 * Math.sin((u / 0.3) * (Math.PI / 2));
  return 1 - 0.82 * Math.pow((u - 0.3) / 0.7, 1.3);
}

export function initKoiPond(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const atlas = document.createElement('canvas');
  const actx = atlas.getContext('2d');
  if (!actx) return;

  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const seed = (Math.random() * 1e9) | 0;

  // Grid, in device pixels (cw x ch per cell) and css pixels (CW x CH).
  let dpr = 1;
  let cw = 7;
  let ch = 12;
  let CW = 7;
  let CH = 12;
  let cols = 1;
  let rows = 1;
  let W = 1;
  let H = 1;
  let scale = 1;
  let lightPaper = true;

  let glyph = new Uint8Array(1);
  let ink = new Uint8Array(1);
  let lvl = new Uint8Array(1);
  let baseGlyph = new Uint8Array(1);
  let baseInk = new Uint8Array(1);
  let baseLvl = new Uint8Array(1);
  let rockMask = new Uint8Array(1);

  let rocks: Rock[] = [];
  let clusters: Cluster[] = [];
  let pads: Pad[] = [];
  let weeds: Weed[] = [];
  let petals: Petal[] = [];
  let ripples: Ripple[] = [];
  let fish: Koi[] = [];

  // ------------------------------------------------------------ cells

  function put(c: number, r: number, g: number, k: number, l: number) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    glyph[i] = g;
    ink[i] = k;
    lvl[i] = l < 0 ? 0 : l >= LEVELS ? LEVELS - 1 : l;
  }

  /** A cell on the water (not under a stone). */
  function wet(c: number, r: number) {
    return c >= 0 && r >= 0 && c < cols && r < rows && !rockMask[r * cols + c];
  }

  /** Visit every cell whose centre falls in a css-px box, with that centre. */
  function cells(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fn: (c: number, r: number, x: number, y: number) => void,
  ) {
    const c0 = Math.max(0, Math.floor(x0 / CW));
    const c1 = Math.min(cols - 1, Math.ceil(x1 / CW));
    const r0 = Math.max(0, Math.floor(y0 / CH));
    const r1 = Math.min(rows - 1, Math.ceil(y1 / CH));
    for (let r = r0; r <= r1; r++) {
      const y = (r + 0.5) * CH;
      for (let c = c0; c <= c1; c++) fn(c, r, (c + 0.5) * CW, y);
    }
  }

  // ------------------------------------------------------------ theme

  function readTheme() {
    const style = getComputedStyle(root);
    const theme = root.dataset.theme;
    lightPaper = theme === 'light' || (theme !== 'dark' && !darkScheme.matches);
    const strength = Number.parseFloat(style.getPropertyValue('--pond-strength')) || 0.5;
    const colors = INKS.map((name, i) => style.getPropertyValue(`--color-${name}`).trim() || FALLBACK[i]);
    if (!actx) return;
    atlas.width = CHARS.length * cw;
    atlas.height = INKS.length * LEVELS * ch;
    actx.clearRect(0, 0, atlas.width, atlas.height);
    actx.font = `${Math.round(ch * 0.8)}px ${FONT}`;
    actx.textAlign = 'center';
    actx.textBaseline = 'middle';
    colors.forEach((color, k) => {
      actx.fillStyle = color;
      for (let l = 0; l < LEVELS; l++) {
        actx.globalAlpha = Math.min(1, strength * LEVEL_ALPHA[l]);
        const y = (k * LEVELS + l) * ch + ch * 0.54;
        for (let g = 1; g < CHARS.length; g++) actx.fillText(CHARS[g], g * cw + cw / 2, y);
      }
    });
    actx.globalAlpha = 1;
    buildFloor();
  }

  // ------------------------------------------------------------ layout

  function rockRadius(k: Rock, a: number) {
    return (
      k.r * (1 + 0.16 * Math.sin(3 * a + k.s) + 0.09 * Math.sin(5 * a + 2 * k.s) + 0.06 * Math.sin(8 * a + 3 * k.s))
    );
  }

  /** How far inside a stone a point is (positive inside), and that stone. */
  function inRock(x: number, y: number): [number, Rock | null] {
    let best = -Infinity;
    let hit: Rock | null = null;
    for (const k of rocks) {
      const dx = x - k.x;
      const dy = y - k.y;
      const d = Math.hypot(dx, dy);
      if (d > k.r * 1.4) continue;
      const inside = rockRadius(k, Math.atan2(dy, dx)) - d;
      if (inside > best) {
        best = inside;
        hit = k;
      }
    }
    return [best, hit];
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const narrow = window.innerWidth < 768;
    cw = Math.max(4, Math.round((narrow ? 6 : 7) * dpr));
    ch = Math.max(7, Math.round((narrow ? 10 : 12) * dpr));
    CW = cw / dpr;
    CH = ch / dpr;
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    scale = narrow ? 0.7 : 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cols = Math.ceil(canvas.width / cw);
    rows = Math.ceil(canvas.height / ch);
    const n = cols * rows;
    glyph = new Uint8Array(n);
    ink = new Uint8Array(n);
    lvl = new Uint8Array(n);
    baseGlyph = new Uint8Array(n);
    baseInk = new Uint8Array(n);
    baseLvl = new Uint8Array(n);
    rockMask = new Uint8Array(n);

    const rand = rng(seed);
    const m = Math.min(W, H);

    // Stones along the edges, partly off screen; bigger in the corners.
    rocks = [];
    const perimeter = 2 * (W + H);
    const count = Math.round(Math.min(12, Math.max(5, perimeter / 300)));
    for (let i = 0; i < count; i++) {
      const p = ((i + rand() * 0.7) / count) * perimeter;
      let x: number;
      let y: number;
      let nx: number;
      let ny: number;
      if (p < W) [x, y, nx, ny] = [p, 0, 0, 1];
      else if (p < W + H) [x, y, nx, ny] = [W, p - W, -1, 0];
      else if (p < 2 * W + H) [x, y, nx, ny] = [2 * W + H - p, H, 0, -1];
      else [x, y, nx, ny] = [0, perimeter - p, 1, 0];
      const corner =
        Math.min(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) < m * 0.3;
      const r = (corner ? 70 + rand() * 60 : 34 + rand() * 46) * scale;
      const inset = r * (0.15 + rand() * 0.35);
      rocks.push({ x: x + nx * inset, y: y + ny * inset, r, s: rand() * TAU });
      // A smaller stone beside some of them.
      if (rand() < 0.5) {
        const a = rand() * TAU;
        rocks.push({
          x: x + nx * inset + Math.cos(a) * r,
          y: y + ny * inset + Math.sin(a) * r,
          r: r * (0.35 + rand() * 0.25),
          s: rand() * TAU,
        });
      }
    }

    // Foliage overhanging from the edges.
    clusters = [];
    const anchors: [number, number][] = [
      [-0.02, -0.04],
      [1.03, 0.42],
      [0.96, 1.04],
      [-0.03, 0.9],
      [0.55, -0.06],
    ];
    for (const [ax, ay] of anchors) {
      if (rand() < 0.15) continue;
      const x = ax * W;
      const y = ay * H;
      const toward = Math.atan2(H / 2 - y, W / 2 - x);
      const R = m * (0.16 + rand() * 0.1);
      const leaves: Leaf[] = [];
      const yellow = rand() < 0.5;
      const flowering = ay > 0.5 && rand() < 0.8;
      const total = Math.round((26 + rand() * 18) * (scale < 1 ? 0.6 : 1));
      for (let i = 0; i < total; i++) {
        const a = toward + (rand() - 0.5) * 2.4;
        const d = Math.pow(rand(), 0.6) * R;
        const bloom = flowering && rand() < 0.18;
        leaves.push({
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d,
          ang: a + (rand() - 0.5) * 1.2,
          len: (bloom ? 9 : 28 + rand() * 28) * scale,
          wid: (bloom ? 9 : 8 + rand() * 7) * scale,
          ink: bloom ? BLOOM : yellow && rand() < 0.55 ? LEAF_HI : rand() < 0.2 ? LEAF_HI : LEAF,
          bloom,
        });
      }
      clusters.push({ x, y, phase: rand() * TAU, leaves });
    }

    // Weed: from the bottom edge and from stones, reaching into the pond.
    weeds = [];
    const weedCount = Math.round(W / 70);
    for (let i = 0; i < weedCount; i++) {
      let x: number;
      let y: number;
      if (rand() < 0.5 && rocks.length) {
        const k = rocks[Math.floor(rand() * rocks.length)];
        const a = Math.atan2(H / 2 - k.y, W / 2 - k.x) + (rand() - 0.5) * 1.6;
        const rr = rockRadius(k, a);
        x = k.x + Math.cos(a) * rr;
        y = k.y + Math.sin(a) * rr;
      } else {
        x = rand() * W;
        y = H + 4;
      }
      const toC = Math.atan2(H * 0.45 - y, W / 2 - x) + (rand() - 0.5) * 0.5;
      weeds.push({
        x,
        y,
        dx: Math.cos(toC),
        dy: Math.sin(toC),
        h: (50 + rand() * 110) * scale,
        phase: rand() * TAU,
        amp: (6 + rand() * 10) * scale,
      });
    }

    // Lily pads, away from the stones.
    pads = [];
    const padCount = Math.round(Math.min(7, Math.max(3, (W * H) / 220000)));
    for (let i = 0; i < padCount * 4 && pads.length < padCount; i++) {
      const r = (24 + rand() * 26) * scale;
      const x = r + rand() * (W - 2 * r);
      const y = r + rand() * (H - 2 * r);
      if (inRock(x, y)[0] > -r - 10) continue;
      if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 30)) continue;
      pads.push({
        x,
        y,
        r,
        rot: rand() * TAU,
        vr: (rand() - 0.5) * 0.04,
        vx: (rand() - 0.5) * 3,
        vy: (rand() - 0.5) * 3,
        bloom: rand() < 0.4 ? r * 0.38 : 0,
      });
    }

    petals = [];
    const petalCount = Math.round((W * H) / 90000);
    for (let i = 0; i < petalCount; i++) {
      const isPetal = rand() < 0.5;
      petals.push({
        x: rand() * W,
        y: rand() * H,
        ink: isPetal ? BLOOM : rand() < 0.5 ? LEAF_HI : GOLD,
        ch: G[isPetal ? 'o' : rand() < 0.5 ? 'v' : '*'],
        phase: rand() * TAU,
      });
    }

    // Koi: keep the ones already swimming, add or drop to fit the pond.
    const want = Math.round(Math.min(7, Math.max(3, (W * H) / 220000)));
    fish = fish.slice(0, want);
    for (const f of fish) settle(f, rand);
    while (fish.length < want) fish.push(spawn(fish.length, rand));
  }

  function spawn(i: number, rand: () => number): Koi {
    const len = (i % 3 === 2 ? 110 + rand() * 40 : 170 + rand() * 90) * scale;
    const f: Koi = {
      j: new Float32Array(JOINTS * 2),
      r: new Float32Array(JOINTS * 2),
      heading: rand() * TAU,
      turn: 0,
      speed: 14 + rand() * 16,
      len,
      width: len * (0.19 + rand() * 0.04),
      variety: VARIETIES[(i + Math.floor(seed % 6)) % VARIETIES.length],
      seed: rand() * 1000,
      depth: rand(),
      phase: rand() * TAU,
      surface: 4 + rand() * 10,
    };
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = W * (0.15 + rand() * 0.7);
      y = H * (0.15 + rand() * 0.7);
      if (inRock(x, y)[0] < -len) break;
    }
    const seg = len / (JOINTS - 1);
    for (let k = 0; k < JOINTS; k++) {
      f.j[k * 2] = x - Math.cos(f.heading) * seg * k;
      f.j[k * 2 + 1] = y - Math.sin(f.heading) * seg * k;
    }
    return f;
  }

  function settle(f: Koi, rand: () => number) {
    const hx = f.j[0];
    const hy = f.j[1];
    if (hx > 0 && hy > 0 && hx < W && hy < H) return;
    const nx = W * (0.2 + rand() * 0.6) - hx;
    const ny = H * (0.2 + rand() * 0.6) - hy;
    for (let k = 0; k < JOINTS; k++) {
      f.j[k * 2] += nx;
      f.j[k * 2 + 1] += ny;
    }
  }

  // ------------------------------------------------------------ floor

  function buildFloor() {
    glyph.fill(0);
    rockMask.fill(0);
    const tile = 74 * scale;

    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * CH;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * CW;

        // Stones.
        const [inside, k] = inRock(x, y);
        if (k && inside > 0) {
          rockMask[r * cols + c] = 1;
          const dx = x - k.x;
          const dy = y - k.y;
          const rr = rockRadius(k, Math.atan2(dy, dx));
          const nx = dx / rr;
          const ny = dy / rr;
          const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const lit = -0.6 * nx - 0.8 * ny;
          let s = 0.4 + 0.36 * lit + 0.3 * z + (noise(x / 22 + k.s, y / 22) - 0.5) * 0.25;
          s = Math.min(1, Math.max(0, s));
          if (lit > 0.25 && noise(x / 9 + 50, y / 9) > 0.58) {
            put(c, r, G[noise(x, y * 3) > 0.5 ? '"' : ','], LEAF, 2);
          } else if (inside < 5) {
            put(c, r, G['#'], STONE, 4);
          } else {
            const dense = lightPaper ? 1 - s : s;
            const g = '.:-=+*#%@'[Math.min(8, Math.floor(dense * 9))];
            put(c, r, G[g], s > 0.62 ? STONE_HI : STONE, 1 + Math.round(dense * 2));
          }
          continue;
        }

        // The stones' shadow on the water, cast to the lower right.
        if (inRock(x - 10 * scale, y - 14 * scale)[0] > 0) {
          put(c, r, G[':'], DEEP, 1);
          continue;
        }

        // The tiled floor: the edges between pebbles.
        const fx = x / tile;
        const fy = y / tile;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let d1 = 9;
        let d2 = 9;
        let ax = 0;
        let ay = 0;
        let bx = 0;
        let by = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const px = ix + ox + 0.15 + 0.7 * hash(ix + ox, iy + oy);
            const py = iy + oy + 0.15 + 0.7 * hash(ix + ox + 91, iy + oy + 37);
            const d = Math.hypot(fx - px, fy - py);
            if (d < d1) {
              d2 = d1;
              bx = ax;
              by = ay;
              d1 = d;
              ax = px;
              ay = py;
            } else if (d < d2) {
              d2 = d;
              bx = px;
              by = py;
            }
          }
        }
        if (d2 - d1 < 0.07 && hash(c * 3 + 1, r * 5 + 2) < 0.5) {
          // The edge runs across the line joining the two pebble centres.
          put(c, r, lineChar(-(by - ay), bx - ax), STONE, 0);
        } else if (hash(c * 7, r * 13) < 0.025) {
          put(c, r, G['.'], STONE, 0);
        }
      }
    }

    // Grass tufts along the stones' rims.
    const rand = rng(seed ^ 0x5bd1);
    for (const k of rocks) {
      const tufts = Math.round(k.r / 14);
      for (let i = 0; i < tufts; i++) {
        const a = rand() * TAU;
        const rr = rockRadius(k, a);
        const bx = k.x + Math.cos(a) * rr;
        const by = k.y + Math.sin(a) * rr;
        for (let b = 0; b < 3; b++) {
          const ba = a + (b - 1) * 0.5 + (rand() - 0.5) * 0.3;
          const len = (8 + rand() * 12) * scale;
          for (let s = 0; s < len; s += CH * 0.6) {
            const x = bx + Math.cos(ba) * s;
            const y = by + Math.sin(ba) * s;
            put(Math.floor(x / CW), Math.floor(y / CH), lineChar(Math.cos(ba), Math.sin(ba)), LEAF, 2);
          }
        }
      }
    }

    baseGlyph.set(glyph);
    baseInk.set(ink);
    baseLvl.set(lvl);
  }

  // ------------------------------------------------------------ motion

  function step(dt: number, t: number) {
    for (const f of fish) swim(f, dt, t);

    for (const p of pads) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.x < p.r || p.x > W - p.r) p.vx = Math.abs(p.vx) * Math.sign(W / 2 - p.x);
      if (p.y < p.r || p.y > H - p.r) p.vy = Math.abs(p.vy) * Math.sign(H / 2 - p.y);
      const [inside, k] = inRock(p.x, p.y);
      if (k && inside > -p.r) {
        const a = Math.atan2(p.y - k.y, p.x - k.x);
        p.vx = Math.cos(a) * 3;
        p.vy = Math.sin(a) * 3;
      }
    }

    for (const q of petals) {
      q.x += (Math.sin(q.y / 160 + t * 0.05 + q.phase) * 5 + 2) * dt;
      q.y += (Math.cos(q.x / 190 + t * 0.04) * 4 + 1) * dt;
      if (q.x > W + 10) q.x = -10;
      if (q.y > H + 10) q.y = -10;
      if (q.x < -10) q.x = W + 10;
      if (q.y < -10) q.y = H + 10;
    }

    for (const w of ripples) w.age += dt;
    ripples = ripples.filter((w) => w.age < w.life);
  }

  function swim(f: Koi, dt: number, t: number) {
    const hx = f.j[0];
    const hy = f.j[1];

    // Wander, then steer away from the edges, the stones and the other fish.
    f.turn += (noise(t * 0.3 + f.seed, f.seed) - 0.5) * dt * 2.4;
    f.turn *= Math.pow(0.6, dt);
    let ax = 0;
    let ay = 0;
    const margin = 90 * scale;
    if (hx < margin) ax += (margin - hx) / margin;
    if (hx > W - margin) ax -= (hx - W + margin) / margin;
    if (hy < margin) ay += (margin - hy) / margin;
    if (hy > H - margin) ay -= (hy - H + margin) / margin;
    for (const k of rocks) {
      const dx = hx - k.x;
      const dy = hy - k.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = k.r * 1.25 + 40 * scale;
      if (d < reach) {
        ax += (dx / d) * ((reach - d) / reach) * 2;
        ay += (dy / d) * ((reach - d) / reach) * 2;
      }
    }
    for (const o of fish) {
      if (o === f) continue;
      for (let k = 0; k < JOINTS; k += 3) {
        const dx = hx - o.j[k * 2];
        const dy = hy - o.j[k * 2 + 1];
        const d = Math.hypot(dx, dy) || 1;
        const reach = (f.width + o.width) * 1.4;
        if (d < reach && Math.abs(f.depth - o.depth) < 0.5) {
          ax += (dx / d) * ((reach - d) / reach) * 0.8;
          ay += (dy / d) * ((reach - d) / reach) * 0.8;
        }
      }
    }
    let heading = f.heading + f.turn * dt;
    if (ax || ay) {
      let diff = Math.atan2(ay, ax) - heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading += diff * Math.min(1, Math.hypot(ax, ay) * 1.6 * dt);
    }
    f.heading = heading;

    const pace = f.speed * (0.55 + 0.9 * noise(t * 0.15, f.seed * 3)) * scale;
    f.j[0] = hx + Math.cos(heading) * pace * dt;
    f.j[1] = hy + Math.sin(heading) * pace * dt;
    const seg = f.len / (JOINTS - 1);
    for (let k = 1; k < JOINTS; k++) {
      const dx = f.j[(k - 1) * 2] - f.j[k * 2];
      const dy = f.j[(k - 1) * 2 + 1] - f.j[k * 2 + 1];
      const d = Math.hypot(dx, dy) || 1;
      f.j[k * 2] = f.j[(k - 1) * 2] - (dx / d) * seg;
      f.j[k * 2 + 1] = f.j[(k - 1) * 2 + 1] - (dy / d) * seg;
    }
    f.phase += dt * (1.6 + pace * 0.09);

    // Now and then a shallow fish touches the surface.
    f.surface -= dt;
    if (f.surface < 0) {
      f.surface = 6 + Math.random() * 14;
      if (f.depth < 0.45) ripples.push({ x: f.j[0], y: f.j[1], age: 0, life: 3.2 });
    }
  }

  // ------------------------------------------------------------ drawing

  function caustics(t: number) {
    const k = 1 / (150 * scale);
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * CH * k;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (rockMask[i]) continue;
        const x = (c + 0.5) * CW * k;
        // A few rounds of warped sines (after Dave Hoskins' water caustic).
        const px = x * TAU - 250;
        const py = y * TAU - 250;
        let ix = px;
        let iy = py;
        let v = 1;
        for (let n = 0; n < 3; n++) {
          const tt = t * (1 - 3.5 / (n + 1));
          const nx = px + Math.cos(tt - ix) + Math.sin(tt + iy);
          const ny = py + Math.sin(tt - iy) + Math.cos(tt + ix);
          ix = nx;
          iy = ny;
          v += 1 / Math.hypot(px / (Math.sin(ix + tt) / 0.005), py / (Math.cos(iy + tt) / 0.005));
        }
        v /= 3;
        v = Math.pow(Math.abs(1.17 - Math.pow(v, 1.4)), 8);
        if (v < 0.075) continue;
        if (v > 0.3) put(c, r, G['~'], WATER, 3);
        else if (v > 0.16) put(c, r, G['~'], WATER, 2);
        else if (v > 0.105) put(c, r, G['-'], WATER, 1);
        else put(c, r, G['.'], WATER, 0);
      }
    }
  }

  function drawWeeds(t: number) {
    for (const w of weeds) {
      const px = -w.dy;
      const py = w.dx;
      let lx = w.x;
      let ly = w.y;
      const stepLen = CH * 0.5;
      for (let s = stepLen; s <= w.h; s += stepLen) {
        const u = s / w.h;
        const off = Math.sin(u * 3.2 - t * 0.7 + w.phase) * w.amp * u;
        const x = w.x + w.dx * s + px * off;
        const y = w.y + w.dy * s + py * off;
        const c = Math.floor(x / CW);
        const r = Math.floor(y / CH);
        if (wet(c, r)) {
          const dx = x - lx;
          const dy = y - ly;
          const g = Math.abs(dy) > Math.abs(dx) * 1.6 ? G[dx * Math.sign(dy) > 0 ? '(' : ')'] : lineChar(dx, dy);
          put(c, r, g, LEAF, u > 0.8 ? 0 : 1);
        }
        lx = x;
        ly = y;
      }
    }
  }

  /** Lay out the drawn spine: the joints plus the swimming wave, bigger toward the tail. */
  function wave(f: Koi) {
    for (let k = 0; k < JOINTS; k++) {
      const a = k === 0 ? 0 : k - 1;
      const dx = f.j[a * 2] - f.j[(a + 1) * 2];
      const dy = f.j[a * 2 + 1] - f.j[(a + 1) * 2 + 1];
      const d = Math.hypot(dx, dy) || 1;
      const u = k / (JOINTS - 1);
      const off = Math.sin(f.phase - k * 0.7) * f.width * 0.32 * Math.pow(u, 1.5);
      f.r[k * 2] = f.j[k * 2] + (-dy / d) * off;
      f.r[k * 2 + 1] = f.j[k * 2 + 1] + (dx / d) * off;
    }
  }

  // Scratch for the nearest point on the spine.
  let hitU = 0;
  let hitD = 0;

  /** Nearest point on the drawn spine: sets hitU (0..1) and hitD (signed, css px). */
  function nearest(f: Koi, x: number, y: number) {
    let best = Infinity;
    for (let k = 0; k < JOINTS - 1; k++) {
      const ax = f.r[k * 2];
      const ay = f.r[k * 2 + 1];
      const bx = f.r[k * 2 + 2] - ax;
      const by = f.r[k * 2 + 3] - ay;
      const l2 = bx * bx + by * by || 1;
      const tt = Math.min(1, Math.max(0, ((x - ax) * bx + (y - ay) * by) / l2));
      const qx = x - ax - bx * tt;
      const qy = y - ay - by * tt;
      const d = qx * qx + qy * qy;
      if (d < best) {
        best = d;
        hitU = (k + tt) / (JOINTS - 1);
        hitD = Math.sqrt(d) * (bx * qy - by * qx > 0 ? 1 : -1);
      }
    }
  }

  function bodyInk(f: Koi, u: number, lat: number): number {
    const s = f.seed;
    const patch = noise(u * 4.2 + s, lat * 1.4 + s * 0.7);
    switch (f.variety) {
      case 'kohaku':
        return patch > 0.5 || (u < 0.18 && patch > 0.38) ? RED : WHITE;
      case 'sanke':
        if (noise(u * 11 + s, lat * 3 + 9) > 0.74) return BLACK;
        return patch > 0.52 ? RED : WHITE;
      case 'showa':
        if (patch > 0.55) return RED;
        return noise(u * 5 + s * 2, lat * 2) > 0.58 ? WHITE : BLACK;
      case 'tancho':
        return (u - 0.11) * (u - 0.11) * 40 + lat * lat * 0.9 < 0.32 ? RED : WHITE;
      case 'ogon':
        return Math.abs(lat) < 0.2 && u > 0.1 && u < 0.8 ? WHITE : GOLD;
      case 'asagi':
        if (u < 0.12) return WHITE;
        return Math.abs(lat) > 0.62 ? RED : BLUE;
    }
  }

  /** An outline character for the body's edge at u, on the side of the signed distance d. */
  function edgeChar(f: Koi, u: number, d: number): number {
    const k = Math.min(JOINTS - 2, Math.floor(u * (JOINTS - 1)));
    let dx = f.r[k * 2 + 2] - f.r[k * 2];
    let dy = f.r[k * 2 + 3] - f.r[k * 2 + 1];
    // Toward the snout the outline curves round the head.
    if (u < 0.1) {
      const turn = ((0.1 - u) / 0.1) * (d > 0 ? 1 : -1) * 1.2;
      [dx, dy] = [dx * Math.cos(turn) - dy * Math.sin(turn), dx * Math.sin(turn) + dy * Math.cos(turn)];
    }
    return roundChar(dx, dy, d > 0 ? -dy : dy);
  }

  function finInk(f: Koi) {
    return f.variety === 'ogon' ? GOLD : f.variety === 'showa' ? BLACK : WHITE;
  }

  function koiBox(f: Koi): [number, number, number, number] {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < JOINTS; k++) {
      x0 = Math.min(x0, f.r[k * 2]);
      x1 = Math.max(x1, f.r[k * 2]);
      y0 = Math.min(y0, f.r[k * 2 + 1]);
      y1 = Math.max(y1, f.r[k * 2 + 1]);
    }
    const pad = f.width + f.len * 0.32;
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }

  function drawShadow(f: Koi) {
    const ox = (6 + f.depth * 12) * scale;
    const oy = (9 + f.depth * 16) * scale;
    const [x0, y0, x1, y1] = koiBox(f);
    cells(x0 + ox, y0 + oy, x1 + ox, y1 + oy, (c, r, x, y) => {
      if (!wet(c, r)) return;
      nearest(f, x - ox, y - oy);
      if (Math.abs(hitD) < f.width * bodyWidth(hitU) * 0.9) put(c, r, G[':'], DEEP, lightPaper ? 1 : 2);
    });
  }

  function drawKoi(f: Koi) {
    const [x0, y0, x1, y1] = koiBox(f);
    const n = JOINTS - 1;
    const tailX = f.r[n * 2];
    const tailY = f.r[n * 2 + 1];
    let tdx = tailX - f.r[(n - 1) * 2];
    let tdy = tailY - f.r[(n - 1) * 2 + 1];
    const tl = Math.hypot(tdx, tdy) || 1;
    // The tail fin swings further than the body.
    const swing = Math.sin(f.phase - JOINTS * 0.7) * 0.5;
    const cs = Math.cos(swing);
    const sn = Math.sin(swing);
    [tdx, tdy] = [(tdx / tl) * cs - (tdy / tl) * sn, (tdx / tl) * sn + (tdy / tl) * cs];
    const tailLen = f.len * 0.3;

    // Pectoral fins, sweeping back from just behind the head.
    const hx = f.r[2 * 2];
    const hy = f.r[2 * 2 + 1];
    let bdx = hx - f.r[0];
    let bdy = hy - f.r[1];
    const bl = Math.hypot(bdx, bdy) || 1;
    bdx /= bl;
    bdy /= bl;
    const finLen = f.len * 0.2;
    const finW = f.len * 0.06;
    const flap = 0.85 + 0.25 * Math.sin(f.phase * 0.6);
    const fins = [-1, 1].map((side) => {
      const a = Math.atan2(bdy, bdx) + side * flap;
      const base = f.width * bodyWidth(2 / n) * 0.75;
      return { x: hx - bdy * side * base, y: hy + bdx * side * base, dx: Math.cos(a), dy: Math.sin(a) };
    });

    const top = 4 - Math.round(f.depth * 2);
    const fin = finInk(f);
    cells(x0, y0, x1, y1, (c, r, x, y) => {
      if (!wet(c, r)) return;
      nearest(f, x, y);
      const w = f.width * bodyWidth(hitU);
      const rel = Math.abs(hitD) / w;
      if (rel < 1) {
        if (rel > 0.74) {
          // The outline follows the body, so the silhouette reads before the pattern does.
          put(c, r, edgeChar(f, hitU, hitD), finInk(f) === WHITE && !lightPaper ? WHITE : DEEP, top);
          return;
        }
        const k = bodyInk(f, hitU, hitD / w);
        put(c, r, G[rel < 0.35 ? '@' : rel < 0.6 ? '#' : '*'], k, top);
        return;
      }
      // Tail fin: a fan, forked at the end.
      const sx = x - tailX;
      const sy = y - tailY;
      const s = sx * tdx + sy * tdy;
      const q = Math.abs(sx * -tdy + sy * tdx);
      if (s > 0 && s < tailLen) {
        const u = s / tailLen;
        const fork = u > 0.65 && q < ((u - 0.65) / 0.35) * f.width * 0.3;
        if (q < (0.15 + 0.85 * u) * f.width * 0.6 && !fork) {
          put(
            c,
            r,
            lineChar(
              tdx + (sx * -tdy + sy * tdx > 0 ? -tdy : tdy) * u * 0.6,
              tdy + (sx * -tdy + sy * tdx > 0 ? tdx : -tdx) * u * 0.6,
            ),
            fin,
            top - 2,
          );
          return;
        }
      }
      for (const p of fins) {
        const fx = x - p.x;
        const fy = y - p.y;
        const a = fx * p.dx + fy * p.dy;
        const b = fx * -p.dy + fy * p.dx;
        if (a > 0 && a < finLen && Math.abs(b) < finW * Math.sin((a / finLen) * Math.PI)) {
          put(c, r, lineChar(p.dx, p.dy), fin, top - 2);
          return;
        }
      }
    });

    // Two eyes, one cell each, just behind the snout.
    const ex = f.r[0] - f.r[2];
    const ey = f.r[1] - f.r[3];
    const el = Math.hypot(ex, ey) || 1;
    const along = f.len * 0.035;
    const side = f.width * bodyWidth(0.04) * 0.55;
    for (const sgn of [-1, 1]) {
      const x = f.r[0] - (ex / el) * along + (-ey / el) * side * sgn;
      const y = f.r[1] - (ey / el) * along + (ex / el) * side * sgn;
      const c = Math.floor(x / CW);
      const r = Math.floor(y / CH);
      if (wet(c, r)) put(c, r, G['o'], BLACK, top);
    }
  }

  function drawRipples() {
    for (const w of ripples) {
      const u = w.age / w.life;
      for (const ring of [0, 0.35]) {
        const v = u - ring;
        if (v <= 0) continue;
        const rad = v * 70 * scale;
        const l = Math.round((1 - u) * 3);
        cells(w.x - rad - 8, w.y - rad - 8, w.x + rad + 8, w.y + rad + 8, (c, r, x, y) => {
          if (!wet(c, r)) return;
          if (Math.abs(Math.hypot(x - w.x, (y - w.y) * 1.15) - rad) < CW * 0.7)
            put(c, r, G[v < 0.3 ? 'o' : '.'], WATER, l);
        });
      }
    }
  }

  function drawPads() {
    for (const p of pads) {
      cells(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r, (c, r, x, y) => {
        if (!wet(c, r)) return;
        const dx = x - p.x;
        const dy = y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > p.r) return;
        let a = Math.atan2(dy, dx) - p.rot;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) < 0.28 && d > p.r * 0.12) return; // the notch
        if (p.bloom && Math.hypot(dx + p.r * 0.2, dy) < p.bloom) {
          const bd = Math.hypot(dx + p.r * 0.2, dy) / p.bloom;
          put(c, r, G[bd < 0.35 ? 'o' : bd < 0.7 ? '@' : '*'], bd < 0.35 ? GOLD : BLOOM, 4);
          return;
        }
        if (d > p.r - CW * 0.9) put(c, r, roundChar(-dy, dx, dx), PAD, 3);
        else if (((a / TAU) * 9 + 9) % 1 < 0.12) put(c, r, lineChar(dx, dy), LEAF, 2);
        else put(c, r, G[d < p.r * 0.5 ? ':' : '='], PAD, 2);
      });
    }
    for (const q of petals) {
      const c = Math.floor(q.x / CW);
      const r = Math.floor(q.y / CH);
      if (wet(c, r)) put(c, r, q.ch, q.ink, 3);
    }
  }

  function drawFoliage(t: number) {
    for (const k of clusters) {
      const sway = Math.sin(t * 0.5 + k.phase) * 0.035;
      const cs = Math.cos(sway);
      const sn = Math.sin(sway);
      for (const leaf of k.leaves) {
        const bx = k.x + leaf.dx * cs - leaf.dy * sn;
        const by = k.y + leaf.dx * sn + leaf.dy * cs;
        const a = leaf.ang + sway * 1.6 + Math.sin(t * 0.9 + leaf.dx) * 0.04;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        if (leaf.bloom) {
          cells(bx - leaf.wid, by - leaf.wid, bx + leaf.wid, by + leaf.wid, (c, r, x, y) => {
            const d = Math.hypot(x - bx, y - by) / leaf.wid;
            if (d < 1) put(c, r, G[d < 0.4 ? 'o' : '*'], d < 0.4 ? GOLD : BLOOM, 4);
          });
          continue;
        }
        const ex = bx + dx * leaf.len;
        const ey = by + dy * leaf.len;
        cells(
          Math.min(bx, ex) - leaf.wid,
          Math.min(by, ey) - leaf.wid,
          Math.max(bx, ex) + leaf.wid,
          Math.max(by, ey) + leaf.wid,
          (c, r, x, y) => {
            const u = ((x - bx) * dx + (y - by) * dy) / leaf.len;
            if (u <= 0 || u >= 1) return;
            const v = Math.abs((x - bx) * -dy + (y - by) * dx);
            const half = leaf.wid * Math.pow(Math.sin(u * Math.PI), 0.8);
            if (v > half) return;
            if (v < CW * 0.45) put(c, r, lineChar(dx, dy), leaf.ink, 4);
            else put(c, r, G[v > half * 0.7 ? '*' : '%'], leaf.ink, 3);
          },
        );
      }
    }
  }

  function render(t: number) {
    if (!ctx) return;
    glyph.set(baseGlyph);
    ink.set(baseInk);
    lvl.set(baseLvl);
    caustics(t * 0.22);
    drawWeeds(t);
    for (const f of fish) wave(f);
    for (const f of fish) drawShadow(f);
    const order = [...fish].sort((a, b) => b.depth - a.depth);
    for (const f of order) drawKoi(f);
    drawRipples();
    drawPads();
    drawFoliage(t);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const g = glyph[i];
        if (!g) continue;
        ctx.drawImage(atlas, g * cw, (ink[i] * LEVELS + lvl[i]) * ch, cw, ch, c * cw, r * ch, cw, ch);
      }
    }
  }

  // ------------------------------------------------------------ loop

  let raf = 0;
  let last = 0;
  let clock = Math.random() * 100;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    step(dt, clock);
    render(clock);
  }

  function start() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (motion.matches) render(clock);
    else if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
  }

  layout();
  readTheme();
  // Let the fish find their places before the first still frame.
  for (let i = 0; i < 20; i++) step(0.05, (clock += 0.05));
  start();
  canvas.classList.add('is-live');

  const retheme = () => {
    readTheme();
    if (motion.matches) render(clock);
  };
  new MutationObserver(retheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  darkScheme.addEventListener('change', retheme);
  motion.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);

  let pending = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      layout();
      readTheme();
      render(clock);
    });
  });
}
