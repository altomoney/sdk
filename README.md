# AltoMoney SDK Monorepo

This repository contains the AltoMoney TypeScript SDK packages and release tooling.

## Packages

- `packages/sdk`: `@altomoney/sdk`, a snapshot-based SDK for off-chain Alto protocol calculations

## Workspace Commands

Run from the repository root:

```bash
bun install
bun run typecheck
bun run build
bun run test
bun run validate
```

## Releases

- Version changes with `bun run changeset`
- Pushes to `main` run CI, version changed packages and stage them on npm
- A package maintainer approves staged versions on npmjs.com with 2FA
- Retry staging by running the Release workflow with `workflow_dispatch`
- Local release verification: `bun run release:dry-run`

## Agent Docs

The published SDK package includes:

- `AGENTS.md`
- `agent-reference.md`

These files describe the package for coding agents and other tooling.
