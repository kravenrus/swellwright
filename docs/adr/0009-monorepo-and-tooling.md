# ADR 0009: Monorepo and tooling

Status: accepted

## Context
The project spans an API, a worker, a web UI, a CLI, a probe agent, shared packages and official plugins, and follows the Remnawave stack (ADR 0001).

## Decision
- One repository: pnpm workspaces with Turborepo, strict TypeScript, ESLint and Prettier.
- Zod schemas in `packages/contracts` are the single source for types, validation and the OpenAPI document.
- Node.js: the Active LTS release at project start. The nodejs.org schedule lists Node 26 as of November 2026, so it is pinned as `>=26 <27` (`engines`, `.nvmrc`). pnpm 10 is pinned by the `packageManager` field and installed explicitly (`pnpm/action-setup` in CI, the standalone installer or `npm install --global pnpm@<pinned>` locally): Corepack is no longer bundled with Node.js since version 25, so the project does not rely on it. CI runs on the pinned versions.
- TypeScript is pinned to 6.0.x: typescript-eslint supports TypeScript `>=4.8.4 <6.1.0` as of November 2026. Moving to TypeScript 7 (the native compiler) is a deliberate change made once the lint tooling supports it.
- Installs use `pnpm install --frozen-lockfile --ignore-scripts`; dependency lifecycle scripts are never run, and pnpm's `minimumReleaseAge` (three days) refuses versions published too recently. Dependency updates are reviewed by hand; dependencies must be license-compatible.
- Third-party GitHub Actions are pinned by commit SHA, with the tag in a comment.
- Moving to the next Node.js LTS is a deliberate change made within about six months after it becomes Active LTS.

## Consequences
One toolchain for every package, reproducible builds and a small attack surface for the supply chain. Contributors need Node.js and pnpm at the pinned versions.
