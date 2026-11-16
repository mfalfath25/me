import { getCollection, getEntry } from 'astro:content';

import { deriveAlt } from './alt';
import { byNewest, isHidden, isVisible, resolveTags } from './shared';
import type { Album, ArchiveItem, Link, Photo } from './types';

const warned = new Set<string>();

export async function listPhotos(): Promise<Photo[]> {
  const entries = await getCollection('photos', ({ data }) => isVisible(data));
  const photos = await Promise.all(
    entries.map(async ({ id, data: d }) => {
      const alt = deriveAlt({ alt: d.alt, title: d.title, slug: id });
      if (!alt && !warned.has(id)) {
        warned.add(id);
        console.warn(`[content] Photo "${id}" has no usable alt text. Give it a descriptive title or alt.`);
      }
      return {
        kind: 'photo',
        slug: id,
        publishedAt: d.publishedAt,
        isHidden: isHidden(d),
        title: d.title,
        image: d.image,
        alt,
        caption: d.caption ?? null,
        takenAt: d.takenAt ?? null,
        location: d.location ?? null,
        albums: d.albums?.map((a) => a.id) ?? [],
        tags: await resolveTags(d.tags),
        exif: d.exif
          ? {
              camera: d.exif.camera ?? null,
              lens: d.exif.lens ?? null,
              focalLength: d.exif.focalLength ?? null,
              aperture: d.exif.aperture ?? null,
              shutter: d.exif.shutter ?? null,
              iso: d.exif.iso ?? null,
            }
          : null,
      } satisfies Photo;
    }),
  );
  // The Owner's order first (Studio → Archive → Photo order); photos not listed follow, newest first.
  const listed = (await getEntry('photoOrder', 'photo-order'))?.data.photos?.map((ref) => ref.id) ?? [];
  const rank = new Map(listed.map((id, i) => [id, i]));
  return photos.sort((a, b) => {
    const ra = rank.get(a.slug);
    const rb = rank.get(b.slug);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return byNewest(a, b);
  });
}

export async function listLinks(): Promise<Link[]> {
  const entries = await getCollection('links', ({ data }) => isVisible(data));
  const links = await Promise.all(
    entries.map(async ({ id, data: d }) => ({
      kind: 'link' as const,
      slug: id,
      publishedAt: d.publishedAt,
      isHidden: isHidden(d),
      title: d.title,
      url: d.url,
      host: new URL(d.url).hostname.replace(/^www\./, ''),
      note: d.note ?? null,
      siteName: d.meta?.siteName ?? null,
      description: d.meta?.description ?? null,
      image: d.meta?.image ?? null,
      albums: d.albums?.map((a) => a.id) ?? [],
      tags: await resolveTags(d.tags),
    })),
  );
  return links.sort(byNewest);
}

/** Photos in the Owner's order, then Links, newest first. */
export async function listArchiveItems(): Promise<ArchiveItem[]> {
  const [photos, links] = await Promise.all([listPhotos(), listLinks()]);
  return [...photos, ...links];
}

export async function listAlbums(): Promise<Album[]> {
  const [entries, items] = await Promise.all([getCollection('albums'), listArchiveItems()]);
  return entries
    .map(({ id, data: d }) => {
      const albumItems = items.filter((item) => item.albums.includes(id));
      const photos = albumItems.filter((i): i is Photo => i.kind === 'photo');
      const cover = (d.cover && photos.find((p) => p.slug === d.cover!.id)) || photos[0] || null;
      return { slug: id, title: d.title, description: d.description ?? null, order: d.order, cover, items: albumItems };
    })
    .filter((album) => album.items.length > 0)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export async function getAlbumPaths() {
  const albums = await listAlbums();
  return albums.map((album) => ({ params: { slug: album.slug }, props: { album } }));
}
