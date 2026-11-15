# All content reads go through one module

Content is stored as files today (see ADR 0002), but the Owner may move to a database later. Pages and components therefore never touch `astro:content` or the files directly; they call functions in `src/lib/content/` that return plain domain types (`Post`, `Photo`, `Project`…). A move to a database means re-implementing that module; no page changes. ESLint enforces this with `no-restricted-imports` on `astro:content` outside the module.

## Consequences

- `src/content.config.ts` and `src/i18n/untranslated-routes.ts` (used by the sitemap at config time) are the only other files that know the storage layout.
- Images are typed as Astro `ImageMetadata`. Under a database they would become URLs, which is the one type change a migration would ripple outward.
