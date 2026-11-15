# Deployment

Target: **Cloudflare Workers (free plan)** with static assets. Cloudflare is folding Pages into Workers; the Astro adapter targets Workers. Static asset requests are free and unlimited. Only `/keystatic` uses Worker requests (100k/day free).

## 1. Connect the repo (once)

1. Cloudflare dashboard → Workers & Pages → Create → **Import a repository** → `mfalfath25/me`.
2. Build command `pnpm build`, deploy command `npx wrangler deploy`. The Worker name must match `wrangler.jsonc` (`me`).
3. Build variables: `SITE_URL` (start with the `*.workers.dev` URL Cloudflare assigns), `PUBLIC_CF_ANALYTICS_TOKEN` (optional), `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` (after step 2).
4. Then set `SITE_URL`'s fallback in `astro.config.mjs` to that URL too.

## 2. Studio in GitHub mode (once)

1. Run `pnpm build && pnpm preview:worker`, open `/keystatic` and follow Keystatic's prompt to **create a GitHub App** for `mfalfath25/me`. It produces `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET` and the app slug.
2. In the GitHub App settings, add the callback URL `https://<your-site>/api/keystatic/github/oauth/callback`.
3. In Cloudflare (Worker → Settings → Variables and secrets), add as **secrets**: the three `KEYSTATIC_*` values, `STUDIO_BASIC_AUTH_USER`, `STUDIO_BASIC_AUTH_PASSWORD`.
4. Add `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` as a build variable and redeploy.

Visiting `/keystatic` then asks for the Basic Auth password, then GitHub login.

## 3. GitHub Actions

| Workflow                | Needs                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`                | nothing                                                                                                                                                                        |
| `content-pipeline.yml`  | nothing (uses `GITHUB_TOKEN` with `contents: write`)                                                                                                                           |
| `scheduled-publish.yml` | secrets `CLOUDFLARE_API_TOKEN` (Workers edit), `CLOUDFLARE_ACCOUNT_ID`; variables `SITE_URL`, `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`, `PUBLIC_CF_ANALYTICS_TOKEN`. Skips if unset. |

## 4. Analytics (optional)

Cloudflare dashboard → Web Analytics → add site → copy the token into `PUBLIC_CF_ANALYTICS_TOKEN`. Cookieless, so no banner.

## Later: custom domain

1. Buy the domain, add it to Cloudflare, attach it to the Worker.
2. Update `SITE_URL` everywhere and the GitHub App callback URL.
3. Replace Basic Auth with **Cloudflare Access** (Zero Trust, free ≤ 50 users) on `/keystatic*` and `/api/keystatic*` with Google login, then remove the middleware check or keep it as a second layer.
4. Add a redirect from the old `workers.dev` host and resubmit the sitemap.
