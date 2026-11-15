# AGENTS.md

Guide for AI agents (and humans) working in this repo. Read this first, then `GLOSSARY.md`.

## What this is

A one-person personal site: **Posts** (writing), the **Archive** (Photos + Links, optionally grouped in Albums), **Works**, and later a **Playground** of Experiments. Bilingual: English at `/`, Indonesian at `/id`. The Owner edits everything in the **Studio** (Keystatic) at `/keystatic`.

Use the words in `GLOSSARY.md` for names in code, UI and docs. If you need a new domain term, add it there first.

## Stack

Astro 7 (static output) · React 19 islands only where interactive · Markdoc · Keystatic (GitHub mode) · Tailwind CSS v4 · Cloudflare Workers (static assets) · pnpm · TypeScript strict.

## Commands

| Command                     | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                  | Dev server on Node; Studio in local mode at `/keystatic`, no auth    |
| `pnpm build`                | Production build (Cloudflare adapter, images optimized with sharp)   |
| `pnpm preview:worker`       | Build + run in real workerd with `.dev.vars` (tests the Studio gate) |
| `pnpm check`                | `astro check` (types + content schemas)                              |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                                    |
| `pnpm test`                 | Vitest unit tests                                                    |
| `pnpm images:normalize`     | Resize originals, strip GPS/EXIF, copy camera details into Photos    |
| `pnpm links:enrich`         | Fetch title/description/preview image for new Links                  |

Before finishing a change, run `pnpm lint && pnpm check && pnpm test && pnpm build`.

## Rules

1. **Read content only through `@/lib/content`.** Never import `astro:content` elsewhere (ESLint blocks it). See `docs/adr/0001-content-access-module.md`.
2. **Changing a content field = three files**: `keystatic.config.ts` (editor), `src/content.config.ts` (schema), `src/lib/content/types.ts` + the mapper in `src/lib/content/*.ts`. Keystatic drops unknown keys on save, so script-written fields must exist in `keystatic.config.ts` too.
3. **Zero JS by default.** Pages are `.astro`. Add a React island (`client:visible` / `client:idle`) only for real interactivity, and keep heavy libs (three.js) inside that island.
4. **URLs live in `src/lib/routes.ts`.** Wrap with `localizePath()` for the current locale. Never hand-build `/id/...` strings.
5. **Interface text lives in `src/i18n/ui.ts`** with both `en` and `id` keys.
6. **Images go through `ResponsiveImage`** (AVIF + WebP, q80, responsive widths). Never ship originals.
7. **SEO goes through `BaseLayout` props** (`Seo.astro`). Detail pages pass `alternates` only for locales with a real Translation; Fallbacks are `noindex` with a canonical to the original.
8. **Routes are thin.** `src/pages/**` files only wire `getStaticPaths` to a view in `src/views/`. Each route exists twice: `src/pages/x` and `src/pages/id/x`.
9. Don't commit secrets. `.env.example` lists every variable.

## Layout

```
keystatic.config.ts      Studio collections (the editor's view of content)
markdoc.config.mjs       Markdoc tags/nodes → Astro components
astro.config.mjs         Integrations, i18n, sitemap, adapter
src/
  content/               Content files written by the Studio (Markdoc + YAML)
  content.config.ts      Collection schemas (mirror of keystatic.config.ts)
  assets/                Images referenced by content (normalized by the pipeline)
  lib/content/           Content module: the only reader of content
  lib/routes.ts          Every URL shape
  lib/seo/               JSON-LD builders
  i18n/                  Locales, path helpers, UI strings
  layouts/ views/        Page shell; full page bodies (locale-aware)
  pages/                 Thin route files (EN + /id)
  components/            content/, layout/, markdoc/, media/, seo/
  middleware.ts          Basic Auth gate for /keystatic
scripts/                 Content pipeline (images, links), run by GitHub Actions
docs/                    Architecture, content model, pipelines, ADRs
```

## Docs

- `docs/architecture.md`: how the pieces fit
- `docs/design.md`: the grid sheet, layers, tokens and motion rules
- `docs/content-model.md`: every content type and field
- `docs/image-pipeline.md`, `docs/i18n.md`, `docs/seo.md`, `docs/deployment.md`
- `docs/adr/`: why things are the way they are. Read before "fixing" something that looks odd.

## Not built yet

Blur placeholders for images · Playground and Experiments · Pagefind search · generated share images for pages without a cover · Cloudflare Access with Google (needs a custom domain).
