/**
 * The photo wall's two behaviours.
 *
 * 1. Braille at rest: each card's photo is redrawn as coloured Unicode braille on its canvas once
 *    its (lazy) image has loaded. It is redrawn on resize and theme change.
 *    The `is-dithered` class (set only after a successful draw) is what hides the photo, so a
 *    failed draw or no script leaves the plain photo showing.
 * 2. The hover, set per wall by `data-hover` (site.cardHover). In both the braille gives way to
 *    the photo (CSS). Both run through a spring, so the card has weight instead of snapping to the
 *    pointer, and only on a hovering, fine pointer.
 *    - `pop`: the card eases up a little and settles, with no overshoot.
 *    - `foil`: the card lifts and tilts toward the cursor like a 3D plane, with a radial glare and
 *      a soft holographic sheen centred on the cursor.
 *    Reduced motion: no spring; the photo still shows through on hover.
 */
import { type DitherInk, drawDither, readDitherInk } from './dither';

const MAX_TILT = 9; // degrees at the card's edge
const PERSPECTIVE = 900;

type Hover = 'pop' | 'foil';

/** Per hover: how far the card lifts, and its spring (the pop is a touch past critically damped, so
 *  it settles without a bounce). */
const FEEL: Record<Hover, { lift: number; stiffness: number; damping: number }> = {
  pop: { lift: 1.02, stiffness: 260, damping: 24 },
  foil: { lift: 1.045, stiffness: 260, damping: 24 },
};

interface Pose {
  rx: number;
  ry: number;
  s: number;
}

interface CardState {
  pose: Pose;
  velocity: Pose;
  target: Pose;
  raf: number;
  last: number;
  feel: (typeof FEEL)[Hover];
}

const states = new WeakMap<HTMLElement, CardState>();
const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/** The card's current tilt and lift, used by the lightbox to morph out of it. */
export function cardPose(card: HTMLElement): Pose {
  return { ...(states.get(card)?.pose ?? { rx: 0, ry: 0, s: 1 }) };
}

/** Drop a card back to rest at once (the lightbox has taken over its image). */
export function restCard(card: HTMLElement) {
  const state = states.get(card);
  if (!state) return;
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  state.pose = { rx: 0, ry: 0, s: 1 };
  state.velocity = { rx: 0, ry: 0, s: 0 };
  state.target = { rx: 0, ry: 0, s: 1 };
  card.style.transform = '';
  card.classList.remove('is-lifted');
  card.closest('.shot')?.classList.remove('is-lifted');
}

// ------------------------------------------------------------------ dither

let ink: DitherInk | null = null;
const drawn = new Set<HTMLCanvasElement>();

function dither(card: HTMLElement) {
  const img = card.querySelector('img');
  const canvas = card.querySelector<HTMLCanvasElement>('.shot__dither');
  if (!img || !canvas || !img.complete || !img.naturalWidth) return;
  ink ??= readDitherInk();
  if (drawDither(canvas, img, ink)) {
    drawn.add(canvas);
    card.classList.add('is-dithered');
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
    if (card) dither(card);
  });
}

// -------------------------------------------------------------------- tilt

function step(card: HTMLElement, state: CardState, now: number) {
  const dt = Math.min((now - state.last) / 1000, 1 / 30);
  state.last = now;
  let moving = false;
  for (const key of ['rx', 'ry', 's'] as const) {
    const force =
      (state.target[key] - state.pose[key]) * state.feel.stiffness - state.velocity[key] * state.feel.damping;
    state.velocity[key] += force * dt;
    state.pose[key] += state.velocity[key] * dt;
    const scale = key === 's' ? 0.0005 : 0.02;
    if (Math.abs(state.velocity[key]) > scale || Math.abs(state.target[key] - state.pose[key]) > scale) moving = true;
  }
  const { rx, ry, s } = state.pose;
  card.style.transform = `perspective(${PERSPECTIVE}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`;

  if (moving) {
    state.raf = requestAnimationFrame((t) => step(card, state, t));
  } else {
    state.raf = 0;
    if (state.target.s === 1) restCard(card);
  }
}

function drive(card: HTMLElement, state: CardState) {
  if (state.raf) return;
  state.last = performance.now();
  state.raf = requestAnimationFrame((t) => step(card, state, t));
}

function bindHover(card: HTMLElement, hover: Hover) {
  const feel = FEEL[hover];
  const LIFT = feel.lift;
  const state: CardState = {
    pose: { rx: 0, ry: 0, s: 1 },
    velocity: { rx: 0, ry: 0, s: 0 },
    target: { rx: 0, ry: 0, s: 1 },
    raf: 0,
    last: 0,
    feel,
  };
  states.set(card, state);
  const figure = card.parentElement ?? card;
  const active = () => fine.matches && !reduce.matches;

  card.addEventListener('pointerenter', (event) => {
    if (!active() || event.pointerType !== 'mouse') return;
    card.classList.add('is-lifted');
    card.closest('.shot')?.classList.add('is-lifted');
    state.target.s = LIFT;
    drive(card, state);
  });

  card.addEventListener('pointermove', (event) => {
    if (hover !== 'foil' || !active() || event.pointerType !== 'mouse') return;
    // Measure against the untransformed figure, so the tilt never feeds back into itself.
    const box = figure.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - box.top) / card.offsetHeight));
    state.target.ry = (nx - 0.5) * 2 * MAX_TILT;
    state.target.rx = (0.5 - ny) * 2 * MAX_TILT;
    card.style.setProperty('--gx', `${(nx * 100).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(ny * 100).toFixed(1)}%`);
    drive(card, state);
  });

  card.addEventListener('pointerleave', () => {
    if (!states.get(card) || state.target.s === 1) return;
    state.target = { rx: 0, ry: 0, s: 1 };
    drive(card, state);
  });

  // Press feedback: the lifted card gives a little under the pointer.
  card.addEventListener('pointerdown', () => {
    if (!active() || state.target.s === 1) return;
    state.target.s = LIFT - (hover === 'pop' ? 0.02 : 0.03);
    drive(card, state);
  });
  card.addEventListener('pointerup', () => {
    if (!active() || state.target.s === 1) return;
    state.target.s = LIFT;
    drive(card, state);
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
  const place = () => {
    wall.classList.add('is-masonry');
    for (const shot of wall.querySelectorAll<HTMLElement>(':scope > .shot')) {
      shot.style.gridRowEnd = '';
      shot.style.gridRowEnd = `span ${Math.ceil(shot.offsetHeight / ROW)}`;
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
      if (card.classList.contains('is-dithered')) queued.add(card);
    }
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      queued.forEach(dither);
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

  new MutationObserver(redrawAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);
}
