/**
 * Photo lightbox and slideshow. Progressive enhancement over `a[data-lightbox]` cards, which
 * link to a large rendition and so still work without script.
 *
 * Opening morphs the card into the slide: the frame starts at the card's box with the card's
 * live 3D tilt, and the card's dither dissolves into the photo as the plane flattens and
 * grows. The large rendition swaps in once decoded.
 *
 * In the slideshow, ArrowLeft / ArrowRight, the Previous / Next buttons under the photo and a
 * swipe on touch all change photo with a short fade: the old photo fades out quickly, the new
 * one fades in through a light blur. Pressing again mid-fade cuts straight to the next photo. A click anywhere but the photo and its controls, Escape, or Close
 * closes it, morphing back into the current photo's card. Reduced motion: no morph, no fade.
 */
import { cardPose, restCard } from './card-hover';

const OPEN_MS = 440;
const CLOSE_MS = 320;
const FADE_OUT_MS = 110;
const FADE_IN_MS = 260;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
const PERSPECTIVE = 900;

interface Parts {
  dialog: HTMLDialogElement;
  frame: HTMLElement;
  img: HTMLImageElement;
  dither: HTMLCanvasElement;
  title: HTMLElement;
  place: HTMLElement;
  count: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
}

interface Labels {
  close: string;
  prev: string;
  next: string;
}

let parts: Parts | null = null;
let cards: HTMLAnchorElement[] = [];
let index = 0;
let busy = false;
let token = 0;
let swap = 0;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const current = () => cards[index];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(className: string, label: string) {
  const node = el('button', className);
  node.type = 'button';
  node.textContent = label;
  return node;
}

function build(labels: Labels): Parts {
  const dialog = el('dialog', 'lightbox');
  const figure = el('figure', 'lightbox__figure');
  const frame = el('div', 'lightbox__frame');
  const img = el('img', 'lightbox__img');
  const dither = el('canvas', 'lightbox__dither');
  dither.setAttribute('aria-hidden', 'true');
  frame.append(img, dither);

  const bar = el('div', 'lightbox__bar');
  const caption = el('figcaption', 'lightbox__caption');
  caption.setAttribute('aria-live', 'polite');
  const title = el('span', 'lightbox__title');
  const place = el('span', 'lightbox__place');
  caption.append(title, place);

  const controls = el('div', 'lightbox__controls');
  const prev = button('lightbox__btn', labels.prev);
  const count = el('span', 'lightbox__count');
  const next = button('lightbox__btn', labels.next);
  controls.append(prev, count, next);
  bar.append(caption, controls);
  figure.append(frame, bar);

  const close = button('lightbox__close', labels.close);
  dialog.append(figure, close);
  document.body.append(dialog);

  // Anything but the photo and its controls closes: the backdrop, the caption, Close.
  dialog.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target === img || controls.contains(target)) return;
    void closeLightbox();
  });
  prev.addEventListener('click', () => void go(-1));
  next.addEventListener('click', () => void go(1));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      void go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      void go(1);
    }
  });
  // Escape: the animated close instead of the instant native one.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void closeLightbox();
  });

  // Swipe on touch: distance or a quick flick.
  let startX = 0;
  let startT = 0;
  frame.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    startX = event.clientX;
    startT = performance.now();
  });
  frame.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse' || !startT) return;
    const dx = event.clientX - startX;
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - startT);
    startT = 0;
    if (Math.abs(dx) > 48 || (Math.abs(dx) > 12 && velocity > 0.11)) void go(dx < 0 ? 1 : -1);
  });

  window.addEventListener('resize', () => {
    if (dialog.open) fit();
  });

  return { dialog, frame, img, dither, title, place, count, prev, next };
}

/** Size the frame to fit the viewport at the current photo's ratio. */
function fit() {
  if (!parts) return;
  const card = current();
  const w = Number(card.dataset.w) || 3;
  const h = Number(card.dataset.h) || 2;
  const pad = window.innerWidth < 768 ? 16 : 64;
  const maxW = window.innerWidth - pad * 2;
  const maxH = window.innerHeight - pad * 2 - 48; // room for the caption and controls
  const scale = Math.min(maxW / w, maxH / h, 1.6);
  parts.frame.style.inlineSize = `${Math.round(w * scale)}px`;
  parts.frame.style.blockSize = `${Math.round(h * scale)}px`;
}

/** Fill the slide from the current card: its loaded thumbnail first, the large file once decoded. */
function fill() {
  if (!parts) return;
  const card = current();
  const thumb = card.querySelector('img');
  const { img, title, place, count, dialog } = parts;
  const mine = ++token;
  img.src = thumb ? thumb.currentSrc || thumb.src : card.href;
  img.alt = thumb?.alt ?? '';
  title.textContent = card.dataset.title ?? '';
  place.textContent = card.dataset.place ?? '';
  count.textContent = `${index + 1} / ${cards.length}`;
  dialog.setAttribute('aria-label', card.dataset.title ?? img.alt);
  const multiple = cards.length > 1;
  parts.prev.hidden = !multiple;
  parts.next.hidden = !multiple;
  count.hidden = !multiple;
  fit();

  const hi = new Image();
  hi.src = card.href;
  hi.decode()
    .then(() => {
      if (mine === token && dialog.open) img.src = card.href;
    })
    .catch(() => {
      /* keep the thumbnail */
    });
}

/** The keyframe that makes the frame sit exactly on the card, tilted as the card is. */
function cardFrame(card: HTMLElement, frame: HTMLElement, withTilt: boolean): Keyframe {
  const from = card.getBoundingClientRect();
  const to = frame.getBoundingClientRect();
  const pose = withTilt ? cardPose(card) : { rx: 0, ry: 0, s: 1 };
  // Measure the card's untransformed box: its layout size, centred where it is drawn.
  const w = card.offsetWidth * pose.s;
  const k = w / to.width;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${k}) perspective(${PERSPECTIVE / k}px) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg)`,
  };
}

/** Copy the card's dither onto the slide, if the card is showing them. */
function copyDither(card: HTMLElement): number {
  if (!parts) return 0;
  const source = card.querySelector<HTMLCanvasElement>('.shot__dither');
  if (!source || !card.classList.contains('is-dithered')) return 0;
  const shown = Number.parseFloat(getComputedStyle(source).opacity) || 0;
  if (shown < 0.05) return 0;
  const { dither } = parts;
  dither.width = source.width;
  dither.height = source.height;
  dither.getContext('2d')?.drawImage(source, 0, 0);
  return shown;
}

async function openLightbox(card: HTMLAnchorElement, labels: Labels) {
  if (busy) return;
  parts ??= build(labels);
  const wall = card.closest('[data-photo-wall]');
  cards = wall ? [...wall.querySelectorAll<HTMLAnchorElement>('a[data-lightbox]')] : [card];
  index = Math.max(0, cards.indexOf(card));
  const { dialog, frame, img, dither } = parts;
  dialog.classList.remove('is-closing');
  fill();
  // The thumbnail is cached; give it a moment to decode so the morph starts with pixels.
  await Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 160))]);

  dialog.showModal();
  const dots = copyDither(card);
  const start = cardFrame(card, frame, true);
  restCard(card);

  if (reducedMotion()) return;
  busy = true;
  const morph = frame.animate([start, { transform: 'none' }], { duration: OPEN_MS, easing: EASE_OUT });
  if (dots) {
    dither.animate(
      [
        { opacity: dots, filter: 'blur(0px)' },
        { opacity: 0, filter: 'blur(3px)', offset: 0.7 },
        { opacity: 0, filter: 'blur(3px)' },
      ],
      { duration: OPEN_MS, easing: 'ease-out' },
    );
  }
  await morph.finished.catch(() => undefined);
  busy = false;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function go(step: number) {
  if (!parts || busy || cards.length < 2) return;
  index = (index + step + cards.length) % cards.length;
  if (reducedMotion()) {
    fill();
    return;
  }
  const { img } = parts;
  const mine = ++swap;
  // Fade out from wherever the photo is now, so a quick second press never flashes.
  const shown = Number.parseFloat(getComputedStyle(img).opacity) || 0;
  img.getAnimations().forEach((animation) => animation.cancel());
  await img
    .animate([{ opacity: shown }, { opacity: 0 }], {
      duration: FADE_OUT_MS * shown,
      easing: EASE_OUT,
      fill: 'forwards',
    })
    .finished.catch(() => undefined);
  if (mine !== swap) return;
  fill();
  await Promise.race([img.decode().catch(() => undefined), wait(120)]);
  if (mine !== swap) return;
  img.getAnimations().forEach((animation) => animation.cancel());
  img.animate(
    [
      { opacity: 0, filter: 'blur(2px)' },
      { opacity: 1, filter: 'blur(0px)' },
    ],
    { duration: FADE_IN_MS, easing: EASE_OUT },
  );
}

async function closeLightbox() {
  if (!parts || busy || !parts.dialog.open) return;
  const { dialog, frame, dither } = parts;
  const card = current();
  busy = true;
  dialog.classList.add('is-closing');

  if (!reducedMotion()) {
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const end = cardFrame(card, frame, false);
    const dots = copyDither(card);
    const back = frame.animate([{ transform: 'none' }, end], {
      duration: CLOSE_MS,
      easing: EASE_IN_OUT,
      fill: 'forwards',
    });
    if (dots) {
      dither.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: dots }], {
        duration: CLOSE_MS,
        easing: 'ease-out',
        fill: 'forwards',
      });
    }
    await back.finished.catch(() => undefined);
    back.cancel();
    dither.getAnimations().forEach((a) => a.cancel());
  }

  dialog.close();
  dialog.classList.remove('is-closing');
  busy = false;
  card.focus({ preventScroll: true });
}

export function initLightbox() {
  const wall = document.querySelector<HTMLElement>('[data-photo-wall]');
  if (!wall || document.documentElement.dataset.lightbox === 'ready') return;
  document.documentElement.dataset.lightbox = 'ready';
  const labels: Labels = {
    close: wall.dataset.labelClose ?? 'Close',
    prev: wall.dataset.labelPrev ?? 'Previous',
    next: wall.dataset.labelNext ?? 'Next',
  };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // new tab etc.
    const card = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-lightbox]');
    if (!card) return;
    event.preventDefault();
    void openLightbox(card, labels);
  });
}
