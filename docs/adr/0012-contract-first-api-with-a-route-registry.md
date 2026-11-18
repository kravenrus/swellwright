# ADR 0012: Contract-first API with a route registry

Status: accepted

## Context
ADR 0009 made the Zod schemas in `packages/contracts` the single source for types, validation and the OpenAPI document. The panel does it with `nestjs-zod` and Swagger decorators on controllers: the description sits next to the handler, but nothing stops the description and the server from drifting apart.

## Decision
- `packages/contracts` holds the **route registry** (method, path, operation id, tags, authentication, request and response schemas) and builds the OpenAPI 3.1 document from it with `z.toJSONSchema`. Controllers carry no OpenAPI decorators, so `@nestjs/swagger` and `nestjs-zod` are not used.
- The server binds handlers to the registry: `@ContractRoute(route)` takes the method and the path from the definition, so a handler cannot exist without a contract entry, and a test fails when a registered route is not served.
- In development and in tests every response is validated against its contract. A violation answers 500 with the generic error envelope and logs the cause; details are never returned. In production the check is off unless enabled.
- Every non-2xx response uses one envelope with a stable `code` and the request id. A failing `/ready` keeps the readiness body shape with status 503.
- The generated document is committed as `docs/api/openapi.json`. CI regenerates it and fails when the file differs; from the first release `oasdiff` also checks compatibility (ADR 0010). Until then a pull request job (`api-compat`) only reports what changed against main: it runs the release binary pinned by version and SHA-256, uploads nothing and does not gate the merge; the gate (`oasdiff breaking --fail-on ERR`) is added when the first version is tagged.
- Versions: NestJS 12 (ESM native, Express 5; the panel is on 11). The database library is chosen with the first model (ADR 0013).

## Consequences
The API description is exact by construction and reviewable as a file diff. A route is added in two places, the registry and the handler, and the tests enforce that they agree. Named schemas must be listed as components; the generator rejects a response schema that is not.
