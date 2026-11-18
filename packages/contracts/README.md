# packages/contracts

Zod schemas shared by API, UI, CLI and SDK; the source of the OpenAPI document.

Status: error envelope, system and sign-in schemas, the route registry (each route states who may call it) and the OpenAPI 3.1 generator ([ADR 0012](../../docs/adr/0012-contract-first-api-with-a-route-registry.md)). `pnpm run openapi` rewrites `docs/api/openapi.json`.
