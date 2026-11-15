import rss from '@astrojs/rss';

import type { Locale } from '@/i18n/config';
import { localizePath } from '@/i18n/paths';
import { listPosts } from '@/lib/content';
import { routes } from '@/lib/routes';
import { site } from '@/lib/site';

/** RSS feed of Posts written in `locale` (fallback copies are left out). */
export async function postsFeed(locale: Locale, origin: URL) {
  const posts = (await listPosts(locale)).filter((p) => !p.isFallback && !p.isHidden);
  return rss({
    title: site.name,
    description: site.description[locale],
    site: origin,
    customData: `<language>${locale}</language>`,
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.publishedAt,
      link: localizePath(routes.post(post.slug), locale),
      categories: post.tags.map((t) => t.name),
    })),
  });
}
