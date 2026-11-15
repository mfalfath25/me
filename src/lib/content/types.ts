/**
 * Domain types returned by the content module. Pages and components depend on these,
 * never on Astro collection entries, so the storage backend can change underneath.
 */
import type { ImageMetadata } from 'astro';
import type { render } from 'astro:content';

import type { Locale } from '@/i18n/config';

export type { Locale };

/** Rendered rich-text body. `Content` is a component to drop into a page. */
export type RenderedBody = Awaited<ReturnType<typeof render>>;

export interface TagSummary {
  slug: string;
  name: string;
}

export interface Tag extends TagSummary {
  description: string | null;
}

export interface SeriesSummary {
  slug: string;
  title: string;
}

export interface Series extends SeriesSummary {
  description: string | null;
}

interface Publishable {
  slug: string;
  publishedAt: Date;
  /** True only in dev, for drafts and future-dated items that the live site hides. */
  isHidden: boolean;
}

interface Translatable {
  /** Locale of the text actually shown. */
  locale: Locale;
  /** True when the requested locale had no translation and another locale is shown instead. */
  isFallback: boolean;
  /** Which locales have a real version of this item. */
  availableLocales: Locale[];
}

export interface Post extends Publishable, Translatable {
  title: string;
  description: string;
  updatedAt: Date | null;
  cover: ImageMetadata | null;
  coverAlt: string;
  tags: TagSummary[];
  series: (SeriesSummary & { order: number | null }) | null;
  render: () => Promise<RenderedBody>;
}

export interface ProjectLink {
  label: string;
  url: string;
}

export interface Project extends Publishable, Translatable {
  title: string;
  summary: string;
  role: string | null;
  period: string | null;
  status: 'active' | 'shipped' | 'archived';
  stack: string[];
  links: ProjectLink[];
  cover: ImageMetadata | null;
  coverAlt: string;
  featured: boolean;
  order: number;
  tags: TagSummary[];
  render: () => Promise<RenderedBody>;
}

export interface Exif {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutter: string | null;
  iso: string | null;
}

export interface Photo extends Publishable {
  kind: 'photo';
  title: string;
  image: ImageMetadata;
  alt: string;
  caption: string | null;
  takenAt: Date | null;
  location: string | null;
  albums: string[];
  tags: TagSummary[];
  exif: Exif | null;
}

export interface Link extends Publishable {
  kind: 'link';
  title: string;
  url: string;
  host: string;
  note: string | null;
  siteName: string | null;
  description: string | null;
  image: ImageMetadata | null;
  albums: string[];
  tags: TagSummary[];
}

export type ArchiveItem = Photo | Link;

export interface Album {
  slug: string;
  title: string;
  description: string | null;
  cover: Photo | null;
  order: number;
  items: ArchiveItem[];
}

export interface Page {
  locale: Locale;
  title: string;
  description: string;
  render: () => Promise<RenderedBody>;
}

export type RefKind = 'post' | 'project' | 'photo' | 'link' | 'album' | 'tag' | 'series';

export interface ResolvedRef {
  href: string;
  title: string;
}
