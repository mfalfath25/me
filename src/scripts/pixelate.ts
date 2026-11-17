/**
 * Pixelate: a Work's cover redrawn as a coarse mosaic of its own colours. The canvas holds one
 * pixel per block and CSS scales it up with `image-rendering: pixelated`, so a frame is a single
 * small drawImage. Nothing runs at rest; the blocks only change while a tile is resolving.
 */

/** Block size in css px at rest: a 48px thumbnail is 8 by 8 blocks. */
export const REST_BLOCK = 6;
/** The block sizes a tile steps through as it resolves to the photo (reversed on the way back). */
export const RESOLVE_STEPS = [REST_BLOCK, 4, 3, 2] as const;
/** How long each step holds, in ms. */
export const STEP_MS = 45;

/** Columns and rows of a `w` by `h` css box cut into `block` px squares (at least 1 each). */
export function mosaicSize(w: number, h: number, block: number): [number, number] {
  return [Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block))];
}

/** Draw `img` into `canvas` as `block` px blocks over a `w` by `h` css box, cropped like
 *  object-fit: cover. Returns false if the image cannot be drawn. */
export function drawMosaic(canvas: HTMLCanvasElement, img: HTMLImageElement, w: number, h: number, block: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !img.naturalWidth) return false;
  const [cols, rows] = mosaicSize(w, h, block);
  if (canvas.width !== cols) canvas.width = cols;
  if (canvas.height !== rows) canvas.height = rows;
  // Placed in destination space with the whole image as the source: a srcset image's natural size
  // is density-corrected, so source coordinates built from it would crop part of the bitmap.
  const scale = Math.max(cols / img.naturalWidth, rows / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(img, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
  return true;
}

