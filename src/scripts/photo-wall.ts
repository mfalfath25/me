/**
 * The photo wall's two behaviours.
 *
 * 1. Braille at rest: each card's photo is redrawn as coloured Unicode braille on its canvas once
 *    its (lazy) image has loaded. It is redrawn on resize and theme change.
 *    The `is-dithered` class (set only after a successful draw) is what hides the photo, so a
 *    failed draw or no script leaves the plain photo showing.
 * 2. The hover, set per wall by `data-hover` (site.cardHover): the spring in card-hover.ts. In
 *    both the braille gives way to the photo (CSS).
 */
import { type DitherInk, drawDither, readDitherInk } from './dither';
import { drawGlyphs } from './glyphs';
import { bindHover, type Hover } from './card-hover';
import { findPreset, type Preset, PRESET_EVENT, storedPreset } from './presets';

// ------------------------------------------------------------------ dither

let ink: DitherInk | null = null;
let preset: Preset = storedPreset();
let font = '';
let listenersBound = false;
const drawn = new Set<HTMLCanvasElement>();
const lastSize = new WeakMap<HTMLCanvasElement, string>();

/** The card's look under the current Preset: braille through dither.ts, the rest through glyphs.ts. */
function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, theme: DitherInk): boolean {
  if (preset.kind === 'braille') {
    if (preset.colour.mode !== 'palette') return drawDither(canvas, img, theme);
    const { stops } = preset.colour;
    const paper = preset.paper === 'theme' ? theme.paper : preset.paper;
    return drawDither(canvas, img, { ramp: [stops[0]!, ...stops], paper, lightPaper: false });
  }
  font ||= getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
  return drawGlyphs(canvas, img, preset, { paper: theme.paper, ramp: theme.ramp, font });
}

function dither(card: HTMLElement, force = false) {
  const img = card.querySelector('img');
  const canvas = card.querySelector<HTMLCanvasElement>('.shot__dither');
  if (!img || !canvas || !img.complete || !img.naturalWidth) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const sizeKey = `${w}x${h}`;
  if (!force && lastSize.get(canvas) === sizeKey) return;
  ink ??= readDitherInk();
  if (draw(canvas, img, ink)) {
    drawn.add(canvas);
    lastSize.set(canvas, sizeKey);
    card.classList.remove('is-dither-failed');
    card.classList.add('is-dithered');
  } else {
    card.classList.add('is-dither-failed');
  }
}

function watchDither(card: HTMLElement, resized: ResizeObserver) {
  const img = card.querySelector('img');
  if (!img) return;
  resized.observe(card);
  // Lazy loading already defers offscreen images, so dither each card as its image arrives.
  if (img.complete && img.naturalWidth) dither(card);
  else img.addEventListener('load', () => dither(card), { once: true });
}

function redrawAll() {
  ink = readDitherInk();
  drawn.forEach((canvas) => {
    const card = canvas.closest<HTMLElement>('.shot__card');
    if (card) dither(card, true);
  });
}

// --------------------------------------------------------------------- init

/**
 * Row-major masonry: the wall is a grid of 4px rows (`.is-masonry`) and each card spans as many
 * rows as it is tall, so the Owner's order reads left to right, then down. The cards' heights are
 * known before their images load (aspect-ratio), so one measure per width is enough.
 */
const ROW = 4;
function layoutMasonry(wall: HTMLElement) {
  const shots = [...wall.querySelectorAll<HTMLElement>(':scope > .shot')];
  const place = () => {
    wall.classList.add('is-masonry');
    // Batch DOM writes/reads/writes to trigger a single layout instead of one per card.
    for (const shot of shots) shot.style.gridRowEnd = '';
    const heights = shots.map((shot) => shot.offsetHeight);
    for (let i = 0; i < shots.length; i++) {
      shots[i]!.style.gridRowEnd = `span ${Math.ceil(heights[i]! / ROW)}`;
    }
  };
  let frame = 0;
  let width = 0;
  new ResizeObserver(([entry]) => {
    const next = Math.round(entry!.contentRect.width);
    if (next === width) return;
    width = next;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  }).observe(wall);
  place();
}

export function initPhotoWalls() {
  const walls = document.querySelectorAll<HTMLElement>('[data-photo-wall]:not([data-wall-ready])');
  if (walls.length === 0) return;

  let pending = 0;
  const queued = new Set<HTMLElement>();
  const resized = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      const img = card.querySelector('img');
      if (card.classList.contains('is-dithered') || (img?.complete && img.naturalWidth)) queued.add(card);
    }
    if (queued.size === 0) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      queued.forEach((card) => dither(card));
      queued.clear();
    });
  });

  walls.forEach((wall) => {
    wall.dataset.wallReady = '';
    layoutMasonry(wall);
    const hover: Hover = wall.dataset.hover === 'foil' ? 'foil' : 'pop';
    wall.querySelectorAll<HTMLElement>('.shot__card').forEach((card) => {
      watchDither(card, resized);
      bindHover(card, hover);
    });
  });

  if (listenersBound) return;
  listenersBound = true;
  new MutationObserver(redrawAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);
  document.addEventListener(PRESET_EVENT, (event) => {
    preset = findPreset((event as CustomEvent<string>).detail);
    redrawAll();
  });
}
