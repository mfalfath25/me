# Content model

Terms are defined in `GLOSSARY.md`. Field lists below match `keystatic.config.ts` and `src/content.config.ts`; keep all three in sync.

Common to Posts, Projects, Photos and Links: `publishedAt` (date; future dates stay hidden until that day's scheduled rebuild) and `draft` (never published). In `pnpm dev` everything is visible and marked.

## Post: `src/content/posts/{en,id}/<slug>.mdoc`

| Field               | Notes                                                       |
| ------------------- | ----------------------------------------------------------- |
| title, slug         | Slug is the URL. A Translation must reuse the English slug. |
| description         | SEO description, ≤ 200 chars                                |
| updatedAt           | Optional, for meaningful revisions                          |
| cover, coverAlt     | Optional; also used as the share image                      |
| tags                | Shared Tags                                                 |
| series, seriesOrder | Optional Series membership and position                     |
| body                | Markdoc. Images go to `src/assets/posts/`.                  |

## Project: `src/content/projects/{en,id}/<slug>.mdoc`

Overview fields: `title`, `summary`, `role`, `period`, `status` (active/shipped/archived), `stack[]`, `links[{label,url}]`, `cover`, `coverAlt`, `featured` (home page), `order`, `tags`. The Markdoc body is the detailed section.

## Photo: `src/content/archive/photos/<slug>.yaml`, image in `src/assets/archive/photos/<slug>/`

| Field                      | Notes                                                                          |
| -------------------------- | ------------------------------------------------------------------------------ |
| title, slug                | Alt text falls back to title, then the slug as words                           |
| image                      | Required                                                                       |
| alt                        | Optional explicit alt                                                          |
| caption, takenAt, location | `location` drives filtering later                                              |
| albums, tags               | Zero or more of each                                                           |
| exif                       | camera, lens, focalLength, aperture, shutter, iso. **Filled by the pipeline.** |

## Link: `src/content/archive/links/<slug>.yaml`

`title`, `url`, `note`, `albums`, `tags`, plus `meta` (siteName, description, preview image, fetchedAt), **filled by the pipeline** when `fetchedAt` is empty. Clear `fetchedAt` to refetch.

## Album: `src/content/albums/<slug>.yaml`

`title`, `description`, `cover` (a Photo; defaults to the first Photo), `order`. An Album holds any Archive items that list it; Albums with no visible items are not built.

## Tag: `src/content/tags/<slug>.yaml`

`name`, `description`. One shared list across all content. Every Tag with at least one visible item gets `/tags/<slug>`. Referencing an unknown Tag fails the build.

## Series: `src/content/series/<slug>.yaml`

`title`, `description`. Posts join a Series via their own `series` + `seriesOrder`.

## About page: `src/content/pages/about-{en,id}.mdoc`

Singletons: `title`, `description`, body.

## Internal links

Inside any Markdoc body: `{% ref kind="post" slug="hello-world" /%}` (optionally `label="…"`). Kinds: post, project, photo, link, album, tag, series. In the Studio, insert it with the **Internal link** component. Broken references fail the build. These links are also the data for a future connection graph.
