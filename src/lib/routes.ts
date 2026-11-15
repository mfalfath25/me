/**
 * Every public URL shape in one place. Locale-free; wrap with `localizePath()` for /id.
 * URLs are hard to change once indexed, so treat edits here as breaking changes.
 */
export const routes = {
  home: () => '/',
  writing: () => '/writing',
  post: (slug: string) => `/writing/${slug}`,
  series: (slug: string) => `/writing/series/${slug}`,
  archive: () => '/archive',
  album: (slug: string) => `/archive/albums/${slug}`,
  photo: (slug: string) => `/archive#photo-${slug}`,
  link: (slug: string) => `/archive#link-${slug}`,
  works: () => '/works',
  work: (slug: string) => `/works/${slug}`,
  tag: (slug: string) => `/tags/${slug}`,
  about: () => '/about',
  rss: () => '/rss.xml',
} as const;
