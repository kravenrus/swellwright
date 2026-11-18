# ADR 0003: A universal core with plugins

Status: accepted

## Context
The project will be public. Provider-, vendor- and operator-specific logic (DNS providers, certificate distribution mechanisms, naming conventions, node stack variants) must not leak into the core or into the public history as private data.

## Decision
The core is universal; everything specific is a plugin (code) or an example (configuration packs). Plugins declare permissions in a manifest; declarative drivers need no code; community plugins run only as container sidecars without `docker.sock`. Instance data (domains, IPs, names, tokens, keys) is never part of the repository.

## Consequences
The plugin runtime is built in phase 1 and the built-in providers are written as plugins to exercise it. More moving parts to secure, in exchange for a clear boundary and a public repository free of private data.
