# API and OpenAPI

OpenAPI 3.1 is a first-class artifact. Documentation (Scalar), SDKs, the CLI, the MCP server and contract tests are generated from it.

## Conventions

- Base path `/api/v1`, JSON. Zod schemas in `packages/contracts` define validation, types and the OpenAPI document at the same time.
- The spec is generated at build time, committed (`openapi/swellwright.json`), served at `/api/v1/openapi.json`, with Scalar docs at `/docs`.
- Errors follow RFC 9457 (`application/problem+json`) with a stable error `code`.
- Cursor pagination, uniform filter and sort parameters, `ETag` and `If-Match` for optimistic updates.
- Long operations return `202 Accepted` and a run resource; an `Idempotency-Key` makes a repeated POST return the same run.
- Extensions: `x-sw-risk`, `x-sw-approval`, `x-sw-scopes`, `x-sw-locks`, `x-sw-plugin`.
- Major version in the path; breaking changes only in a new major; `Deprecation` and `Sunset` headers.

## Authentication

Cookie session (UI, TOTP/passkey, CSRF, step-up), Bearer token (CLI, automation, MCP) with scopes, agent tokens (write-only probe results), signed outgoing webhooks (HMAC-SHA256).

## Resource groups

`auth`, `users` and `roles`, `tokens`, `vault` and `secrets`, `servers` (facts, events, snapshots, baseline results), `access`, `terminal`, `commands` and `scripts`, `files`, `panels` and `panel-objects`, `panel-console`, `snapshots`, `conventions`, `chains`, `dns`, `certs`, `blueprints`, `baselines`, `workflows`, `runs` (stages, steps, events, logs, approve, reject, cancel, pause, resume, retry, rollback, undo plan), `approvals`, `policies`, `schedules`, `probes`, `alerts` and `notifications`, `reports`, `audit`, `artifacts`, `advisories`, `plugins` (enable, configure, permissions; routes under `/ext/{pluginId}`), `system`, `webhooks`, `import-export`.

## Real-time

WebSocket `/ws` (channels `runs/{id}`, `fleet`, `alerts`, `servers/{id}`, `terminal/{id}`) with SSE as a fallback. Events carry a monotonic id for replay (`Last-Event-ID`): `run.created`, `run.awaiting_approval`, `stage.started`, `stage.progress`, `stage.finished`, `step.log`, `run.finished`, `run.rolled_back`, `alert.fired`, `server.drift_detected`, `panel.object_changed`, `probe.result`, `vault.sealed`.

## Governance

Spectral linting, `oasdiff` to forbid breaking changes in `v1`, Schemathesis contract tests, generated SDK compile checks, the spec published as a release artifact.
