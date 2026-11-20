/**
 * Bamboo under the page, painted as ink and quantised with an 8x8 ordered (Bayer) dither.
 *
 * The grove is grown fresh on every page load: how many clumps, where they stand along the
 * bottom of the viewport, which way they lean, and every culm, branch and leaf spray in them
 * come from a new random seed.
 *
 * It is a small physical model. Each culm is a chain of segments, each segment an angular
 * spring around its rest pose; branches hang off the upper nodes as shorter chains, and sprays
 * of leaves fan out from the branches, each leaf its own lighter spring. A slow breeze sways it
 * all; a moving pointer adds a faint gust, enough to stir the leaves near it, not to bend the
 * grove. The pose is rebuilt from the roots every frame.
 *
 * Painting is all on the GPU (WebGL1), so the CPU only runs the springs and lays out vertices:
 *   1. Every culm segment, node ring, branch and leaf becomes triangles, drawn translucent into
 *      a framebuffer at twice the dither resolution, so overlaps build up density as ink wash
 *      does. Red carries how warm (yellow-green) or cool (teal-green) the ink is.
 *   2. A full-screen pass samples that buffer at one texel per dither dot (DOT css px; linear
 *      filtering averages the 2x2 block, which softens the edges), dithers the density into three
 *      steps and the warmth into the two families, and the canvas is shown pixelated.
 *   Under each block of text (src/scripts/frost.ts) the same pass blurs the ink and thins it, a
 *   feathered frosted patch, so the CSS patches with their costly backdrop-filter can stand down.
 *
 * Inks come from --color-bamboo-cool-1..3 and --color-bamboo-warm-1..3 (faint to strong),
 * strength from --bamboo-strength, re-read on theme change. Capped at 30fps, paused while the
 * tab is hidden, drawn once (still, no wind) under reduced motion. No WebGL: the paper shows.
 *
 * Now and then birds cross the sky or a rabbit hops along the bottom (src/scripts/wildlife.ts).
 *
 * Weather (src/scripts/weather.ts) plays over the grove in layers of depth: the further a drop or
 * a leaf is, the smaller, slower and fainter it is drawn, and the higher up it meets the ground.
 *   Ground: two faded bands at the foot, far and near, that the rain lands on.
 *   Rain: streaks of varied length, slanting with the wind, each breaking into a small splash
 *     where it lands.
 *   Wind: the breeze grows stronger and gustier and pushes one way, so the grove bends and bounces.
 *   Autumn: the leaves warm toward yellow, and now and then one leaf lets go of its spray (never
 *     more than one per spray), tumbles down to the very bottom of the page (depth aside) and lies
 *     there a while before it fades.
 */
import { site } from '@/lib/site';

import { makeColorReader } from './color';
import { FROST_IN_FIELD, FROST_SELECTOR } from './frost';
import { createWeather, parseWeatherParam } from './weather';
import { createWildlife, parseWildlifeParam } from './wildlife';

const DOT = 2;
const FRAME_MS = 1000 / 30;
/** Most frosted patches drawn at once (only those on screen count). */
const MAX_PATCHES = 48;
/** How much of the ink a patch takes away (the CSS wash, --legible-wash, does 0.55; dither dots
 * read stronger than a smooth wash, so the shader thins more). */
const FROST_FADE = 0.7;
/** Most raindrops in the air at once, splash droplets and fallen leaves. */
const MAX_DROPS = 420;
const MAX_SPARKS = 300;
const MAX_FALLERS = 48;
/** How tall the ground is at the foot of the screen, css px; the furthest rain lands at its top. */
const GROUND = 60;

// ---------------------------------------------------------------- shaders

const INK_VERT = `
attribute vec2 aPos;
attribute vec2 aInk;     // warmth, opacity
uniform vec2 uView;      // viewport, css px
varying vec2 vInk;
void main() {
  vInk = aInk;
  vec2 p = aPos / uView * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}
`;

const INK_FRAG = `
precision mediump float;
varying vec2 vInk;
void main() {
  // Premultiplied: red is warmth weighted by ink, alpha the ink itself.
  gl_FragColor = vec4(vInk.x * vInk.y, 0.0, 0.0, vInk.y);
}
`;

const QUAD_VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const DITHER_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uInk;
uniform vec2 uRes;        // dither dots
uniform vec3 uCool[3];
uniform vec3 uWarm[3];
uniform float uStrength;
uniform vec4 uPatch[${MAX_PATCHES}]; // text patches: left, top, right, bottom in dots, from the top
uniform int uPatches;
uniform float uFeather;   // dots
uniform float uFade;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// How much this dot sits under a text patch: 1 inside, falling to 0 over the feather at its
// edges, as the CSS mask does (two linear ramps, multiplied).
float frostAt(vec2 q) {
  float f = 0.0;
  for (int i = 0; i < ${MAX_PATCHES}; i++) {
    if (i >= uPatches) break;
    vec4 r = uPatch[i];
    vec2 d = min(q - r.xy, r.zw - q) / uFeather;
    f = max(f, clamp(d.x, 0.0, 1.0) * clamp(d.y, 0.0, 1.0));
  }
  return f;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec4 ink = texture2D(uInk, uv);
  float frost = uPatches > 0 ? frostAt(vec2(frag.x, uRes.y - frag.y)) : 0.0;
  if (frost > 0.0) {
    // Frosted: the ink blurred over about 6 css px (the buffer is 1 texel per css px; each
    // linear tap already averages four), then thinned like a wash.
    vec2 t = 1.0 / (uRes * 2.0);
    vec4 blur = ink * 0.2;
    blur += (texture2D(uInk, uv + t * vec2(3.0, 0.0)) + texture2D(uInk, uv - t * vec2(3.0, 0.0))
           + texture2D(uInk, uv + t * vec2(0.0, 3.0)) + texture2D(uInk, uv - t * vec2(0.0, 3.0))) * 0.1;
    blur += (texture2D(uInk, uv + t * vec2(5.0, 5.0)) + texture2D(uInk, uv - t * vec2(5.0, 5.0))
           + texture2D(uInk, uv + t * vec2(5.0, -5.0)) + texture2D(uInk, uv - t * vec2(5.0, -5.0))) * 0.05;
    blur += (texture2D(uInk, uv + t * vec2(7.0, 0.0)) + texture2D(uInk, uv - t * vec2(7.0, 0.0))
           + texture2D(uInk, uv + t * vec2(0.0, 7.0)) + texture2D(uInk, uv - t * vec2(0.0, 7.0))) * 0.05;
    ink = mix(ink, blur, frost) * (1.0 - uFade * frost);
  }
  float a = ink.a;
  float level = floor(a * 3.0 + bayer8(frag));
  if (a < 0.004 || level < 1.0) { gl_FragColor = vec4(0.0); return; }
  float warm = step(bayer8(frag + vec2(5.0, 3.0)), ink.r / a);
  vec3 c = level < 1.5 ? mix(uCool[0], uWarm[0], warm)
         : level < 2.5 ? mix(uCool[1], uWarm[1], warm)
         : mix(uCool[2], uWarm[2], warm);
  gl_FragColor = vec4(c * uStrength, uStrength);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function link(gl: WebGLRenderingContext, vert: string, frag: string, attrs: string[]) {
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  attrs.forEach((name, i) => gl.bindAttribLocation(program, i, name));
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

// ---------------------------------------------------------------- noise

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
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

// ---------------------------------------------------------------- model

/** An angular spring: the offset from rest, and how fast it is changing. */
interface Spring {
  rest: number;
  angle: number;
  speed: number;
}

interface Leaf extends Spring {
  len: number;
  wid: number;
  warm: number;
  seed: number;
}

interface Spray {
  /** Which joint of the branch it hangs from. */
  at: number;
  leaves: Leaf[];
  /** Has it let a leaf fall this autumn? Each spray drops one at most. */
  dropped: boolean;
}

interface Chain {
  len: number; // per segment
  segs: Spring[];
  /** Stiffness at the base and at the tip. */
  k0: number;
  k1: number;
  width0: number;
  width1: number;
  depth: number; // 0 front, 1 back
  // Pose, rebuilt each frame: joints and absolute angles.
  x: Float32Array;
  y: Float32Array;
  a: Float32Array;
}

interface Branch extends Chain {
  node: number; // culm joint it grows from
  sprays: Spray[];
}

interface Culm extends Chain {
  rootX: number;
  rootY: number;
  lean: number;
  branches: Branch[];
}

/** A raindrop. `z` is its depth: 0 near, 1 far. */
interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  len: number;
  ground: number;
}

/** A droplet thrown up by a splash, or (with no speed) the flat crown it leaves. */
interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  crown: boolean;
}

/** A leaf that has let go: falling, then lying on the ground (`lying` counts seconds there). */
interface Faller {
  x: number;
  y: number;
  a: number;
  spin: number;
  len: number;
  wid: number;
  ink: number;
  z: number;
  phase: number;
  ground: number;
  lying: number;
}

interface Gust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

function chain(
  n: number,
  len: number,
  rest: () => number,
  k0: number,
  k1: number,
  w0: number,
  w1: number,
  depth: number,
): Chain {
  return {
    len,
    segs: Array.from({ length: n }, () => ({ rest: rest(), angle: 0, speed: 0 })),
    k0,
    k1,
    width0: w0,
    width1: w1,
    depth,
    x: new Float32Array(n + 1),
    y: new Float32Array(n + 1),
    a: new Float32Array(n + 1),
  };
}

export function initBambooField(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return;
  const inkProgram = link(gl, INK_VERT, INK_FRAG, ['aPos', 'aInk']);
  const ditherProgram = link(gl, QUAD_VERT, DITHER_FRAG, ['aPos']);
  if (!inkProgram || !ditherProgram) return;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const mesh = gl.createBuffer();
  const target = gl.createTexture();
  const fbo = gl.createFramebuffer();

  const u = {
    view: gl.getUniformLocation(inkProgram, 'uView'),
    ink: gl.getUniformLocation(ditherProgram, 'uInk'),
    res: gl.getUniformLocation(ditherProgram, 'uRes'),
    cool: gl.getUniformLocation(ditherProgram, 'uCool'),
    warm: gl.getUniformLocation(ditherProgram, 'uWarm'),
    strength: gl.getUniformLocation(ditherProgram, 'uStrength'),
    patch: gl.getUniformLocation(ditherProgram, 'uPatch'),
    patches: gl.getUniformLocation(ditherProgram, 'uPatches'),
    feather: gl.getUniformLocation(ditherProgram, 'uFeather'),
    fade: gl.getUniformLocation(ditherProgram, 'uFade'),
  };

  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const readColor = makeColorReader();
  // A new grove on every load.
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const weatherParam = new URLSearchParams(location.search).get('weather');
  const weather = createWeather(Math.random, parseWeatherParam(weatherParam));
  // Birds and rabbits now and then (src/scripts/wildlife.ts), inked with the grove.
  const wildlife = createWildlife(Math.random, { ...parseWildlifeParam(weatherParam), enabled: site.wildlife });

  let W = 1;
  let H = 1;
  let w = 1;
  let h = 1;
  let scale = 1;
  let culms: Culm[] = [];
  const gusts: Gust[] = [];
  let drops: Drop[] = [];
  let sparks: Spark[] = [];
  let fallers: Faller[] = [];

  // ------------------------------------------------------------ theme

  function readTheme() {
    if (!gl) return;
    const style = getComputedStyle(root);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const family = (name: string, fallback: [number, number, number]) =>
      [1, 2, 3].flatMap((step) => readColor(token(`--color-bamboo-${name}-${step}`), fallback));
    gl.useProgram(ditherProgram);
    gl.uniform3fv(u.cool, family('cool', [0.3, 0.55, 0.5]));
    gl.uniform3fv(u.warm, family('warm', [0.55, 0.7, 0.35]));
    gl.uniform1f(u.strength, Math.min(1, Number.parseFloat(token('--bamboo-strength')) || 0.85));
  }

  // ------------------------------------------------------------ layout

  function grow() {
    const rand = rng(seed);
    const narrow = W < 768;
    scale = narrow ? 0.62 : Math.min(1.25, Math.max(0.8, H / 900));
    culms = [];

    /** Two to six leaves, three or four most often. */
    const LEAF_ODDS: [number, number][] = [
      [2, 0.12],
      [3, 0.32],
      [4, 0.32],
      [5, 0.16],
      [6, 0.08],
    ];
    const leafCount = () => {
      let roll = rand();
      for (const [count, odds] of LEAF_ODDS) if ((roll -= odds) < 0) return count;
      return 4;
    };

    /** A spray of leaves fanning out around `aim` (radians, relative to the branch tip). */
    const spray = (aim: number, spread: number): Leaf[] => {
      const leaves = leafCount();
      let warmth = rand() < 0.3 ? 0.6 + rand() * 0.4 : rand() * 0.35;
      // Autumn turns the grove toward yellow.
      if (weather.autumn) warmth = 0.55 + warmth * 0.45;
      return Array.from({ length: leaves }, (_, l) => ({
        rest: aim + (l / Math.max(1, leaves - 1) - 0.5) * spread + (rand() - 0.5) * 0.25,
        angle: 0,
        speed: 0,
        len: (34 + rand() * 40) * scale,
        wid: (4 + rand() * 3.5) * scale,
        warm: Math.min(1, Math.max(0, warmth + (rand() - 0.5) * 0.3)),
        seed: rand() * 100,
      }));
    };

    /** A branch from a culm node: `first` is its angle off the culm, `bend` how it curves after. */
    const branch = (node: number, segs: number, length: number, first: number, bend: number, depth: number): Branch => {
      const b = chain(segs, length / segs, () => 0, 20, 8, 2.4 * scale, 1.2 * scale, depth) as Branch;
      b.segs[0].rest = first;
      for (let s = 1; s < segs; s++) b.segs[s].rest = bend + (rand() - 0.5) * 0.2;
      b.node = node;
      b.sprays = [];
      return b;
    };

    // Clumps along the bottom, spaced apart, each leaning a little toward the middle.
    const count = narrow ? 1 + (rand() < 0.6 ? 1 : 0) : 2 + (rand() < 0.7 ? 1 : 0);
    const spots: number[] = [];
    for (let tries = 0; spots.length < count && tries < 80; tries++) {
      const x = 0.03 + rand() * 0.94;
      if (spots.every((s) => Math.abs(s - x) > (narrow ? 0.4 : 0.24))) spots.push(x);
    }
    // Three to seven culms in all, at least one per clump, the first clump taking the larger share.
    const total = 3 + Math.floor(rand() * 5);
    const share = spots.map(() => 1);
    for (let left = total - spots.length; left > 0; left--) {
      const pick = rand() < 0.4 ? 0 : Math.floor(rand() * spots.length);
      share[pick]++;
    }
    spots.forEach((fx, i) => {
      const main = i === 0;
      const clump = {
        x: W * fx,
        n: share[i],
        lean: (0.5 - fx) * 0.45 + (rand() - 0.5) * 0.2,
        height: main ? 0.85 + rand() * 0.2 : 0.62 + rand() * 0.28,
        // How far the culms stand apart at the root, and how much they fan out above it.
        spread: (180 + rand() * 160) * scale,
        fan: 0.25 + rand() * 0.25,
      };
      for (let k = 0; k < clump.n; k++) {
        const depth = rand();
        const tall = H * clump.height * (0.62 + rand() * 0.45);
        const n = 9 + Math.floor(rand() * 4);
        const curve = (rand() - 0.5) * 0.04;
        // Every culm its own girth, from a whip to a thick pole, and its own taper.
        const width = (3.5 + rand() ** 1.4 * 14) * scale * (1 - depth * 0.35);
        const taper = 0.3 + rand() * 0.35;
        const c = chain(n, tall / n, () => curve + (rand() - 0.5) * 0.02, 34, 9, width, width * taper, depth) as Culm;
        const off = rand() - 0.5;
        c.rootX = clump.x + off * clump.spread;
        c.rootY = H + 8;
        // Culms at the clump's edges lean outward, so the clump opens like a fan.
        c.lean = -Math.PI / 2 + clump.lean + off * 2 * clump.fan + (rand() - 0.5) * 0.3;
        c.branches = [];

        // Side branches along the upper culm, most nodes carrying one.
        for (let node = Math.floor(n * (0.3 + rand() * 0.15)); node < n - 1; node++) {
          if (rand() < 0.15) continue;
          const side = rand() < 0.5 ? -1 : 1;
          const segs = 2 + Math.floor(rand() * 2);
          const b = branch(node, segs, (60 + rand() * 110) * scale, side * (0.55 + rand() * 0.6), side * 0.12, depth);
          for (let at = 1; at <= segs; at++) {
            if (at < segs && rand() < 0.4) continue;
            b.sprays.push({ at, leaves: spray(side * 0.35, 1.3 + rand() * 0.6), dropped: false });
          }
          c.branches.push(b);
        }

        // About half the culms carry a crown: short twigs fanning from the tip, each ending in a
        // spray, and one spray straight off the tip. The rest end bare.
        if (rand() < 0.45) {
          culms.push(c);
          continue;
        }
        const twigs = 2 + Math.floor(rand() * 3);
        for (let t = 0; t < twigs; t++) {
          const aim = (t / Math.max(1, twigs - 1) - 0.5) * (1.2 + rand() * 0.5) + (rand() - 0.5) * 0.2;
          const segs = 1 + Math.floor(rand() * 2);
          const b = branch(n, segs, (28 + rand() * 50) * scale, aim, aim * 0.3, depth);
          b.sprays.push({ at: segs, leaves: spray(aim * 0.6, 1.4 + rand() * 0.5), dropped: false });
          c.branches.push(b);
        }
        const tip = branch(n, 1, 6 * scale, 0, 0, depth);
        tip.sprays.push({ at: 1, leaves: spray(0, 1.1 + rand() * 0.4), dropped: false });
        c.branches.push(tip);

        culms.push(c);
      }
    });
    // Paint the back of the grove first.
    culms.sort((a, b) => b.depth - a.depth);
  }

  function layout() {
    if (!gl) return;
    const nextW = Math.max(1, canvas.clientWidth);
    const nextH = Math.max(1, canvas.clientHeight);
    if (culms.length && nextW === W && nextH === H) return;
    const widthChanged = !culms.length || nextW !== W;
    W = nextW;
    H = nextH;
    w = Math.ceil(W / DOT);
    h = Math.ceil(H / DOT);
    canvas.width = w;
    canvas.height = h;
    // The ink buffer, at twice the dither resolution.
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w * 2, h * 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (widthChanged) {
      grow();
      // A new grove: what was in the air or on the ground belonged to the old one.
      drops = [];
      sparks = [];
      fallers = [];
      wildlife.clear();
    } else {
      // Mobile browser toolbars change viewport height on scroll: keep the grove rooted at the
      // bottom instead of regrowing it on every scroll.
      for (const c of culms) c.rootY = H + 8;
    }
    pose();
  }

  // ------------------------------------------------------------ physics

  /** The breeze across the whole grove: a slow sway, and in a wind, stronger, gustier and pushing
   * one way. */
  function breezeAt(t: number) {
    const windy = weather.wind;
    return (
      (noise1(t * 0.2) - 0.5) * 0.45 * (1 + windy * 1.4) +
      (noise1(t * 0.8 + 40) - 0.5) * 0.1 * (1 + windy * 4) +
      windy * weather.windDir * (0.15 + 0.3 * noise1(t * 0.45 + 90))
    );
  }

  let windX = 0;
  let windY = 0;

  /** Wind at a point: the precomputed breeze, plus any faint pointer gust nearby. Writes windX/windY. */
  function sampleWind(x: number, y: number, breeze: number) {
    let wx = breeze * (0.4 + 0.6 * (1 - y / H));
    let wy = 0;
    if (gusts.length) {
      const r2 = (120 * scale) ** 2;
      const maxD2 = r2 * 4;
      for (const g of gusts) {
        const dx = x - g.x;
        const dy = y - g.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxD2) continue;
        const fall = Math.exp(-d2 / r2) * g.life;
        wx += g.vx * fall;
        wy += g.vy * fall;
      }
    }
    windX = wx;
    windY = wy;
  }

  /** Rebuild a chain's pose from its base: absolute angles and joints. */
  function place(c: Chain, x: number, y: number, a: number) {
    c.x[0] = x;
    c.y[0] = y;
    c.a[0] = a;
    for (let i = 0; i < c.segs.length; i++) {
      const s = c.segs[i];
      a += s.rest + s.angle;
      c.a[i + 1] = a;
      c.x[i + 1] = c.x[i] + Math.cos(a) * c.len;
      c.y[i + 1] = c.y[i] + Math.sin(a) * c.len;
    }
  }

  function pose() {
    for (const c of culms) {
      place(c, c.rootX, c.rootY, c.lean);
      for (const b of c.branches) place(b, c.x[b.node], c.y[b.node], c.a[b.node + 1] ?? c.a[b.node]);
    }
  }

  function spring(s: Spring, k: number, torque: number, dt: number) {
    const damp = 2 * Math.sqrt(k) * 0.25;
    s.speed += (-k * s.angle - damp * s.speed + torque) * dt;
    s.angle += s.speed * dt;
  }

  /** Torque the wind puts on a segment pointing along angle a: the cross product, z part. */
  function torqueOf(a: number, wx: number, wy: number) {
    return Math.cos(a) * wy - Math.sin(a) * wx;
  }

  function step(dt: number, t: number) {
    if (gusts.length) {
      for (let i = gusts.length - 1; i >= 0; i--) {
        gusts[i]!.life -= dt / 1.4;
        if (gusts[i]!.life <= 0) gusts.splice(i, 1);
      }
    }
    const breeze = breezeAt(t);

    for (const c of culms) {
      const n = c.segs.length;
      const give = 1 - c.depth * 0.3;
      for (let i = 0; i < n; i++) {
        sampleWind(c.x[i + 1]!, c.y[i + 1]!, breeze);
        const lever = 1 + (n - i) * 0.2;
        spring(
          c.segs[i]!,
          c.k0 + ((c.k1 - c.k0) * i) / (n - 1),
          torqueOf(c.a[i + 1]!, windX, windY) * lever * 0.32 * give,
          dt,
        );
      }
      for (const b of c.branches) {
        for (let i = 0; i < b.segs.length; i++) {
          sampleWind(b.x[i + 1]!, b.y[i + 1]!, breeze);
          spring(b.segs[i]!, i ? b.k1 : b.k0, torqueOf(b.a[i + 1]!, windX, windY) * 3 * give, dt);
        }
        for (const spray of b.sprays) {
          sampleWind(b.x[spray.at]!, b.y[spray.at]!, breeze);
          const gust = Math.hypot(windX, windY);
          for (const leaf of spray.leaves) {
            const a = b.a[spray.at]! + leaf.rest + leaf.angle;
            // Leaves flutter: a quick wobble that grows with the wind.
            const flutter = Math.sin(t * (6 + (leaf.seed % 4)) + leaf.seed) * gust * 1.4;
            spring(leaf, 26, (torqueOf(a, windX, windY) * 7 + flutter) * give, dt);
          }
        }
      }
    }
    pose();
  }

  // ------------------------------------------------------------ weather

  /** How far toward the top a thing at depth z meets the ground. */
  const groundAt = (z: number) => H - z * GROUND * 0.9;
  /** Size and speed at depth z. */
  const near = (z: number) => 1 - z * 0.6;

  let rainDue = 0;
  let leafDue = 2 + Math.random() * 3;

  function weatherStep(dt: number, t: number) {
    weather.update(dt);
    const rand = Math.random;
    const drift = breezeAt(t);
    wildlife.update(dt, W, H, scale, drift);

    // Rain: new drops across the top, more as the shower builds, in three layers of depth.
    rainDue += weather.rain * 240 * (W / 1440) * dt;
    while (rainDue >= 1 && drops.length < MAX_DROPS) {
      rainDue--;
      const z = Math.min(1, [0.08, 0.42, 0.78][Math.floor(rand() * 3)] + rand() * 0.18);
      const k = near(z);
      const vy = (720 + rand() * 260) * k;
      drops.push({
        x: -W * 0.15 + rand() * W * 1.3,
        y: -rand() * 60,
        z,
        vx: drift * 700 * k,
        vy,
        len: (8 + rand() ** 1.6 * 30) * k * Math.max(0.8, scale),
        ground: groundAt(z) - rand() * 6 * k,
      });
    }
    if (rainDue > 1) rainDue = 0;

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vx += (drift * 700 * near(d.z) - d.vx) * Math.min(1, dt * 2);
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y < d.ground) continue;
      drops.splice(i, 1);
      if (sparks.length > MAX_SPARKS) continue;
      // A splash: a flat crown, and two to four droplets thrown up and out.
      const k = near(d.z);
      sparks.push({ x: d.x, y: d.ground, z: d.z, vx: 0, vy: 0, life: 1, crown: true });
      for (let n = 2 + Math.floor(rand() * 3); n > 0; n--) {
        sparks.push({
          x: d.x,
          y: d.ground,
          z: d.z,
          vx: ((rand() - 0.5) * 130 + d.vx * 0.12) * k,
          vy: -(60 + rand() * 120) * k,
          life: 1,
          crown: false,
        });
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt / (p.crown ? 0.28 : 0.42);
      if (p.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      if (p.crown) continue;
      p.vy += 900 * near(p.z) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Autumn: now and then a leaf lets go, sooner in a wind.
    if (weather.autumn && (leafDue -= dt * (1 + weather.wind * 2.5)) <= 0) {
      leafDue = 1.5 + rand() * 4.5;
      letGo(rand);
    }
    for (let i = fallers.length - 1; i >= 0; i--) {
      const f = fallers[i];
      if (f.lying >= 0) {
        f.lying += dt;
        // Lies a while, then fades into the ground.
        if (f.lying > 28) fallers.splice(i, 1);
        continue;
      }
      const k = 1 - f.z * 0.35;
      const rock = Math.sin(t * 1.9 + f.phase);
      f.x += (rock * 34 + drift * 220) * k * dt;
      f.y += (34 + 30 * rock * rock) * k * scale * dt;
      f.spin += (rand() - 0.5) * dt * 2;
      f.a += (f.spin + rock * 1.1) * dt;
      if (f.y >= f.ground) {
        f.y = f.ground;
        // Settles flat, a little askew.
        f.a = (Math.cos(f.a) < 0 ? Math.PI : 0) + (rand() - 0.5) * 0.3;
        f.lying = 0;
      }
    }
  }

  /** One leaf from a spray that has not dropped one yet, somewhere on screen. */
  function letGo(rand: () => number) {
    const ready: [Culm, Branch, Spray][] = [];
    for (const c of culms)
      for (const b of c.branches)
        for (const sp of b.sprays) {
          const y = b.y[sp.at];
          if (!sp.dropped && sp.leaves.length > 1 && y > 0 && y < H) ready.push([c, b, sp]);
        }
    if (!ready.length) return;
    const [c, b, sp] = ready[Math.floor(rand() * ready.length)];
    const [l] = sp.leaves.splice(Math.floor(rand() * sp.leaves.length), 1);
    sp.dropped = true;
    const a = b.a[sp.at] + l.rest + l.angle;
    if (fallers.length >= MAX_FALLERS) fallers.shift();
    fallers.push({
      // Held by its middle, so it turns about it as it falls.
      x: b.x[sp.at] + Math.cos(a) * l.len * 0.5,
      y: b.y[sp.at] + Math.sin(a) * l.len * 0.5,
      a,
      spin: (rand() - 0.5) * 2,
      len: l.len,
      wid: l.wid,
      ink: leafInk(c, l),
      z: 0,
      phase: rand() * 10,
      // Leaves ignore depth: they all come to rest at the very bottom of the page.
      ground: H - 1 - rand() * 2,
      lying: -1,
    });
  }

  // ------------------------------------------------------------ geometry

  let verts = new Float32Array(1 << 16);
  let count = 0;

  function vert(x: number, y: number, warm: number, ink: number) {
    if ((count + 1) * 4 > verts.length) {
      const grown = new Float32Array(verts.length * 2);
      grown.set(verts);
      verts = grown;
    }
    const i = count * 4;
    verts[i] = x;
    verts[i + 1] = y;
    verts[i + 2] = warm;
    verts[i + 3] = ink;
    count++;
  }

  function tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, warm: number, ink: number) {
    vert(ax, ay, warm, ink);
    vert(bx, by, warm, ink);
    vert(cx, cy, warm, ink);
  }

  /** A stroke from (x0, y0) to (x1, y1), tapering from width w0 to w1. */
  function stroke(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, ink: number, warm = 0.25) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    const ax = x0 + nx * w0 * 0.5;
    const ay = y0 + ny * w0 * 0.5;
    const bx = x0 - nx * w0 * 0.5;
    const by = y0 - ny * w0 * 0.5;
    const cx = x1 + nx * w1 * 0.5;
    const cy = y1 + ny * w1 * 0.5;
    const ex = x1 - nx * w1 * 0.5;
    const ey = y1 - ny * w1 * 0.5;
    tri(ax, ay, bx, by, cx, cy, warm, ink);
    tri(bx, by, ex, ey, cx, cy, warm, ink);
  }

  /** A lanceolate leaf: widest a third of the way out, its tip sagging a little. */
  function leaf(x: number, y: number, a: number, len: number, wid: number, warm: number, ink: number) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const tx = x + dx * len;
    const ty = y + dy * len + len * 0.06;
    const mx = x + dx * len * 0.32;
    const my = y + dy * len * 0.32;
    for (const side of [1, -1]) {
      const qx = mx - dy * wid * 1.15 * side;
      const qy = my + dx * wid * 1.15 * side;
      let px = x;
      let py = y;
      for (let k = 1; k <= 5; k++) {
        const t = k / 5;
        const s = 1 - t;
        const nx = s * s * x + 2 * s * t * qx + t * t * tx;
        const ny = s * s * y + 2 * s * t * qy + t * t * ty;
        tri(x, y, px, py, nx, ny, warm, ink);
        px = nx;
        py = ny;
      }
    }
  }

  const culmInk = (c: Culm) => 0.62 - c.depth * 0.3;
  const leafInk = (c: Culm, l: Leaf) => (culmInk(c) + 0.12) * (0.75 + 0.35 * ((l.seed * 7) % 1));

  /** The ground the grove stands on: two faded bands of ink, a faint far one reaching up to where the
   * furthest rain lands and a nearer, denser one at the foot, so the ground recedes as the rain
   * and the fallen leaves do. Its top edge rolls a little, as earth does. */
  function ground() {
    const bands: [number, number, number][] = [
      // height (css px), ink at the foot, warmth
      [GROUND, 0.035, 0.6],
      [GROUND * 0.4, 0.04, 0.45],
    ];
    const cols = 32;
    for (const [rise, ink, warm] of bands) {
      for (let i = 0; i < cols; i++) {
        const x0 = (i / cols) * W;
        const x1 = ((i + 1) / cols) * W;
        const top = (x: number) => H - rise * (0.8 + 0.4 * noise1(x / 260 + rise));
        const t0 = top(x0);
        const t1 = top(x1);
        vert(x0, t0, warm, 0);
        vert(x1, t1, warm, 0);
        vert(x0, H, warm, ink);
        vert(x1, t1, warm, 0);
        vert(x1, H, warm, ink);
        vert(x0, H, warm, ink);
      }
    }
  }

  function build() {
    count = 0;
    ground();
    for (const c of culms) {
      const ink = culmInk(c);
      const n = c.segs.length;
      for (let i = 0; i < n; i++) {
        const w0 = c.width0 + ((c.width1 - c.width0) * i) / n;
        const w1 = c.width0 + ((c.width1 - c.width0) * (i + 1)) / n;
        // Leave a hair of paper at each node, as a brush does.
        const gx = (c.x[i + 1] - c.x[i]) * 0.06;
        const gy = (c.y[i + 1] - c.y[i]) * 0.06;
        stroke(c.x[i] + gx, c.y[i] + gy, c.x[i + 1] - gx, c.y[i + 1] - gy, w0, w1, ink * 0.8);
        // A shaded flank down one side.
        const off = w0 * 0.3;
        const nx = -Math.sin(c.a[i + 1]) * off;
        const ny = Math.cos(c.a[i + 1]) * off;
        stroke(c.x[i] + nx, c.y[i] + ny, c.x[i + 1] + nx, c.y[i + 1] + ny, w0 * 0.35, w1 * 0.35, ink * 0.45);
        // The node ring.
        if (i > 0) {
          const r = w0 * 0.75;
          const px = -Math.sin(c.a[i]) * r;
          const py = Math.cos(c.a[i]) * r;
          stroke(c.x[i] - px, c.y[i] - py, c.x[i] + px, c.y[i] + py, 2 * scale, 2 * scale, ink);
        }
      }
      for (const b of c.branches) {
        for (let i = 0; i < b.segs.length; i++) {
          const w0 = b.width0 + ((b.width1 - b.width0) * i) / b.segs.length;
          stroke(b.x[i], b.y[i], b.x[i + 1], b.y[i + 1], w0, w0 * 0.8, ink * 0.9);
        }
        for (const spray of b.sprays) {
          const x = b.x[spray.at];
          const y = b.y[spray.at];
          const base = b.a[spray.at];
          for (const l of spray.leaves) {
            leaf(x, y, base + l.rest + l.angle, l.len, l.wid, l.warm, leafInk(c, l));
          }
        }
      }
    }
    buildWeather();
  }

  /** Rain, splashes and fallen leaves, over the grove. Ink fades and strokes thin with depth. */
  const pen = { stroke, tri };

  function buildWeather() {
    wildlife.draw(pen, H - 2);
    const showing = Math.min(1, weather.rain * 1.5 + 0.35);
    for (const d of drops) {
      const k = near(d.z);
      const v = Math.hypot(d.vx, d.vy) || 1;
      const ink = (0.78 - d.z * 0.5) * showing;
      stroke(d.x - (d.vx / v) * d.len, d.y - (d.vy / v) * d.len, d.x, d.y, 0.9 * k, 2.4 * k, ink, 0);
    }
    for (const p of sparks) {
      const k = near(p.z);
      const ink = (0.85 - p.z * 0.5) * Math.min(1, p.life * 1.6);
      if (p.crown) {
        const r = (2 + (1 - p.life) * 9) * k;
        stroke(p.x - r, p.y, p.x + r, p.y, 1.8 * k, 1.8 * k, ink * 0.8, 0);
      } else {
        stroke(p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03, 2.2 * k, 1.2 * k, ink, 0);
      }
    }
    for (const f of fallers) {
      const fade = f.lying > 24 ? 1 - (f.lying - 24) / 4 : 1;
      const bx = f.x - Math.cos(f.a) * f.len * 0.5;
      const by = f.y - Math.sin(f.a) * f.len * 0.5;
      leaf(bx, by, f.a, f.len, f.wid, 1, f.ink * fade);
    }
  }

  // ------------------------------------------------------------ frost

  // The text patches, measured from the page: each element with its ::before inset (the patch
  // reaches past the text) and, each time the page moves, its box on screen.
  interface Patch {
    el: Element;
    top: number;
    right: number;
    bottom: number;
    left: number;
  }
  let patches: Patch[] = [];
  let feather = 6;
  let frostDirty = true;
  const patchData = new Float32Array(MAX_PATCHES * 4);

  function collectPatches() {
    const px = (v: string) => -(Number.parseFloat(v) || 0);
    patches = [...document.querySelectorAll(FROST_SELECTOR)].map((el) => {
      const before = getComputedStyle(el, '::before');
      return {
        el,
        top: px(before.top),
        right: px(before.right),
        bottom: px(before.bottom),
        left: px(before.left),
      };
    });
    feather = (Number.parseFloat(getComputedStyle(root).getPropertyValue('--space-sm')) || 12) / DOT;
    frostDirty = true;
  }

  function measurePatches() {
    if (!gl) return;
    let n = 0;
    for (const p of patches) {
      if (n === MAX_PATCHES) break;
      const r = p.el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const top = r.top - p.top;
      const bottom = r.bottom + p.bottom;
      if (bottom < 0 || top > H) continue;
      patchData[n * 4] = (r.left - p.left) / DOT;
      patchData[n * 4 + 1] = top / DOT;
      patchData[n * 4 + 2] = (r.right + p.right) / DOT;
      patchData[n * 4 + 3] = bottom / DOT;
      n++;
    }
    gl.useProgram(ditherProgram);
    gl.uniform4fv(u.patch, patchData);
    gl.uniform1i(u.patches, n);
    gl.uniform1f(u.feather, feather);
    gl.uniform1f(u.fade, FROST_FADE);
    frostDirty = false;
  }

  // ------------------------------------------------------------ drawing

  /** The grove, inked into the buffer. */
  function paint() {
    if (!gl) return;
    build();

    // 1. Ink into the buffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w * 2, h * 2);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(inkProgram);
    gl.uniform2f(u.view, W, H);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, count * 4), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(1);
  }

  /** The buffer, frosted under the text and dithered to the screen. */
  function present() {
    if (!gl) return;
    if (frostDirty) measurePatches();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(ditherProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.uniform1i(u.ink, 0);
    gl.uniform2f(u.res, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function render() {
    paint();
    present();
  }

  // ------------------------------------------------------------ loop

  let raf = 0;
  let last = 0;
  let clock = Math.random() * 100;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS) {
      // Between grove frames, follow the text as the page scrolls: only the cheap dither pass.
      if (frostDirty) present();
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 30;
    last = now;
    clock += dt;
    // Two substeps keep the stiff springs steady.
    step(dt / 2, clock);
    step(dt / 2, clock);
    weatherStep(dt, clock);
    render();
  }

  function start() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (motion.matches) render();
    else if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
  }

  // A faint gust where the pointer moves: the leaves notice, the culms barely do.
  let px = -1;
  let py = -1;
  let pt = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (motion.matches) return;
      const now = performance.now();
      // Sample the pointer at most every 50ms; a gust is a smear, not a trace.
      if (px >= 0 && now - pt < 50) return;
      if (px >= 0) {
        const dt = (now - pt) / 1000;
        const vx = (e.clientX - px) / dt / 2400;
        const vy = (e.clientY - py) / dt / 2400;
        const speed = Math.hypot(vx, vy);
        if (speed > 0.03) {
          const cap = Math.min(1, 0.45 / speed);
          gusts.push({ x: e.clientX, y: e.clientY, vx: vx * cap, vy: vy * cap, life: 1 });
          if (gusts.length > 10) gusts.shift();
        }
      }
      px = e.clientX;
      py = e.clientY;
      pt = now;
    },
    { passive: true },
  );

  readTheme();
  collectPatches();
  layout();
  start();
  canvas.classList.add('is-live');
  root.classList.add(FROST_IN_FIELD);

  // The patches move with the page: re-measure on scroll and whenever the layout shifts (lazy
  // images, fonts). Still frames (reduced motion, no loop running) are re-presented directly.
  let presentPending = 0;
  const moved = () => {
    frostDirty = true;
    if (raf || presentPending) return;
    presentPending = requestAnimationFrame(() => {
      presentPending = 0;
      present();
    });
  };
  window.addEventListener('scroll', moved, { passive: true });
  new ResizeObserver(moved).observe(document.body);
  document.fonts?.ready.then(moved);

  const retheme = () => {
    readTheme();
    if (motion.matches) render();
  };
  new MutationObserver(retheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  darkScheme.addEventListener('change', retheme);
  motion.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);

  let pending = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      collectPatches();
      layout();
      render();
    });
  });

  canvas.addEventListener('webglcontextlost', () => {
    cancelAnimationFrame(raf);
    canvas.classList.remove('is-live');
    root.classList.remove(FROST_IN_FIELD);
  });
}
