# ADR 0010: Releases, versioning and support policy

Status: accepted

## Context
Swellwright works against a panel API that changes, and drives real servers. Operators need to know what is supported and how releases are made.

## Decision
- Semantic Versioning. The public API is versioned in the path (`/api/v1`); breaking changes only in a new major version, enforced by `oasdiff` in CI.
- Supported Remnawave versions: the current and the previous minor (3.4.x and the one before it); the typed client is pinned per panel version and isolated by version adapters.
- Supported node operating systems: Ubuntu 22.04 and 24.04. Debian 12 and 13 are best effort after verification in the lab and are not part of 1.0.
- Security fixes go to the latest minor version (see `SECURITY.md`).
- Releases are built in CI, published as container images pinned by digest, with a CycloneDX SBOM and optional cosign signatures; the OpenAPI document is published as a release artifact; release notes are generated from labels (`.github/release.yml`) and the changelog follows Keep a Changelog.

## Consequences
A clear and small support matrix limits the maintenance load. Adding a Remnawave minor or an operating system means a lab verification and an update of the documented matrix.
