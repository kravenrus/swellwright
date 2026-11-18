# packages/contracts

Zod schemas shared by API, UI, CLI and SDK; the source of the OpenAPI document.

Status: error envelope, system, sign-in, role and audit schemas, the permission catalogue and the five built-in roles ([ADR 0015](../../docs/adr/0015-permissions-and-the-audit-chain.md)), the route registry (each route states who may call it and which permission it needs) and the OpenAPI 3.1 generator ([ADR 0012](../../docs/adr/0012-contract-first-api-with-a-route-registry.md)). `pnpm run openapi` rewrites `docs/api/openapi.json`.
