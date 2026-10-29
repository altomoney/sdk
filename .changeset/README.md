# Changesets

This repo uses Changesets to track version bumps for publishable workspace packages.

Typical flow:

1. Add a changeset in a feature branch with `bun run changeset`.
2. Merge to `main`.
3. The release workflow versions changed packages and stages them on npm.
4. A package maintainer approves the staged version on npmjs.com with 2FA.

If staging fails, fix the cause and run the Release workflow manually with `workflow_dispatch`. It stages any package version that is missing from npm.

For local verification without publishing, run `bun run release:dry-run`.
