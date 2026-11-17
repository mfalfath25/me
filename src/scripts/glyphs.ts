/**
 * The photo card's look under any Preset but the braille ones (those are dither.ts): the photo
 * sampled once per cell, levelled, then each cell drawn as a glyph from a ramp, a halftone dot, a
 * 1-bit pixel, a toy brick or a letter tile, in the preset's colour.
 */
import { makeColorReader, type Rgb } from './color';
import { applyContrast, glyphFor, type Preset } from './presets';

/** Cell width in css px at the reference 130 columns, per kind. */
const BASE_CELL = { ramp: 5, tiles: 6.5, dots: 5, dither: 3.2, lego: 5.5, braille: 4 } as const;
// 8x8 ordered thresholds for the 1-bit dither.
const BAYER8 = (() => {
  const m = [0];
  for (let size = 1; size < 8; size *= 2) {
    const next: number[] = [];
    for (let y = 0; y < size * 2; y++) {
      for (let x = 0; x < size * 2; x++) {
        const base = m[(y % size) * size + (x % size)] * 4;
        const quad = (y < size ? 0 : 2) + (x < size ? 0 : 1);
        next.push(base + [0, 2, 3, 1][quad]);
      }
    }
    m.splice(0, m.length, ...next);
  }
  return m.map((v) => (v + 0.5) / 64);
})();

let reader: ReturnType<typeof makeColorReader> | null = null;
let sampler: CanvasRenderingContext2D | null = null;

const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** A cheap per-cell hash, so scatter is the same on every redraw. */
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function sampleRgb(img: CanvasImageSource, w: number, h: number): Uint8ClampedArray | null {
  sampler ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!sampler) return null;
  sampler.canvas.width = w;
  sampler.canvas.height = h;
  sampler.imageSmoothingQuality = 'high';
  sampler.drawImage(img, 0, 0, w, h);
  try {
    return sampler.getImageData(0, 0, w, h).data;
  } catch {
    return null; // a cross-origin image would taint the canvas
  }
}

/** Raise saturation by `boost` (0 to 100) about the colour's own grey. */
function saturate(c: Rgb, boost: number): Rgb {
  const grey = luma(c);
  const k = 1 + boost / 100;
  return c.map((v) => Math.min(1, Math.max(0, grey + (v - grey) * k))) as Rgb;
}

export interface GlyphTheme {
  /** The theme's paper and its dither ramp, shadow to highlight. */
  paper: string;
  ramp: string[];
  font: string;
}

/** Draw `img` into `canvas` in `preset`'s look, sized to the canvas's css box. */
export function drawGlyphs(canvas: HTMLCanvasElement, img: CanvasImageSource, preset: Preset, theme: GlyphTheme) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  reader ??= makeColorReader();
  const read = reader;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(canvas.clientWidth * dpr);
  const H = Math.round(canvas.clientHeight * dpr);
  const cw = Math.max(2, Math.round(BASE_CELL[preset.kind] * (130 / preset.cols) * dpr));
  const ch = Math.max(2, Math.round(cw / preset.aspect));
  const cols = Math.floor(W / cw);
  const rows = Math.floor(H / ch);
  if (cols < 2 || rows < 2) return false;

  const data = sampleRgb(img, cols, rows);
  if (!data) return false;

  // Brightness per cell, levelled to the 2nd and 98th percentiles, then the preset's contrast.
  const lum = new Float32Array(cols * rows);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = luma([data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255]);
  }
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
  const hi = sorted[Math.floor(sorted.length * 0.98)] ?? 1;
  const range = Math.max(hi - lo, 0.05);
  for (let i = 0; i < lum.length; i++) {
    let v = Math.min(1, Math.max(0, (lum[i] - lo) / range));
    v = applyContrast(v, preset.contrast);
    lum[i] = preset.invert ? 1 - v : v;
  }

  const paperCss = preset.paper === 'theme' ? theme.paper : preset.paper;
  const paper = read(paperCss, [1, 1, 1]);
  // On a light background a glyph carries the photo's darks; on a dark one (or over the photo)
  // its lights.
  const lightPaper = !preset.overlay && luma(paper) > 0.5;
  const ramp = theme.ramp.map((c) => read(c, [0, 0, 0]));
  const stops = preset.colour.mode === 'palette' ? preset.colour.stops.map((c) => read(c, [1, 1, 1])) : [];
  const mono: Rgb = preset.colour.mode === 'mono' ? read(preset.colour.color, [1, 1, 1]) : [1, 1, 1];
  const tint = preset.colour.mode === 'source' && preset.colour.tint ? read(preset.colour.tint, [1, 1, 1]) : null;

  const colourAt = (i: number, v: number): Rgb => {
    const c = preset.colour;
    if (c.mode === 'mono') return mono;
    const b = lum[i];
    if (c.mode === 'palette') return stops[Math.min(stops.length - 1, Math.floor(b * stops.length))];
    if (c.mode === 'theme') {
      // Light paper: shadow to the fourth step by ink; dark paper: second step up by brightness.
      const t = lightPaper ? 1 - v : b;
      return ramp[Math.min(ramp.length - 1, (lightPaper ? 0 : 1) + Math.floor(t * (ramp.length - 1)))];
    }
    let rgb = saturate([data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255], c.boost);
    if (tint) rgb = mix(rgb, [rgb[0] * tint[0], rgb[1] * tint[1], rgb[2] * tint[2]], 0.6);
    return rgb;
  };

  canvas.width = W;
  canvas.height = H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (preset.overlay) {
    ctx.drawImage(img, 0, 0, W, H);
    ctx.globalCompositeOperation = preset.overlay.blend;
  } else {
    ctx.fillStyle = paperCss;
    ctx.fillRect(0, 0, W, H);
  }

  const ox = Math.floor((W - cols * cw) / 2);
  const oy = Math.floor((H - rows * ch) / 2);
  ctx.font = `${Math.round(ch * (preset.kind === 'tiles' ? 0.62 : 0.95))}px ${theme.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const v = lightPaper ? 1 - lum[i] : lum[i];
      let x = ox + c * cw;
      let y = oy + r * ch;
      if (preset.kind !== 'lego' && preset.kind !== 'tiles') {
        if (v * 100 < preset.cutoff) continue;
        if (preset.scatter && hash(c, r) < preset.scatter / 100) {
          x += (hash(r, c) - 0.5) * cw;
          y += (hash(c + 7, r + 3) - 0.5) * ch;
        }
      }
      if (preset.overlay) {
        const { opacity, fade } = preset.overlay;
        ctx.globalAlpha = opacity * (1 - fade + fade * v);
      }
      const colour = colourAt(i, v);
      ctx.fillStyle = css(colour);

      switch (preset.kind) {
        case 'ramp': {
          const glyph = glyphFor(preset.ramp, v);
          if (glyph !== ' ') ctx.fillText(glyph, x + cw / 2, y + ch / 2);
          break;
        }
        case 'dots': {
          const radius = Math.sqrt(v) * cw * 0.5;
          if (radius < 0.4) break;
          ctx.beginPath();
          ctx.arc(x + cw / 2, y + ch / 2, radius, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'dither':
          if (v > BAYER8[(r % 8) * 8 + (c % 8)]) ctx.fillRect(x, y, cw, ch);
          break;
        case 'lego': {
          // A brick in the photo's colour, snapped to a few levels, with a stud on top.
          const base = colour.map((k) => Math.round(k * 5) / 5) as Rgb;
          ctx.fillStyle = css(mix(base, [0, 0, 0], 0.25));
          ctx.fillRect(x, y, cw, ch);
          ctx.fillStyle = css(base);
          ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
          ctx.fillStyle = css(mix(base, [1, 1, 1], 0.2));
          ctx.beginPath();
          ctx.arc(x + cw / 2, y + ch / 2, cw * 0.28, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'tiles': {
          // A tile in the photo's colour (or its grey), a light letter on it: sparse on dark
          // tiles, dense on pale ones.
          const b = lum[i];
          if (preset.colour.mode === 'mono') ctx.fillStyle = css([b, b, b]);
          ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
          // Below the cutoff the tile stays blank.
          if (b * 100 < preset.cutoff) break;
          ctx.fillStyle = b > 0.6 ? 'rgb(20 20 26 / 0.7)' : 'rgb(250 250 249 / 0.8)';
          ctx.fillText(glyphFor(preset.ramp, b), x + cw / 2, y + ch / 2);
          break;
        }
        default:
          break;
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return true;
}
