import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

/** `/writing/x` + `id` → `/id/writing/x`; default locale stays unprefixed. */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/**
 * Public form of a request path: no `.html`, no `/index`, no trailing slash.
 * (Builds emit `writing/x.html`; Cloudflare serves it at `/writing/x`.)
 */
export function cleanPath(pathname: string): string {
  const clean = pathname
    .replace(/\.html$/, '')
    .replace(/\/index$/, '')
    .replace(/\/$/, '');
  return clean || '/';
}

/** `/id/writing/x` → `{ locale: 'id', path: '/writing/x' }` */
export function splitLocale(rawPathname: string): { locale: Locale; path: string } {
  const pathname = cleanPath(rawPathname);
  const [, first, ...rest] = pathname.split('/');
  if (isLocale(first) && first !== DEFAULT_LOCALE) {
    return { locale: first, path: `/${rest.join('/')}`.replace(/\/$/, '') || '/' };
  }
  return { locale: DEFAULT_LOCALE, path: pathname.replace(/\/$/, '') || '/' };
}

/** Same page in every locale, derived from the current pathname. */
export function alternatesFor(pathname: string): Record<Locale, string> {
  const { path } = splitLocale(pathname);
  return Object.fromEntries(LOCALES.map((l) => [l, localizePath(path, l)])) as Record<Locale, string>;
}
