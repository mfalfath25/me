/**
 * The Works cards' thumbnails. Each cover rests as a coarse mosaic of its own colours (pixelate.ts),
 * drawn once. Hovering or focusing a card resolves it: the blocks shrink in a few quick steps, then
 * the photo shows through (`is-clear`). Leaving reverses it. The `is-pixelated` class, set only
 * after a good draw, is what hides the photo, so no script or a failed draw leaves the plain cover
 * showing. Reduced motion: no steps; the photo simply fades in. The marker scribble round each card is dealt
 * here, in px at the card's size (an SVG stretched to fit would draw its dashes wrong), and dealt
 * again once it has faded after each hover, so every hover draws a new one; CSS animates it.
 */
import { drawMosaic, REST_BLOCK, RESOLVE_STEPS, STEP_MS } from './pixelate';
import { scribble } from './scribble';

interface Tile {
  cover: HTMLElement;
  canvas: HTMLCanvasElement;
  img: HTMLImageElement;
  width: number;
  height: number;
  timer: number;
}

export function initWorkTiles() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tiles: Tile[] = [];

  const draw = (tile: Tile, block: number) => drawMosaic(tile.canvas, tile.img, tile.width, tile.height, block);

  const prepare = (tile: Tile) => {
    tile.width = tile.cover.clientWidth;
    tile.height = tile.cover.clientHeight;
    if (draw(tile, REST_BLOCK)) tile.cover.classList.add('is-pixelated');
  };

  /** Step the blocks toward the photo (`clear`) or back to rest. */
  const resolve = (tile: Tile, clear: boolean) => {
    window.clearTimeout(tile.timer);
    if (!tile.cover.classList.contains('is-pixelated')) return;
    if (reduce.matches) {
      tile.cover.classList.toggle('is-clear', clear);
      if (!clear) draw(tile, REST_BLOCK);
      return;
    }
    const steps = clear ? [...RESOLVE_STEPS] : [...RESOLVE_STEPS].reverse();
    if (!clear) tile.cover.classList.remove('is-clear');
    let i = 0;
    const next = () => {
      draw(tile, steps[i]!);
      i += 1;
      if (i < steps.length) tile.timer = window.setTimeout(next, STEP_MS);
      else if (clear) tile.timer = window.setTimeout(() => tile.cover.classList.add('is-clear'), STEP_MS);
    };
    next();
  };

  for (const cover of document.querySelectorAll<HTMLElement>('.work__cover')) {
    const canvas = cover.querySelector<HTMLCanvasElement>('.work__pixels');
    const img = cover.querySelector<HTMLImageElement>('img');
    const link = cover.closest<HTMLElement>('.work__link');
    if (!canvas || !img || !link) continue;
    const tile: Tile = { cover, canvas, img, width: 0, height: 0, timer: 0 };
    tiles.push(tile);
    link.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') resolve(tile, true);
    });
    link.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') resolve(tile, false);
    });
    link.addEventListener('focus', () => link.matches(':focus-visible') && resolve(tile, true));
    link.addEventListener('blur', () => resolve(tile, false));
    if (img.complete && img.naturalWidth) prepare(tile);
    else img.addEventListener('load', () => prepare(tile), { once: true });
  }

  // Redraw at rest when a tile changes size.
  const resized = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const tile = tiles.find((t) => t.cover === entry.target);
      if (!tile || !tile.cover.classList.contains('is-pixelated')) continue;
      if (Math.round(entry.contentRect.width) === Math.round(tile.width)) continue;
      prepare(tile);
    }
  });
  tiles.forEach((tile) => resized.observe(tile.cover));

  // The marker scribbles: a viewBox in px per card, a new mark dealt on load, on resize, and after
  // each hover once the old one has faded (dealing it during a hover would show it already drawn).
  const NS = 'http://www.w3.org/2000/svg';
  const deal = (svg: SVGSVGElement) => {
    const w = Math.round(svg.clientWidth);
    const h = Math.round(svg.clientHeight);
    if (!w || !h) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren(
      ...scribble(w, h).map((stroke) => {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', stroke.d);
        path.setAttribute('pathLength', '1');
        path.style.setProperty('--at', String(stroke.at));
        path.style.setProperty('--len', String(stroke.len));
        if (stroke.width) path.style.strokeWidth = String(stroke.width);
        return path;
      }),
    );
  };
  const svgs = document.querySelectorAll<SVGSVGElement>('.work > .scribble');
  const sized = new ResizeObserver((entries) => {
    for (const entry of entries) deal(entry.target as SVGSVGElement);
  });
  svgs.forEach((svg) => {
    const link = svg.parentElement?.querySelector<HTMLElement>('.work__link');
    deal(svg);
    sized.observe(svg);
    if (!link) return;
    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!link.matches(':hover, :focus-visible')) deal(svg);
      }, 400);
    };
    link.addEventListener('pointerleave', later);
    link.addEventListener('blur', later);
  });
}
