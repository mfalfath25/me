# Image pipeline

Two automated stages. Nobody resizes anything by hand.

## Stage 1: normalize originals (`scripts/normalize-images.mjs`)

Runs in the **Content pipeline** GitHub Action on every push to `main` that touches `src/assets/**` or `src/content/archive/**`, then commits the result back (ADR 0005). Run locally with `pnpm images:normalize` (`--check` to dry-run).

1. For each Photo without camera details, reads EXIF (camera, lens, focal length, aperture, shutter, ISO, date taken) into the YAML entry.
2. For every image in `src/assets/`: auto-rotates, caps the long edge at **2560px**, converts to sRGB, re-encodes at **quality 90**, and strips **all metadata, including GPS**.

Already-normalized images are skipped, so the script is idempotent.

## Stage 2: build-time variants (Astro + sharp)

Every content image renders through `src/components/media/ResponsiveImage.astro`:

- `<picture>` with **AVIF and WebP at quality 80**, JPEG fallback
- 3 responsive widths per use (never upscaled), `sizes` set per layout
- intrinsic `width`/`height` (no layout shift), `loading="lazy"` unless `priority`
- hashed filenames under `/_astro/` with immutable year-long cache headers

Why 80 and not 95: on photos, 95 is roughly 2–3× the bytes of 80 with no visible difference at screen sizes.

Markdoc body images (`![alt](…)`) go through the same component via `src/components/markdoc/MarkdocImage.astro`.

## Link previews (`scripts/enrich-links.mjs`)

Same Action. For Links with empty `meta.fetchedAt`, fetches the page's OpenGraph data and downloads its preview image to `src/assets/archive/links/<slug>/image.jpg` (1200px, q85), so previews never break when the source site changes.

## Later

Blur-up placeholders, and moving the Photo library to Cloudflare R2 if the repo grows past ~1 GB.
