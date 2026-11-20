/**
 * Global link click tracking via Umami Cloud (`window.umami.track`).
 *
 * Uses a single delegated listener for primary clicks and middle-clicks on any `<a>` element.
 * No-ops silently when Umami is not loaded (e.g. local dev or blocked by a visitor's blocker).
 */

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

export type LinkKind = 'internal' | 'outbound' | 'mailto' | 'lightbox';

export interface LinkEvent {
  href: string;
  label: string;
  kind: LinkKind;
  from: string;
}

const MAX_LABEL = 80;

/** Classify a clicked anchor and extract a clean payload for Umami. */
export function describeLink(
  rawHref: string,
  label: string,
  origin: string,
  fromPath: string,
  isLightbox = false,
): LinkEvent {
  const cleanLabel = label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

  if (rawHref.startsWith('mailto:')) {
    return { href: rawHref, label: cleanLabel || rawHref, kind: 'mailto', from: fromPath };
  }

  let href = rawHref;
  let kind: LinkKind = isLightbox ? 'lightbox' : 'internal';
  try {
    const url = new URL(rawHref, origin);
    if (url.origin === origin) {
      href = `${url.pathname}${url.search}${url.hash}`;
    } else {
      href = url.href;
      kind = 'outbound';
    }
  } catch {
    /* keep raw href */
  }

  return { href, label: cleanLabel || href, kind, from: fromPath };
}

function trackAnchor(anchor: HTMLAnchorElement) {
  const umami = window.umami;
  if (!umami) return;
  const rawHref = anchor.getAttribute('href');
  if (!rawHref) return;
  const label = anchor.getAttribute('aria-label') || anchor.dataset.title || anchor.textContent || '';
  const data = describeLink(rawHref, label, location.origin, location.pathname, anchor.hasAttribute('data-lightbox'));
  umami.track('link-click', { ...data });
}

let bound = false;

export function initLinkTracking() {
  if (bound) return;
  bound = true;

  const onClick = (event: MouseEvent) => {
    // Primary click or middle-click (auxclick button 1).
    if (event.type === 'auxclick' && event.button !== 1) return;
    if (event.type === 'click' && event.button !== 0) return;
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    trackAnchor(anchor);
  };

  document.addEventListener('click', onClick, { capture: true, passive: true });
  document.addEventListener('auxclick', onClick, { capture: true, passive: true });
}
