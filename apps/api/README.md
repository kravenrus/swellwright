# apps/api

NestJS API: controllers, gateways, authentication, OpenAPI (phase 1).

Status: first slice. `GET /api/v1/health`, `/ready`, `/version` and `/openapi.json`, request ids, one error envelope, contract-checked responses. First-run setup, password plus authenticator sign-in, sessions and sign-out (`/setup/*`, `/auth/*`, [ADR 0014](../../docs/adr/0014-sign-in-with-password-and-authenticator.md)). `/ready` checks Postgres (the migrations of `packages/db` must be applied) and Valkey when their URLs are set. Run it with `pnpm --filter @swellwright/api start` (see `.env.example`); design in `docs/en/`.
