# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial repository skeleton: license (AGPL-3.0-only), DCO, code of conduct, contribution and security policies.
- Design documents (English overview, full Russian design set and its English translation), architecture decision records.
- Annotated UI wireframes: overview, server card, plan and approval, run card, sealed vault, vault, first-run setup and phone layouts.
- Phase 0 monorepo skeleton: pnpm workspaces, Turborepo, strict TypeScript, ESLint, Prettier and a CI build job.
- Phase 1 first slice: route registry and OpenAPI 3.1 generator (`packages/contracts`), NestJS 12 API with health, readiness, version and the API description (`apps/api`), the Remnawave panel theme and application shell (`packages/ui`, `apps/web`), development compose file, ADR 0012.
- Phase 1 data layer: Prisma 7 with the first model `User` and its migration (`packages/db`), a shared `Database` client, `/ready` that also requires the migrations to be applied, a checksum check of the Prisma schema engine, database commands and CI steps, ADR 0013.
- Phase 1 sign-in: first-run setup with a one-time token, password (Argon2id) and authenticator (TOTP) sign-in, recovery codes, sessions, lockout, `Origin` check, sign-in screens in the console, routes that declare their authentication level, ADR 0014.
- Phase 1 roles and audit: a closed permission catalogue and the five built-in roles as fixed sets, a permission on every signed-in route enforced by a guard and checked by a test, `GET /roles`, the append-only audit chain (`audit_events` with database triggers, SHA-256 links, advisory-locked numbering), records for first-run setup, sign-in and refused access, `GET /audit` and `POST /audit/verify-chain`, the Roles and Audit pages of the console, ADR 0015.
- Phase 1 users and credential reset: invite a user (no password, a one-time 72-hour invitation), change role, status, display name and e-mail, reset credentials, choose a password with an invitation, change your own password, the rule that there is always an active owner, `node dist/admin.js` (`users`, `reset-credentials`) for the host when nobody can sign in, the Users page, the invitation screen and the password dialog of the console, ADR 0016.
- Phase 1 step-up authentication: a session is elevated by the sign-in and renewed with an authenticator or recovery code (`POST /auth/step-up`, five minutes by default, `SW_STEP_UP_MINUTES`), routes declare `stepUp` (OpenAPI `x-sw-step-up`) and answer 403 `step_up_required`, permissions that always need it (`users:write`, `vault:manage`, `vault:reveal`, `terminal:use`) are checked by a test, user management and password change now need it, the console asks for a code and retries, ADR 0017.
- Phase 1 deployment: a container image (`Dockerfile`, pinned base image, pnpm and Prisma engine, non-root, read-only) with the API, the console and the migration tool, the API serves the console with a content security policy and cache rules (`SW_WEB_DIR`), `SW_TRUSTED_PROXIES` for the address of the client behind a proxy, `deploy/compose/docker-compose.yml` (PostgreSQL, Valkey, a one-shot `migrate`, the server), a CI job that starts the stack and runs `scripts/smoke-test.sh`, Dependabot for the image, the compose file and the actions, ADR 0019.
- Repository hygiene checks (secrets, personal e-mail addresses, public IP addresses, forbidden patterns) and DCO check.
- Brand assets (animated banner, workflow and overview diagrams, logo, social preview), English and Russian README, support policy, release-notes categories.
