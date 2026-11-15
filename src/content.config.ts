/**
 * Content collections: the storage-side schema for content written by the Studio (keystatic.config.ts).
 *
 * Only `src/lib/content/` may read these collections. Everything else imports from `@/lib/content`.
 * See docs/adr/0001-content-access-module.md.
 */
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Keystatic writes `null` or omits keys for empty optional fields; accept both.
const optionalText = z.string().nullish();
const optionalDate = z.coerce.date().nullish();
const publishing = {
  publishedAt: z.coerce.date(),
  draft: z.boolean().default(false),
};
const tagRefs = z.array(reference('tags')).nullish();
const albumRefs = z.array(reference('albums')).nullish();

const posts = defineCollection({
  // ids look like `en/hello-world` and `id/hello-world`
  loader: glob({ pattern: '{en,id}/*.mdoc', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      ...publishing,
      updatedAt: optionalDate,
      cover: image().nullish(),
      coverAlt: optionalText,
      tags: tagRefs,
      series: reference('series').nullish(),
      seriesOrder: z.number().int().nullish(),
    }),
});

const works = defineCollection({
  loader: glob({ pattern: '{en,id}/*.mdoc', base: './src/content/works' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      ...publishing,
      role: optionalText,
      period: optionalText,
      status: z.enum(['active', 'shipped', 'archived']).default('active'),
      stack: z.array(z.string()).nullish(),
      links: z.array(z.object({ label: z.string(), url: z.url() })).nullish(),
      cover: image().nullish(),
      coverAlt: optionalText,
      featured: z.boolean().default(false),
      order: z.number().int().default(100),
      tags: tagRefs,
    }),
});

const photos = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/archive/photos' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      image: image(),
      alt: optionalText,
      caption: optionalText,
      takenAt: optionalDate,
      location: optionalText,
      albums: albumRefs,
      tags: tagRefs,
      ...publishing,
      exif: z
        .object({
          camera: optionalText,
          lens: optionalText,
          focalLength: optionalText,
          aperture: optionalText,
          shutter: optionalText,
          iso: optionalText,
        })
        .nullish(),
    }),
});

const links = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/archive/links' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      url: z.url(),
      note: optionalText,
      albums: albumRefs,
      tags: tagRefs,
      ...publishing,
      meta: z
        .object({
          siteName: optionalText,
          description: optionalText,
          image: image().nullish(),
          fetchedAt: z.union([z.string(), z.date()]).nullish(),
        })
        .nullish(),
    }),
});

const albums = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/albums' }),
  schema: z.object({
    title: z.string(),
    description: optionalText,
    cover: reference('photos').nullish(),
    order: z.number().int().default(100),
  }),
});

const tags = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/tags' }),
  schema: z.object({
    name: z.string(),
    description: optionalText,
  }),
});

const series = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/series' }),
  schema: z.object({
    title: z.string(),
    description: optionalText,
  }),
});

const pages = defineCollection({
  // about-en.mdoc, about-id.mdoc
  loader: glob({ pattern: '*.mdoc', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

export const collections = { posts, works, photos, links, albums, tags, series, pages };
