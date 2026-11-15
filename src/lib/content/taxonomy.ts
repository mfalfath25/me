import type { Locale } from '@/i18n/config';

import { listArchiveItems } from './archive';
import { listPosts, listPostsInSeries } from './posts';
import { listWorks } from './works';
import { getSeriesMap, getTagMap } from './shared';
import type { ArchiveItem, Post, Work, Series, Tag } from './types';

export interface TaggedContent {
  tag: Tag;
  posts: Post[];
  works: Work[];
  archive: ArchiveItem[];
}

const hasTag = (slug: string) => (item: { tags: { slug: string }[] }) => item.tags.some((t) => t.slug === slug);

export async function listTags(): Promise<Tag[]> {
  const map = await getTagMap();
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** One path per tag that has at least one visible item. */
export async function getTagPaths(locale: Locale) {
  const [tags, posts, works, archive] = await Promise.all([
    listTags(),
    listPosts(locale),
    listWorks(locale),
    listArchiveItems(),
  ]);
  return tags
    .map((tag) => ({
      tag,
      posts: posts.filter(hasTag(tag.slug)),
      works: works.filter(hasTag(tag.slug)),
      archive: archive.filter(hasTag(tag.slug)),
    }))
    .filter((c) => c.posts.length + c.works.length + c.archive.length > 0)
    .map((content) => ({ params: { slug: content.tag.slug }, props: { content: content satisfies TaggedContent } }));
}

export async function listSeries(): Promise<Series[]> {
  const map = await getSeriesMap();
  return [...map.values()];
}

/** One path per Series that has at least one visible Post, with Posts in reading order. */
export async function getSeriesPaths(locale: Locale) {
  const all = await listSeries();
  const withPosts = await Promise.all(
    all.map(async (series) => ({ series, posts: await listPostsInSeries(series.slug, locale) })),
  );
  return withPosts
    .filter((s) => s.posts.length > 0)
    .map(({ series, posts }) => ({ params: { slug: series.slug }, props: { series, posts } }));
}
