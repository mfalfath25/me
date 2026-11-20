/**
 * Global link click tracking via Umami Cloud (`window.umami.track`).
 *
 * Uses a single delegated listener for primary clicks and middle-clicks on any `<a>` element.
 * For same-tab navigations (like project cards, blog posts, and nav links), briefly awaits
 * `umami.track()` (capped at 180ms) before navigating so the browser does not abort the request
 * on page unload. No-ops silently when Umami is not loaded.
 */

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number | boolean>) => Promise<unknown> | void;
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
const NAV_TIMEOUT_MS = 180;

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

function labelFor(anchor: HTMLAnchorElement): string {
  return (
    anchor.getAttribute('aria-label') ||
    anchor.dataset.title ||
    anchor.querySelector('h2, h3, .work__title, .row__title, .links__title')?.textContent ||
    anchor.textContent ||
    ''
  );
}

function isSameTabNavigation(event: MouseEvent, anchor: HTMLAnchorElement, rawHref: string): boolean {
  if (event.type !== 'click' || event.defaultPrevented) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return false;
  return true;
}

let bound = false;

export function initLinkTracking() {
  if (bound) return;
  bound = true;

  const onClick = (event: MouseEvent) => {
    const umami = window.umami;
    if (!umami) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    if (event.type === 'click' && event.button !== 0) return;

    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const rawHref = anchor.getAttribute('href');
    if (!rawHref) return;

    const data = describeLink(
      rawHref,
      labelFor(anchor),
      location.origin,
      location.pathname,
      anchor.hasAttribute('data-lightbox'),
    );

    if (isSameTabNavigation(event, anchor, rawHref)) {
      event.preventDefault();
      const destination = anchor.href;
      const done = Promise.resolve(umami.track('link-click', { ...data })).catch(() => undefined);
      void Promise.race([done, new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS))]).finally(() => {
        location.assign(destination);
      });
      return;
    }

    void Promise.resolve(umami.track('link-click', { ...data })).catch(() => undefined);
  };

  // Bubble phase so lightbox.ts can call preventDefault() first on photo cards.
  document.addEventListener('click', onClick);
  document.addEventListener('auxclick', onClick, { passive: true });
}
