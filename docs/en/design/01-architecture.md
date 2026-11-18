# 01. Architecture

> English translation of the [Russian design document](../../ru/design/01-architecture.md).

## 1. Stack (aligned with the Remnawave stack; versions checked against Remnawave 3.4.x)
| Layer | Choice | Notes |
|---|---|---|
| Backend | NestJS 12 (the panel uses 11), TypeScript 6.0 (the panel uses 5.9, see ADR 0009), Zod 4 (route registry, ADR 0012), CQRS, `@nestjs/schedule`, `@nestjs/terminus`, `@willsoto/nestjs-prometheus` | same as the panel |
| Database | PostgreSQL + Prisma 7 (ADR 0013) (+ Kysely for heavy queries, as in the panel) | Prisma migrations, time-series partitioning |
| Queues and locks | BullMQ + a Redis-compatible store (Valkey), Redlock and Postgres advisory locks | separate queues per task type |
| SSH | `ssh2` (the panel already has it) | pool, host key pinning, detached processes on the node, PTY, SFTP |
| Panel API | `@remnawave/backend-contract` (version matched to the panel version) | typed requests and responses instead of home-grown OpenAPI validation |
| Frontend | React 19, Vite, Mantine 9 (core, notifications, modals, spotlight, code-highlight, dropzone, form, dates, charts), TanStack Query 5, Zustand 5, React Router 7, Zod 4, i18next (ru, en), Tabler icons, Monaco, `@xterm/xterm` | same as the panel |
| OpenAPI | generated from the route registry (ADR 0012), Scalar UI | same as the panel (`@scalar/nestjs-api-reference`) |
| Monorepo | pnpm workspaces, Turborepo, strict ESLint and TS | `--frozen-lockfile --ignore-scripts` |
| Containers | Docker, multi-stage, non-root | same as the panel |

## 2. Components
```
 browser ──HTTPS──> nginx (proxy)  ─> swellwright-api  ──> PostgreSQL
    ^  WS/SSE (events, terminal)        │  ^             Valkey (queues, locks)
    └───────────────────────────────────┘  │
                                swellwright-worker ──SSH──> servers / nodes
                                       │  └──HTTPS──> Remnawave API, DNS API, providers, GitHub (releases)
                              swellwright-probe (optional, on observer machines) ──HTTPS──> api
```
- **api**: REST and OpenAPI, WebSocket/SSE, serving the UI, authentication, authorization, scheduling (enqueuing jobs).
- **worker**: runs workflows (the engine), SSH, panel and DNS calls, probes; scales horizontally (a single process at the start, but the code keeps no state in memory).
- **web**: a static UI, built into the api image.
- **probe-agent** (optional): a lightweight agent for machines in other networks (different carriers, different sites); outbound HTTPS to the api only, with a token that can only write results.
- **cli** `sw`: a thin wrapper over the SDK.
- **mcp** (optional): an MCP server on top of the same API (read-only first).

## 3. Monorepo structure
```
apps/api          NestJS: controllers, gateways, authorization, OpenAPI
apps/worker       NestJS worker: queue processors, engine
apps/web          React: UI
apps/cli          sw
apps/probe-agent  probe agent (TCP, TLS/SNI, and REALITY via xray tests, 16-20 KB freeze test)
packages/contracts       Zod schemas and types (shared by api, web, cli, SDK)
packages/db              Prisma schema, migrations and the database client (shared by api and worker)
packages/engine          engine: workflow DSL, journal, rollback, strategies, policies
packages/steps           step library (ssh, node, panel, dns, certsync, provider, http, probe, notify, approval)
packages/remnawave       wrapper over backend-contract: client, version adapters, impact calculator
packages/ssh             ssh2: pool, detached steps, sudo, terminal, SFTP, certificates
packages/vault           encryption, sealing, rotation
packages/policy          rules and evaluation
packages/node-assets     install.sh, node-engine (py), baseline checks, versions and hashes
packages/ui              shared components and theme (visually matching the panel)
packages/testing         fake panel, fake SSH, lab
packages/plugin-api      extension contracts (DnsProvider, NodeFlavor, AuthProvider, ...)
plugins/official/        official plugins (DNS drivers: rucenter, cloudflare, rfc2136, and others; hosting provider drivers; login; notifications; the selfsteal node flavor; certificate distribution)
docs/ (en, ru)  deploy/  examples/
```

## 4. Execution model
- A run is a `WorkflowRun` record plus enqueuing. A worker takes locks on resources (node, DNS zone, panel, panel server) and executes the stages described in the workflow.
- State (stages, steps, events, undo records, approvals) is stored in Postgres after every step (checkpoints). If a worker crashes, another worker picks the run up from the last checkpoint; a step that was running on a node as a detached process is re-read from its log and exit code.
- Run events are streamed to the UI (WebSocket/SSE) and persisted; step output is stored in chunks with secrets redacted.
- Approvals (approval gates) pause a run until a human decides (details in `08-engine.md`).

## 5. SSH layer
- **Host key pinning**: the first login shows the fingerprint for explicit confirmation, later logins verify it; a key change blocks the operation and raises an alarm (the OS reinstall scenario is confirmed explicitly).
- **Access modes**: password (for a new server, root), key, **SSH certificate** from your own certificate authority (recommended, `05-security.md`), jump host (optional).
- **Step execution**: started through `setsid` with a log and an exit-code file in `/var/lib/swellwright/runlogs/<run>/`; the log is read by polling over a single multiplexed connection; a dropped connection does not kill the step; reconnecting resumes reading from the previous offset.
- **sudo**: the password is passed only through stdin, never in arguments; for certificate login, passwordless sudo for a restricted list of commands (options in `05`).
- **Terminal**: PTY through `ssh2`, xterm in the browser, session recording, a separate permission and step-up authentication (`05`).
- **Files**: SFTP (browsing, upload, download with a checksum), bulk distribution.
- **Timeouts and alarms**: keepalive, time limits, cancellation through a signal on the node.
- **Artifacts on the node**: `/var/lib/swellwright/` (artifacts, snapshots, step logs, `node-engine.py`), mode 700; after a run, secret files are deleted (`shred`).

## 6. Node engine (on the node itself)
The node-side part is implemented as a Python engine (commands `snap`, `undo-plan`, `undo`, `safety-arm`, `safety-restore`), uploaded as an artifact and invoked over SSH. It requires `python3` (present on Ubuntu 22.04/24.04; otherwise the scenario installs `python3-minimal`). It is versioned together with `install.sh`; Swellwright verifies the hash before running it.

## 7. Integrations (outbound)
Remnawave API (tokens with scopes), DNS providers (through drivers), hosting provider APIs (through drivers), GitHub releases and Ubuntu security notices (USN) for update channels, Telegram and webhooks (notifications). Everything else is closed by an outbound traffic policy (allowlist).

## 8. Deployment topologies
1. **A separate server (recommended):** a small VM or machine; Swellwright runs apart from the panel, with no shared kernel and no shared host.
2. **On the same host as the panel:** a separate user without sudo, a separate Docker network, **its own** Postgres and Valkey (not the panel's), resource limits (cpus, memory, pids), a firewall that restricts outbound connections, no `docker.sock`, no reading of the panel database; separate backups and a separate vhost. Residual risk: the shared kernel and host (measures in `05`, `09`).
3. **A runner in another network** (optional): an executor worker with an outbound connection to the api, for tasks that need a particular network path.
4. **An agent on a node** (optional, later): an outbound WSS connection to the api, for servers without reachable SSH; not used by default.

## 9. Observability of Swellwright itself
JSON logs with secret redaction, `/health` and `/ready`, Prometheus metrics (runs, stage durations, SSH errors, queue depth, lock age, remaining token lifetime), OpenTelemetry tracing (optional).

## 10. Why TypeScript
- One stack with the panel (easier to maintain: `@remnawave/backend-contract` types, Zod schemas shared by the server, the UI, and the CLI).
- Durable execution, queues, events, and locks are easier to build in a single runtime.
- Deployment logic (stages, journal, rollback, DNS, rename) is implemented in the core in TypeScript and verified by end-to-end scenario (golden) behavior tests that run automatically.
- The node-side part stays in sh and Python: a node needs POSIX sh and minimal dependencies.

## 11. Core and plugins
The core is universal (inventory, SSH, vault, engine, policies, panel client, terminal). The specifics (DNS and hosting providers, external login, notifications, node flavors, conventions, and probe tests) are plugged in by plugins with a manifest, permissions, and process isolation. Builtin providers are written as plugins from the first phase. The contracts are in `packages/plugin-api`; details and the plugin list are in `13-plugins-and-opensource.md`.
