/** sRGB channels, 0 to 1. */
export type Rgb = [number, number, number];

/** Resolve any CSS colour (oklch included) to sRGB 0..1 through a 1px 2D canvas. */
export function makeColorReader() {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  return (css: string, fallback: Rgb): Rgb => {
    if (!ctx || !css) return fallback;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255];
  };
}

/**
 * Low and high percentile bounds of values in 0..1, via a 256-bin histogram (O(N), no sort).
 * Used to stretch photo luminance before dithering.
 */
export function percentileRange(values: Float32Array, low = 0.02, high = 0.98): [number, number] {
  const n = values.length;
  if (n === 0) return [0, 1];
  const bins = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const b = Math.min(255, Math.max(0, Math.round(values[i]! * 255)));
    bins[b]!++;
  }
  const loTarget = Math.floor(n * low);
  const hiTarget = Math.floor(n * high);
  let acc = 0;
  let lo = 0;
  let hi = 1;
  let foundLo = false;
  for (let b = 0; b < 256; b++) {
    acc += bins[b]!;
    if (!foundLo && acc > loTarget) {
      lo = b / 255;
      foundLo = true;
    }
    if (acc > hiTarget) {
      hi = b / 255;
      break;
    }
  }
  return [lo, hi];
}
