import type { Locale } from '@/i18n/config';
import { localizePath } from '@/i18n/paths';
import { routes } from '@/lib/routes';

import { listAlbums, listLinks, listPhotos } from './archive';
import { listPosts } from './posts';
import { listWorks } from './works';
import { getSeriesMap, getTagMap } from './shared';
import type { RefKind, ResolvedRef } from './types';

/**
 * Resolve an internal `{% ref %}` to a URL and title. Throws on a broken reference,
 * which fails the build, so links between pages can never silently rot.
 */
export async function resolveRef(kind: RefKind, slug: string, locale: Locale): Promise<ResolvedRef> {
  const found = await find(kind, slug, locale);
  if (!found)
    throw new Error(
      `Broken internal link: {% ref kind="${kind}" slug="${slug}" %} does not exist or is not published.`,
    );
  return { href: localizePath(found.path, locale), title: found.title };
}

async function find(kind: RefKind, slug: string, locale: Locale): Promise<{ path: string; title: string } | undefined> {
  const pick = <T extends { slug: string }>(items: T[]) => items.find((i) => i.slug === slug);
  switch (kind) {
    case 'post': {
      const p = pick(await listPosts(locale));
      return p && { path: routes.post(slug), title: p.title };
    }
    case 'work': {
      const p = pick(await listWorks(locale));
      return p && { path: routes.work(slug), title: p.title };
    }
    case 'photo': {
      const p = pick(await listPhotos());
      return p && { path: routes.photo(slug), title: p.title };
    }
    case 'link': {
      const l = pick(await listLinks());
      return l && { path: routes.link(slug), title: l.title };
    }
    case 'album': {
      const a = pick(await listAlbums());
      return a && { path: routes.album(slug), title: a.title };
    }
    case 'tag': {
      const t = (await getTagMap()).get(slug);
      return t && { path: routes.tag(slug), title: t.name };
    }
    case 'series': {
      const s = (await getSeriesMap()).get(slug);
      return s && { path: routes.series(slug), title: s.title };
    }
  }
}
