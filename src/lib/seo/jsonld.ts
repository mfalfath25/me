/** Builders for schema.org JSON-LD. Keep them small and typed by usage, not by the full spec. */
import type { Locale } from '@/i18n/config';
import { cleanPath } from '@/i18n/paths';
import { site } from '@/lib/site';

const abs = (path: string, origin: URL | string) => new URL(path.startsWith('/') ? cleanPath(path) : path, origin).href;

export function personLd(origin: URL | string) {
  return {
    '@type': 'Person',
    '@id': abs('/#person', origin),
    name: site.author.name,
    url: abs(site.author.url, origin),
    sameAs: site.author.sameAs,
  };
}

export function websiteLd(origin: URL | string, locale: Locale) {
  return {
    '@type': 'WebSite',
    '@id': abs('/#website', origin),
    name: site.name,
    url: abs('/', origin),
    inLanguage: locale,
    author: { '@id': abs('/#person', origin) },
  };
}

export function breadcrumbLd(origin: URL | string, crumbs: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.path, origin),
    })),
  };
}

export function blogPostingLd(
  origin: URL | string,
  p: {
    title: string;
    description: string;
    path: string;
    locale: Locale;
    publishedAt: Date;
    updatedAt: Date | null;
    image?: string | null;
    tags: string[];
  },
) {
  return {
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.description,
    url: abs(p.path, origin),
    mainEntityOfPage: abs(p.path, origin),
    inLanguage: p.locale,
    datePublished: p.publishedAt.toISOString(),
    dateModified: (p.updatedAt ?? p.publishedAt).toISOString(),
    author: { '@id': abs('/#person', origin) },
    publisher: { '@id': abs('/#person', origin) },
    keywords: p.tags.join(', ') || undefined,
    image: p.image ? abs(p.image, origin) : undefined,
  };
}

export function creativeWorkLd(
  origin: URL | string,
  p: { title: string; description: string; path: string; locale: Locale; image?: string | null; tags: string[] },
) {
  return {
    '@type': 'CreativeWork',
    name: p.title,
    description: p.description,
    url: abs(p.path, origin),
    inLanguage: p.locale,
    creator: { '@id': abs('/#person', origin) },
    keywords: p.tags.join(', ') || undefined,
    image: p.image ? abs(p.image, origin) : undefined,
  };
}

export function imageGalleryLd(
  origin: URL | string,
  p: { name: string; path: string; images: { src: string; alt: string; title: string }[] },
) {
  return {
    '@type': 'ImageGallery',
    name: p.name,
    url: abs(p.path, origin),
    image: p.images.map((img) => ({
      '@type': 'ImageObject',
      contentUrl: abs(img.src, origin),
      name: img.title,
      description: img.alt,
      creator: { '@id': abs('/#person', origin) },
      creditText: site.author.name,
      copyrightNotice: `© ${site.author.name}`,
    })),
  };
}
