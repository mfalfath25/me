import { getCollection, render } from 'astro:content';

import type { Locale } from '@/i18n/config';

import { byNewest, getSeriesMap, isHidden, isVisible, pickLocalized, resolveTags } from './shared';
import type { Post } from './types';

export async function listPosts(locale: Locale): Promise<Post[]> {
  const entries = await getCollection('posts', ({ data }) => isVisible(data));
  const seriesMap = await getSeriesMap();

  const posts = await Promise.all(
    pickLocalized(entries, locale).map(async ({ entry, slug, locale: shown, isFallback, availableLocales }) => {
      const d = entry.data;
      const series = d.series ? seriesMap.get(d.series.id) : undefined;
      if (d.series && !series) throw new Error(`Post "${slug}" references unknown series "${d.series.id}".`);
      return {
        slug,
        locale: shown,
        isFallback,
        availableLocales,
        isHidden: isHidden(d),
        title: d.title,
        description: d.description,
        publishedAt: d.publishedAt,
        updatedAt: d.updatedAt ?? null,
        cover: d.cover ?? null,
        coverAlt: d.coverAlt?.trim() || d.title,
        tags: await resolveTags(d.tags),
        series: series ? { slug: series.slug, title: series.title, order: d.seriesOrder ?? null } : null,
        render: () => render(entry),
      } satisfies Post;
    }),
  );
  return posts.sort(byNewest);
}

export async function getPostPaths(locale: Locale) {
  const posts = await listPosts(locale);
  return posts.map((post) => ({ params: { slug: post.slug }, props: { post } }));
}

export async function listPostsInSeries(seriesSlug: string, locale: Locale): Promise<Post[]> {
  const posts = await listPosts(locale);
  return posts
    .filter((p) => p.series?.slug === seriesSlug)
    .sort(
      (a, b) => (a.series!.order ?? 0) - (b.series!.order ?? 0) || a.publishedAt.getTime() - b.publishedAt.getTime(),
    );
}
