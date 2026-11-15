# SEO

Everything flows through `BaseLayout` props into `src/components/seo/Seo.astro`.

## Every page

- `<title>` as `Page — Site`, meta description, canonical (clean URL, no `.html`)
- OpenGraph + Twitter card; share image = cover resized to 1200×630 JPEG
- `hreflang` alternates + `x-default`, **only** when a real Translation exists
- RSS discovery links, sitemap link, `theme-color`, `lang` on `<html>` and on content in another language
- `robots: noindex` for Fallbacks, drafts (dev only) and 404

## Structured data (`src/lib/seo/jsonld.ts`)

| Page                  | JSON-LD                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| Home                  | `WebSite`, `Person`                                                         |
| About                 | `ProfilePage` → `Person`                                                    |
| Post                  | `BlogPosting`, `BreadcrumbList`                                             |
| Project               | `CreativeWork`, `BreadcrumbList`                                            |
| Archive, Album        | `ImageGallery` of `ImageObject` (with creator and credit), `BreadcrumbList` |
| Indexes, tags, series | `BreadcrumbList`                                                            |

## Site-level

- `/sitemap-index.xml` via `@astrojs/sitemap` with en/id pairs; excludes the Studio and Fallbacks
- `/robots.txt` (generated, points to the sitemap). The Studio sends `X-Robots-Tag: noindex` instead of being listed, so its path isn't advertised.
- Clean URLs (`trailingSlash: 'never'`, `build.format: 'file'`)
- Performance is SEO: zero JS on public pages, AVIF/WebP, eager plus `fetchpriority=high` only for the LCP image

## Checklist for a new page type

1. Pass `title`, `description`, `locale`, `alternates` to `BaseLayout`.
2. Add a JSON-LD builder if schema.org has a fitting type.
3. Add the URL shape to `src/lib/routes.ts`.
4. If it can be a Fallback, set `noindex` + `canonicalPath` and extend `untranslated-routes.ts`.

## To do

- Generated share images for pages without a cover (Satori at build time)
- Set `SITE_URL` to the real domain and submit the sitemap in Google Search Console
