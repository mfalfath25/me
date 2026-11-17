/**
 * The card hover shared by the photo wall and the Works tiles, set per wall by `data-hover`
 * (site.cardHover). Both run through a spring, so the card has weight instead of snapping to the
 * pointer, and only on a hovering, fine pointer.
 * - `pop`: the card eases up a little and settles, with no overshoot.
 * - `foil`: the card lifts and tilts toward the cursor like a 3D plane, with a radial glare and a
 *   soft holographic sheen centred on the cursor.
 * The lifted card, and its `.shot` or `.work` tile, get `is-lifted`. Reduced motion: no spring.
 */
const MAX_TILT = 9; // degrees at the card's edge
const PERSPECTIVE = 900;

export type Hover = 'pop' | 'foil';

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
  card.closest('.shot, .work')?.classList.remove('is-lifted');
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

/** Spring `card` on hover. `trigger` takes the pointer (by default the card itself), so a tile can
 *  lift its picture while the whole tile is the hover target. */
export function bindHover(card: HTMLElement, hover: Hover, trigger: HTMLElement = card) {
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

  trigger.addEventListener('pointerenter', (event) => {
    if (!active() || event.pointerType !== 'mouse') return;
    card.classList.add('is-lifted');
    card.closest('.shot, .work')?.classList.add('is-lifted');
    state.target.s = LIFT;
    drive(card, state);
  });

  trigger.addEventListener('pointermove', (event) => {
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

  trigger.addEventListener('pointerleave', () => {
    if (!states.get(card) || state.target.s === 1) return;
    state.target = { rx: 0, ry: 0, s: 1 };
    drive(card, state);
  });

  // Press feedback: the lifted card gives a little under the pointer.
  trigger.addEventListener('pointerdown', () => {
    if (!active() || state.target.s === 1) return;
    state.target.s = LIFT - (hover === 'pop' ? 0.02 : 0.03);
    drive(card, state);
  });
  trigger.addEventListener('pointerup', () => {
    if (!active() || state.target.s === 1) return;
    state.target.s = LIFT;
    drive(card, state);
  });
}
