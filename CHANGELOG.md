# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial repository skeleton: license (AGPL-3.0-only), DCO, code of conduct, contribution and security policies.
- Design documents (English overview, full Russian design set and its English translation), architecture decision records.
- Annotated UI wireframes: overview, server card, plan and approval, run card, sealed vault, vault, first-run setup and phone layouts.
- Phase 0 monorepo skeleton: pnpm workspaces, Turborepo, strict TypeScript, ESLint, Prettier and a CI build job.
- Phase 1 first slice: route registry and OpenAPI 3.1 generator (`packages/contracts`), NestJS 12 API with health, readiness, version and the API description (`apps/api`), the Remnawave panel theme and application shell (`packages/ui`, `apps/web`), development compose file, ADR 0012.
- Repository hygiene checks (secrets, personal e-mail addresses, public IP addresses, forbidden patterns) and DCO check.
- Brand assets (animated banner, workflow and overview diagrams, logo, social preview), English and Russian README, support policy, release-notes categories.
