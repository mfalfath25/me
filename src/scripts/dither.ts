/**
 * Braille dither: a photo redrawn as Unicode braille, U+2800 to U+283F. Each character is a
 * 2x3 grid of dots; a dot is raised where the dithered photo says "ink".
 *
 * The photo is sampled at dot resolution, contrast-stretched (2nd to 98th percentile) and
 * dithered with Atkinson error diffusion. On light paper the dots carry the photo's darks, on
 * dark paper its lights. Each character is then coloured from the theme's dither ramp by the
 * brightness under it, so the picture reads as a gradient (magma: indigo, plum, raspberry,
 * peach; dark: teal, emerald, mint, pale lime) rather than one ink. Colours come from
 * --color-dither-1 (shadow) to --color-dither-5 (highlight) and are re-read on theme change.
 *
 * The 64 characters are drawn from the font once per tone into an atlas, then stamped onto a
 * grid of whole device pixels. Laying text out directly would not do: a braille font's advance
 * leaves a wider gap between characters than between the two dot columns of one, and rows on
 * fractional pixels band on 1x screens.
 */

export interface DitherInk {
  /** The tones, shadow to highlight (any CSS colour). */
  ramp: string[];
  /** Card background (any CSS colour). */
  paper: string;
  /** True when the paper is light, so dots carry the photo's darks. */
  lightPaper: boolean;
}

/** Target width of one braille character, in css px. */
const CELL_W = 4;
const CELL_W_NARROW = 3.4;
/** How much the glyph's dots are thickened, as a share of their own diameter. */
const BOLD = 0.45;
const FONT = '"Apple Braille", "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", sans-serif';
const BLANK = 0x2800;
// Dot bits for the 6-dot cell: left column top to bottom, then the right column.
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
];
// 4x4 ordered thresholds, to blend the tone bands across neighbouring characters.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

interface Metrics {
  /** All as fractions of the font size. */
  inkLeft: number;
  ascent: number;
  dot: number;
  colPitch: number;
  rowPitch: number;
}

let metrics: Metrics | null | undefined;
let sampler: CanvasRenderingContext2D | null = null;

/** Measure the braille font once: where the dots sit and how far apart they are. */
function measure(ctx: CanvasRenderingContext2D): Metrics | null {
  const size = 100;
  ctx.font = `${size}px ${FONT}`;
  const one = ctx.measureText('⠁');
  const six = ctx.measureText('⠿');
  const eight = ctx.measureText('⣿');
  const inkLeft = -one.actualBoundingBoxLeft;
  const dot = one.actualBoundingBoxRight - inkLeft;
  const colPitch = six.actualBoundingBoxRight - one.actualBoundingBoxRight;
  const rowPitch = eight.actualBoundingBoxDescent - six.actualBoundingBoxDescent;
  // No braille font: the glyphs would be boxes, so leave the photo as it is.
  if (!(dot > 1 && colPitch > dot && rowPitch > dot)) return null;
  return {
    inkLeft: inkLeft / size,
    ascent: one.actualBoundingBoxAscent / size,
    dot: dot / size,
    colPitch: colPitch / size,
    rowPitch: rowPitch / size,
  };
}

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
    lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  }
  return lum;
}

function stretch(lum: Float32Array) {
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
  const hi = sorted[Math.floor(sorted.length * 0.98)] ?? 1;
  const range = Math.max(hi - lo, 0.05);
  for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / range));
}

/** Atkinson dither in place: 1 where a dot is raised, 0 otherwise. */
function atkinson(ink: Float32Array, w: number, h: number) {
  const spread = (x: number, y: number, err: number) => {
    if (x >= 0 && x < w && y < h) ink[y * w + x] += err;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const on = ink[i] >= 0.5 ? 1 : 0;
      const err = (ink[i] - on) / 8;
      ink[i] = on;
      spread(x + 1, y, err);
      spread(x + 2, y, err);
      spread(x - 1, y + 1, err);
      spread(x, y + 1, err);
      spread(x + 1, y + 1, err);
      spread(x, y + 2, err);
    }
  }
}

/** Draw `img` into `canvas` as braille, sized to the canvas's css box. False if it could not. */
export function drawDither(canvas: HTMLCanvasElement, img: CanvasImageSource, ink: DitherInk): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  if (metrics === undefined) metrics = measure(ctx);
  if (!metrics) return false;
  const m = metrics;

  // Work in device pixels, with a whole number of them per character, so every row and
  // column of dots sits on the same pitch at any pixel density.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(canvas.clientWidth * dpr);
  const H = Math.round(canvas.clientHeight * dpr);
  const cw = Math.max(2, Math.round((canvas.clientWidth < 240 ? CELL_W_NARROW : CELL_W) * dpr));
  const ch = Math.max(3, Math.round((cw * 3 * m.rowPitch) / (2 * m.colPitch)));
  const cols = Math.floor(W / cw);
  const rows = Math.floor(H / ch);
  if (cols < 2 || rows < 2) return false;

  // One sample per dot.
  const sw = cols * 2;
  const sh = rows * 3;
  const lum = sample(img, sw, sh);
  if (!lum) return false;
  stretch(lum);

  // Each character's tone, from the brightness under it, before the dots are dithered.
  const tones = new Uint8Array(cols * rows);
  const steps = 4; // light paper: ramp 1 to 4; dark paper: ramp 2 to 5
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) sum += lum[(r * 3 + y) * sw + c * 2 + x];
      const t = (sum / 6) * (steps - 1) + BAYER4[(r % 4) * 4 + (c % 4)] - 0.5;
      tones[r * cols + c] = Math.min(steps - 1, Math.max(0, Math.round(t))) + (ink.lightPaper ? 0 : 1);
    }
  }

  // Ink is the dark of the photo on light paper, its light on dark paper. A gamma keeps the
  // midtones open, so a night photo is not a solid block of dots.
  for (let i = 0; i < lum.length; i++) {
    const v = ink.lightPaper ? 1 - lum[i] : lum[i];
    lum[i] = Math.pow(v, 1.3) * 0.95;
  }
  atkinson(lum, sw, sh);

  const atlas = glyphAtlas(m, cw, ch, ink.ramp);
  if (!atlas) return false;
  canvas.width = W;
  canvas.height = H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = ink.paper;
  ctx.fillRect(0, 0, W, H);
  const ox = Math.floor((W - cols * cw) / 2);
  const oy = Math.floor((H - rows * ch) / 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let bits = 0;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 2; x++) if (lum[(r * 3 + y) * sw + c * 2 + x]) bits |= BITS[y][x];
      }
      if (!bits) continue;
      const tone = tones[r * cols + c];
      ctx.drawImage(atlas, bits * cw, tone * ch, cw, ch, ox + c * cw, oy + r * ch, cw, ch);
    }
  }
  return true;
}

let atlasKey = '';
let atlasCanvas: HTMLCanvasElement | null = null;

/**
 * The 64 braille characters (U+2800 to U+283F), drawn from the font once per tone into a strip
 * of `cw` x `ch` device-pixel cells: column = the character's dot bits, row = the tone.
 */
function glyphAtlas(m: Metrics, cw: number, ch: number, ramp: string[]): HTMLCanvasElement | null {
  const key = `${cw}x${ch}:${ramp.join('|')}`;
  if (atlasCanvas && key === atlasKey) return atlasCanvas;
  const canvas = atlasCanvas ?? document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.width = 64 * cw;
  canvas.height = ramp.length * ch;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const size = cw / (2 * m.colPitch);
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  // A braille font's dots are small for their pitch; a stroke in the same colour fattens them,
  // so the picture holds and stays crisp on 1x screens.
  ctx.lineWidth = m.dot * size * BOLD;
  ctx.lineJoin = 'round';
  // Place the glyph so its dots fall evenly in the cell, whatever the font's side bearings.
  const gx = ((m.colPitch - m.dot) / 2 - m.inkLeft) * size;
  const gy = (ch - 3 * m.rowPitch * size) / 2 + ((m.rowPitch - m.dot) / 2 + m.ascent) * size;
  ramp.forEach((color, tone) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    for (let bits = 1; bits < 64; bits++) {
      const glyph = String.fromCharCode(BLANK + bits);
      ctx.fillText(glyph, bits * cw + gx, tone * ch + gy);
      ctx.strokeText(glyph, bits * cw + gx, tone * ch + gy);
    }
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
