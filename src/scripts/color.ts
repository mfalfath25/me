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
