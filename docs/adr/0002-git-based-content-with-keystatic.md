# Content lives in git, edited through Keystatic

The Owner wanted an editor in the same repo, behind a login, with no running costs. We chose Keystatic in GitHub mode: the Studio commits Markdoc/YAML files to the repo and the static site rebuilds. This keeps the site fully static, versions every edit, and lets content be edited by hand in an IDE too.

## Considered options

- **Database + custom editor (Turso/Supabase):** instant publishing and username/password auth, but more to build and run, content outside the repo, and pages rendered on a server. Kept open as a future migration via ADR 0001.
- **Hand-rolled editor committing via the GitHub API:** full control, but rebuilds most of Keystatic.

## Consequences

- Saving in the Studio publishes after a rebuild (about a minute), not instantly.
- Keystatic signs in with GitHub (it needs repo write access), so it cannot use Google SSO. A Basic Auth gate sits in front (`src/middleware.ts`); Cloudflare Access with Google can replace it once there is a custom domain.
- Keystatic rewrites whole files on save and drops keys it does not know, so any field a script writes (`exif`, Link `meta`) must also be declared in `keystatic.config.ts`.
