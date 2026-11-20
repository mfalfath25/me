/**
 * Braille dither: a photo redrawn as 2x3 dot cells (matching Unicode braille U+2800..U+283F).
 *
 * The photo is sampled at dot resolution, contrast-stretched (2nd to 98th percentile) and
 * dithered with Atkinson error diffusion. On light paper the dots carry the photo's darks, on
 * dark paper its lights. Each cell is then coloured from the theme's dither ramp by the
 * brightness under it, so the picture reads as a gradient (magma: indigo, plum, raspberry,
 * peach; dark: teal, emerald, mint, pale lime) rather than one ink. Colours come from
 * --color-dither-1 (shadow) to --color-dither-5 (highlight) and are re-read on theme change.
 *
 * The 64 dot patterns are rendered directly as circles once per tone into an atlas, then stamped
 * onto a grid of whole device pixels. Drawing the dots geometrically avoids relying on system
 * braille fonts (which are missing or restricted on mobile browsers) and keeps dot pitch exact
 * at any pixel density.
 */
import { percentileRange } from './color';

export interface DitherInk {
  /** The tones, shadow to highlight (any CSS colour). */
  ramp: string[];
  /** Card background (any CSS colour). */
  paper: string;
  /** True when the paper is light, so dots carry the photo's darks. */
  lightPaper: boolean;
}

/** Target width of one braille cell, in css px. */
const CELL_W = 4;
const CELL_W_NARROW = 3.4;
// Dot bits for the 6-dot cell: left column top to bottom, then the right column.
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
] as const;
// 4x4 ordered thresholds, to blend the tone bands across neighbouring cells.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

let sampler: CanvasRenderingContext2D | null = null;

function sample(img: CanvasImageSource, w: number, h: number): Float32Array | null {
  sampler ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!sampler) return null;
  const canvas = sampler.canvas;
  canvas.width = w;
  canvas.height = h;
  sampler.imageSmoothingQuality = 'high';
  sampler.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = sampler.getImageData(0, 0, w, h).data;
  } catch {
    return null; // a cross-origin image would taint the canvas
  }
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = (0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!) / 255;
  }
  return lum;
}

function stretch(lum: Float32Array) {
  const [lo, hi] = percentileRange(lum, 0.02, 0.98);
  const range = Math.max(hi - lo, 0.05);
  for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i]! - lo) / range));
}

/** Atkinson dither in place: 1 where a dot is raised, 0 otherwise. */
function atkinson(ink: Float32Array, w: number, h: number) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const v = ink[i]!;
      const on = v >= 0.5 ? 1 : 0;
      const err = (v - on) * 0.125;
      ink[i] = on;
      if (x + 1 < w) ink[i + 1] += err;
      if (x + 2 < w) ink[i + 2] += err;
      if (y + 1 < h) {
        const next = row + w + x;
        if (x > 0) ink[next - 1] += err;
        ink[next] += err;
        if (x + 1 < w) ink[next + 1] += err;
      }
      if (y + 2 < h) ink[row + 2 * w + x] += err;
    }
  }
}

/** Draw `img` into `canvas` as braille dots, sized to the canvas's css box. False if it could not. */
export function drawDither(canvas: HTMLCanvasElement, img: CanvasImageSource, ink: DitherInk): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  // Work in device pixels, with a whole number of them per cell, so every row and
  // column of dots sits on the same pitch at any pixel density.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(canvas.clientWidth * dpr);
  const H = Math.round(canvas.clientHeight * dpr);
  const cw = Math.max(2, Math.round((canvas.clientWidth < 240 ? CELL_W_NARROW : CELL_W) * dpr));
  const ch = Math.max(3, Math.round(cw * 1.5));
  const cols = Math.floor(W / cw);
  const rows = Math.floor(H / ch);
  if (cols < 2 || rows < 2) return false;

  // One sample per dot.
  const sw = cols * 2;
  const sh = rows * 3;
  const lum = sample(img, sw, sh);
  if (!lum) return false;
  stretch(lum);

  // Each cell's tone, from the brightness under it, before the dots are dithered.
  const tones = new Uint8Array(cols * rows);
  const steps = 4; // light paper: ramp 1 to 4; dark paper: ramp 2 to 5
  const offset = ink.lightPaper ? 0 : 1;
  for (let r = 0; r < rows; r++) {
    const r3 = r * 3;
    const bayerRow = (r & 3) * 4;
    for (let c = 0; c < cols; c++) {
      const c2 = c * 2;
      const sum =
        lum[r3 * sw + c2]! +
        lum[r3 * sw + c2 + 1]! +
        lum[(r3 + 1) * sw + c2]! +
        lum[(r3 + 1) * sw + c2 + 1]! +
        lum[(r3 + 2) * sw + c2]! +
        lum[(r3 + 2) * sw + c2 + 1]!;
      const t = (sum / 6) * (steps - 1) + BAYER4[bayerRow + (c & 3)]! - 0.5;
      tones[r * cols + c] = Math.min(steps - 1, Math.max(0, Math.round(t))) + offset;
    }
  }

  // Ink is the dark of the photo on light paper, its light on dark paper. A gamma keeps the
  // midtones open, so a night photo is not a solid block of dots.
  for (let i = 0; i < lum.length; i++) {
    const v = ink.lightPaper ? 1 - lum[i]! : lum[i]!;
    lum[i] = Math.pow(v, 1.3) * 0.95;
  }
  atkinson(lum, sw, sh);

  const atlas = glyphAtlas(cw, ch, ink.ramp);
  if (!atlas) return false;
  canvas.width = W;
  canvas.height = H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = ink.paper;
  ctx.fillRect(0, 0, W, H);
  const ox = Math.floor((W - cols * cw) / 2);
  const oy = Math.floor((H - rows * ch) / 2);
  for (let r = 0; r < rows; r++) {
    const r3 = r * 3;
    const dy = oy + r * ch;
    for (let c = 0; c < cols; c++) {
      const c2 = c * 2;
      let bits = 0;
      if (lum[r3 * sw + c2]) bits |= 0x01;
      if (lum[r3 * sw + c2 + 1]) bits |= 0x08;
      if (lum[(r3 + 1) * sw + c2]) bits |= 0x02;
      if (lum[(r3 + 1) * sw + c2 + 1]) bits |= 0x10;
      if (lum[(r3 + 2) * sw + c2]) bits |= 0x04;
      if (lum[(r3 + 2) * sw + c2 + 1]) bits |= 0x20;
      if (!bits) continue;
      const tone = tones[r * cols + c]!;
      ctx.drawImage(atlas, bits * cw, tone * ch, cw, ch, ox + c * cw, dy, cw, ch);
    }
  }
  return true;
}

let atlasKey = '';
let atlasCanvas: HTMLCanvasElement | null = null;

/**
 * The 64 dot patterns (0..63), drawn as circles once per tone into a strip of `cw` x `ch`
 * device-pixel cells: column = the cell's dot bits, row = the tone.
 */
function glyphAtlas(cw: number, ch: number, ramp: string[]): HTMLCanvasElement | null {
  const key = `${cw}x${ch}:${ramp.join('|')}`;
  if (atlasCanvas && key === atlasKey) return atlasCanvas;
  const canvas = atlasCanvas ?? document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.width = 64 * cw;
  canvas.height = ramp.length * ch;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pitchX = cw / 2;
  const pitchY = ch / 3;
  const radius = Math.max(0.65, Math.min(pitchX, pitchY) * 0.34);
  const tau = Math.PI * 2;

  ramp.forEach((color, tone) => {
    const rowY = tone * ch;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let bits = 1; bits < 64; bits++) {
      const cellX = bits * cw;
      for (let y = 0; y < 3; y++) {
        const cy = rowY + (y + 0.5) * pitchY;
        for (let x = 0; x < 2; x++) {
          if (!(bits & BITS[y]![x]!)) continue;
          const cx = cellX + (x + 0.5) * pitchX;
          ctx.moveTo(cx + radius, cy);
          ctx.arc(cx, cy, radius, 0, tau);
        }
      }
    }
    ctx.fill();
  });
  atlasCanvas = canvas;
  atlasKey = key;
  return canvas;
}

/** The current theme's dither colours, read from the tokens. */
export function readDitherInk(): DitherInk {
  const style = getComputedStyle(document.documentElement);
  const fallback = ['#2b1a4a', '#6b2160', '#c93f6b', '#f2b39a', '#faf3e6'];
  return {
    ramp: fallback.map((value, i) => style.getPropertyValue(`--color-dither-${i + 1}`).trim() || value),
    paper: style.getPropertyValue('--color-paper').trim() || '#fff',
    lightPaper: !isDarkScheme(),
  };
}

function isDarkScheme(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
