# English unprefixed, Indonesian under /id, Fallbacks are noindex

English is the main language and lives at the root (`/writing/x`); Indonesian lives under `/id`. Every page exists in both locales so the EN/ID toggle never 404s. When an item has no Translation, `/id/...` renders the English text with a notice (a Fallback), marked `noindex` with its canonical pointing at the English URL, and left out of the sitemap and hreflang. This avoids duplicate-content penalties while keeping the toggle simple.

## Consequences

- URLs are hard to change once indexed; all shapes live in `src/lib/routes.ts`.
- A Translation must use exactly the same slug as its English original to pair up.
