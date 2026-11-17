/**
 * Fades cards in as they come into view: Photos on the wall, Post rows and Work tiles (any element
 * with `data-reveal`). They are hidden only once this script has run (`reveal-ready` on <html>),
 * so without script, or if it fails, everything simply shows.
 *
 * It works both ways: a card that scrolls fully off screen is hidden again, so it fades back in
 * whichever way it returns. Scrolling down, cards rise into place; scrolling up, they drop into
 * place from above. Cards that arrive together come in a beat apart, nearest the edge they enter
 * from first.
 */
const STAGGER_MS = 60;
const MAX_STAGGER = 5;

export function initReveal() {
  const root = document.documentElement;
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!items.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Reveal once a card is a little way inside the viewport, from either edge.
  const enter = new IntersectionObserver(
    (entries) => {
      const arriving = entries.filter((entry) => entry.isIntersecting && !entry.target.classList.contains('is-revealed'));
      const fromAbove = arriving.filter((e) => e.target.getAttribute('data-reveal-from') === 'above');
      const fromBelow = arriving.filter((e) => e.target.getAttribute('data-reveal-from') !== 'above');
      const byPosition = (a: IntersectionObserverEntry, b: IntersectionObserverEntry) =>
        a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left;
      // Nearest the entering edge first: top-down from below, bottom-up from above.
      const ordered = [...fromBelow.sort(byPosition), ...fromAbove.sort(byPosition).reverse()];
      ordered.forEach((entry, i) => {
        const el = entry.target as HTMLElement;
        el.style.setProperty('--reveal-delay', `${Math.min(i, MAX_STAGGER) * STAGGER_MS}ms`);
        el.classList.add('is-revealed');
      });
    },
    { rootMargin: '-8% 0px -8% 0px', threshold: 0.05 },
  );

  // Hide a card again only once it is wholly off screen, remembering which side it left by.
  const exit = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const above = entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
        el.setAttribute('data-reveal-from', above ? 'above' : 'below');
        el.style.setProperty('--reveal-delay', '0ms');
        el.classList.remove('is-revealed');
      }
    },
    { threshold: 0 },
  );

  items.forEach((el) => {
    enter.observe(el);
    exit.observe(el);
  });
  root.classList.add('reveal-ready');
}
