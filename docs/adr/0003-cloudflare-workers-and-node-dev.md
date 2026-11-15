# Deploy to Cloudflare Workers; run `astro dev` without the adapter

Hosting is Cloudflare's free plan. The current `@astrojs/cloudflare` adapter targets Workers with static assets (Cloudflare's successor to Pages): every public page is prerendered HTML served as a free static asset, and only the Studio routes run as a Worker.

`astro.config.mjs` leaves the adapter out when running `astro dev`. With the adapter, dev runs inside workerd, where Keystatic's local mode cannot reach the filesystem (it fails with `exports is not defined`). Builds, `astro preview` and deploys always use the adapter.

## Consequences

- Anything that only breaks under workerd shows up in `pnpm build` / `pnpm preview:worker`, not in `pnpm dev`. CI builds on every push to catch it.
- `astro preview` does not load `.dev.vars`; use `pnpm preview:worker` to test the Studio gate locally.
