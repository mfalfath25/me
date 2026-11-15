import { getCollection } from 'astro:content';

import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/config';

import type { SeriesSummary, TagSummary } from './types';

/** Drafts and future-dated items are visible in dev only. */
export function isVisible(item: { draft: boolean; publishedAt: Date }): boolean {
  if (import.meta.env.DEV) return true;
  return !item.draft && item.publishedAt.getTime() <= Date.now();
}

export function isHidden(item: { draft: boolean; publishedAt: Date }): boolean {
  return item.draft || item.publishedAt.getTime() > Date.now();
}

export const byNewest = (a: { publishedAt: Date }, b: { publishedAt: Date }) =>
  b.publishedAt.getTime() - a.publishedAt.getTime();

/** `en/hello-world` → `{ locale: 'en', slug: 'hello-world' }` */
export function splitLocalizedId(id: string): { locale: Locale; slug: string } {
  const [locale, ...rest] = id.split('/');
  return {
    locale: (LOCALES as readonly string[]).includes(locale!) ? (locale as Locale) : DEFAULT_LOCALE,
    slug: rest.join('/'),
  };
}

/**
 * Group locale-split entries by slug and pick the version for `locale`,
 * falling back to the default locale, then to any locale that exists.
 */
export function pickLocalized<T extends { id: string }>(
  entries: T[],
  locale: Locale,
): { entry: T; slug: string; locale: Locale; isFallback: boolean; availableLocales: Locale[] }[] {
  const bySlug = new Map<string, Map<Locale, T>>();
  for (const entry of entries) {
    const { locale: l, slug } = splitLocalizedId(entry.id);
    if (!bySlug.has(slug)) bySlug.set(slug, new Map());
    bySlug.get(slug)!.set(l, entry);
  }
  return [...bySlug.entries()].map(([slug, versions]) => {
    const order = [locale, DEFAULT_LOCALE, ...LOCALES];
    const shown = order.find((l) => versions.has(l))!;
    return {
      entry: versions.get(shown)!,
      slug,
      locale: shown,
      isFallback: shown !== locale,
      availableLocales: LOCALES.filter((l) => versions.has(l)),
    };
  });
}

let tagMap: Promise<Map<string, TagSummary & { description: string | null }>> | undefined;
export function getTagMap() {
  tagMap ??= getCollection('tags').then(
    (tags) =>
      new Map(tags.map((t) => [t.id, { slug: t.id, name: t.data.name, description: t.data.description ?? null }])),
  );
  return tagMap;
}

let seriesMap: Promise<Map<string, SeriesSummary & { description: string | null }>> | undefined;
export function getSeriesMap() {
  seriesMap ??= getCollection('series').then(
    (all) =>
      new Map(all.map((s) => [s.id, { slug: s.id, title: s.data.title, description: s.data.description ?? null }])),
  );
  return seriesMap;
}

export async function resolveTags(refs: { id: string }[] | null | undefined): Promise<TagSummary[]> {
  if (!refs?.length) return [];
  const map = await getTagMap();
  return refs.map((r) => {
    const tag = map.get(r.id);
    if (!tag) throw new Error(`Unknown tag "${r.id}". Create it in the Studio under Tags.`);
    return { slug: tag.slug, name: tag.name };
  });
}
