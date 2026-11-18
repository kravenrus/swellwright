# ADR 0008: Plugin isolation and trust levels

Status: accepted

## Context
Plugins are third-party code that may receive secrets. ADR 0003 decided that everything specific is a plugin; this record fixes how plugins are isolated.

## Decision
Trust levels:

- **builtin / official:** shipped in the image or the monorepo and signed; they run in a worker process under restrictions, with network access only through a core proxy limited to the hosts in the manifest.
- **community:** run only as container sidecars (OCI image plus manifest) on an internal network with a network policy, resource limits, read-only filesystem and dropped capabilities, or as declarative drivers (YAML) that need no code. Swellwright never gets `docker.sock`: enabling a plugin generates a compose fragment that the operator applies.
- **local:** a directory owned by the operator, at the operator's risk.

Secrets are handed to a plugin only for the duration of a call and only of the declared kind. Plugins declare every permission in the manifest, may not run install scripts, are pinned by version, hash and signature, and updates are never downloaded automatically (a permission diff is shown first). Every call is audited and a plugin can be disabled immediately. In-process isolation in Node is not a hard boundary and is never relied on for untrusted code.

## Consequences
Community plugins are harder to run than in-process ones, in exchange for a clear boundary. The plugin runtime is built in phase 1 and the built-in providers are written as plugins to exercise it.
