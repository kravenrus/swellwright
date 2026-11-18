# ADR 0009: Monorepo and tooling

Status: accepted

## Context
The project spans an API, a worker, a web UI, a CLI, a probe agent, shared packages and official plugins, and follows the Remnawave stack (ADR 0001).

## Decision
- One repository: pnpm workspaces with Turborepo, strict TypeScript, ESLint and Prettier.
- Zod schemas in `packages/contracts` are the single source for types, validation and the OpenAPI document.
- Node.js: the Active LTS release at project start (the nodejs.org schedule lists Node 26 as of November 2026; verify before pinning), pnpm 10 through corepack. Versions are pinned with `engines`, `.nvmrc` and the `packageManager` field, and CI runs on the pinned version.
- Installs use `pnpm install --frozen-lockfile --ignore-scripts`; dependency updates are reviewed by hand; dependencies must be license-compatible.
- Moving to the next Node.js LTS is a deliberate change made within about six months after it becomes Active LTS.

## Consequences
One toolchain for every package, reproducible builds and a small attack surface for the supply chain. Contributors need Node.js and pnpm at the pinned versions.
