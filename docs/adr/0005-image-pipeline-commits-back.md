# Originals are normalized by a GitHub Action that commits back

Photos uploaded through the Studio arrive as full-size camera files with GPS in their EXIF. Keystatic commits through the GitHub API, so local git hooks never run. A GitHub Action (`content-pipeline.yml`) therefore runs on pushes that touch images, copies camera details into the Photo entry, caps the long edge at 2560px, strips all metadata, and commits the result back as `github-actions[bot]`.

## Consequences

- Every image upload triggers two builds (the upload and the bot commit). Well inside the free build allowance.
- Between those two commits the original (with GPS) sits in git history. If that matters for a specific photo, strip it locally with `pnpm images:normalize` before uploading.
- Pull before pushing after a Studio upload; the bot will have added a commit.
