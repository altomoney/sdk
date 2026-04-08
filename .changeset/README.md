# Changesets

This repo uses Changesets to track version bumps for publishable workspace packages.

Typical flow:

1. Add a changeset in a feature branch with `bun run changeset`.
2. Merge to `main`.
3. The release workflow versions changed packages and publishes them to npm.

For local verification without publishing, run `bun run release:dry-run`.
