# Architecture

```
            Studio (/keystatic)                       Visitors
     Basic Auth → GitHub login → commit                   │
                    │                                     ▼
                    ▼                         Cloudflare static assets (HTML, AVIF/WebP)
GitHub repo ── push ──► Content pipeline Action ──(bot commit)──┐
     │                    normalize images, fetch Link previews  │
     └──────────── push ─────────────────────────────────────────┴──► Cloudflare build → deploy
                                                                         astro build
Daily 06:00 WIB: Scheduled publish Action → build + wrangler deploy (future-dated items go live)
```

## Request path

- **Public pages:** prerendered `.html` served straight from Cloudflare's static asset layer. No Worker invocation, no JS unless a page has an island.
- **`/keystatic`, `/api/keystatic/*`:** the only on-demand routes. `src/middleware.ts` checks Basic Auth (fails closed if secrets are missing), then Keystatic handles GitHub OAuth and reads/writes the repo via the GitHub API.

## Build path

1. `src/content.config.ts` loads Markdoc/YAML from `src/content/**` and validates it.
2. `src/lib/content/` maps entries to domain types (`Post`, `Photo`…), applies draft/schedule visibility, resolves tags/series/albums, and picks Translations or Fallbacks.
3. Thin routes in `src/pages/**` call `get*Paths(locale)` and hand props to views in `src/views/`.
4. Views render through `BaseLayout` → `Seo` (meta, hreflang, JSON-LD).
5. `astro:assets` + sharp emit AVIF/WebP variants; `@astrojs/sitemap` and the RSS routes run last.

## Seams

| Seam                       | Swap it by changing                                                 |
| -------------------------- | ------------------------------------------------------------------- |
| Storage (files → database) | `src/lib/content/*` only (ADR 0001)                                 |
| Editor                     | `keystatic.config.ts` + `src/middleware.ts`                         |
| Host                       | adapter in `astro.config.mjs`, `wrangler.jsonc`, workflows          |
| Design                     | `src/styles/global.css` tokens, `src/components/**`, `src/views/**` |
