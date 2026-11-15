import { getCollection, render } from 'astro:content';

import type { Locale } from '@/i18n/config';

import { isHidden, isVisible, pickLocalized, resolveTags } from './shared';
import type { Work } from './types';

export async function listWorks(locale: Locale): Promise<Work[]> {
  const entries = await getCollection('works', ({ data }) => isVisible(data));
  const works = await Promise.all(
    pickLocalized(entries, locale).map(async ({ entry, slug, locale: shown, isFallback, availableLocales }) => {
      const d = entry.data;
      return {
        slug,
        locale: shown,
        isFallback,
        availableLocales,
        isHidden: isHidden(d),
        title: d.title,
        summary: d.summary,
        publishedAt: d.publishedAt,
        role: d.role ?? null,
        period: d.period ?? null,
        status: d.status,
        stack: d.stack ?? [],
        links: d.links ?? [],
        cover: d.cover ?? null,
        coverAlt: d.coverAlt?.trim() || d.title,
        featured: d.featured,
        order: d.order,
        tags: await resolveTags(d.tags),
        render: () => render(entry),
      } satisfies Work;
    }),
  );
  return works.sort((a, b) => a.order - b.order || b.publishedAt.getTime() - a.publishedAt.getTime());
}

export async function getWorkPaths(locale: Locale) {
  const works = await listWorks(locale);
  return works.map((work) => ({ params: { slug: work.slug }, props: { work } }));
}
