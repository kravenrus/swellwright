# apps/api

NestJS API: controllers, gateways, authentication, OpenAPI (phase 1).

Status: first slice. `GET /api/v1/health`, `/ready`, `/version` and `/openapi.json`, request ids, one error envelope, contract-checked responses. `/ready` checks Postgres (the migrations of `packages/db` must be applied) and Valkey when their URLs are set. Run it with `pnpm --filter @swellwright/api start` (see `.env.example`); design in `docs/en/`.
