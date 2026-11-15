/**
 * Build-config helper: lists Indonesian URLs that only exist as English fallbacks.
 * Those pages are rendered with `noindex` and must stay out of the sitemap.
 *
 * This is the one place outside `src/lib/content` that knows the on-disk layout,
 * because `astro.config.mjs` runs before content collections are available.
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTENT_ROOT = fileURLToPath(new URL('../content/', import.meta.url));

const TRANSLATABLE = [
  { dir: 'posts', route: '/writing' },
  { dir: 'works', route: '/works' },
] as const;

function slugs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mdoc'))
    .map((f) => f.replace(/\.mdoc$/, ''));
}

export function untranslatedRoutes(): string[] {
  return TRANSLATABLE.flatMap(({ dir, route }) => {
    const translated = new Set(slugs(`${CONTENT_ROOT}${dir}/id`));
    return slugs(`${CONTENT_ROOT}${dir}/en`)
      .filter((slug) => !translated.has(slug))
      .map((slug) => `/id${route}/${slug}`);
  });
}
