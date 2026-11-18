# Swellwright: development plan

> English translation of the [Russian design document](../../ru/design/00-index.md).

Status: **plan**, no code yet. Tagline: "Swellwright: deployment and operations for Remnawave nodes". The project is **unofficial**, is not part of Remnawave, and does not claim any affiliation with it.

## 1. Purpose
A single web console and API for the whole lifecycle of a Remnawave fleet: servers (inventory, SSH, terminal), deployment and maintenance of nodes, DNS, certificates, panel objects (profiles, hosts, squads, templates, hops), updates, security, backups, monitoring, and probes from different networks. This covers everything administrators usually do with scattered scripts (deploying, renaming, and replacing nodes, editing DNS, rolling out subscription templates), and the things scripts handle poorly: resuming after a failure, schedules, drift control, monitoring, a terminal, and a role model.

## 2. Goals and non-goals
**Goals**
- Full coverage of fleet scenarios (catalog in `03-scenarios.md`: 87 scenarios) with no "manual gaps": any action on a node, DNS, the panel, or hops can be done from Swellwright, with a plan, approval, verification, and rollback.
- Full integration with Remnawave 3.4.x: all 218 API operations are available through a typed client; convenient scenarios on top of them; extensions to what the panel offers (hop chains, drift and conventions, canary rollouts, configuration snapshots, probes).
- An interface as close to the Remnawave panel as possible: the same stack and the same libraries (React 19, Mantine 9, TanStack Query, Zustand, React Router 7, Zod, Tabler icons, Monaco, xterm.js).
- OpenAPI 3.1 as a first-class artifact: documentation (Scalar), typed SDKs, the CLI, and MCP are built from it.
- Secrets and recurring settings are kept in Swellwright's encrypted vault; scenarios ask only for what changes.
- Docker, like the panel; the fleet keeps working without Swellwright (nodes are autonomous).
- **An open, universal project (AGPL-3.0-only, GitHub for everyone).** The core suits any Remnawave administrator; **all code is public**, including the RU-CENTER API integration and the self-steal node scheme (they are packaged as plugins and examples); only **instance data** is not published (domains, IPs, node names, tokens, passwords, keys, results), see `13-plugins-and-opensource.md`.

**Non-goals**
- It does not replace the panel and does not serve customers as billing (the "Users" module is optional and limited to administration).
- It is not a public service and not SaaS; there is one instance owner, and a small team is possible.
- It is not a VPN client and not a store of user traffic.
- It does not require agents on nodes (agentless over SSH by default; an agent is optional and comes later).

## 3. Principles
1. **Read-only by default.** Every change goes through a cycle: plan, approval, apply, verify, and rollback on failure.
2. **Every change is reversible or explicitly marked irreversible** (a rollback record in the journal, a snapshot before the change).
3. **Idempotent steps.** Repeating a step is safe.
4. **Durable execution.** Run state lives in the database: a worker crash, a restart, or an SSH drop does not lose progress; steps on a node run as a separate process and survive a disconnect.
5. **Least privilege and minimal exposure of secrets.** Tokens with scopes, SSH certificates, output redaction; secrets leave the vault only for the steps that need them.
6. **Fleet autonomy.** A Swellwright failure does not break nodes or the panel; break-glass access remains (backup keys kept outside Swellwright, direct SSH to nodes).
7. **Observability by default:** stages, timings, a remaining-time estimate, an output log, events, metrics.
8. **Versions are pinned**, updates happen only deliberately; dependency sources are verified.
9. **Fact and hypothesis are distinguished:** recommendations are labeled "measured / community / assumption".
10. **The installer and the node baseline are versioned:** any change to nodes goes through a versioned artifact.
11. **Do not trust node output:** output is stripped of control sequences, never executed, and never rendered into HTML without escaping.
12. **One source of truth for panel objects:** the panel; Swellwright keeps snapshots, intents, and a journal.
13. **A universal core and plugins:** the core knows nothing about a specific DNS provider, hosting provider, carrier, or naming scheme; specifics are attached and detached by plugins without changing the core.

## 4. Covered capabilities
- Deployment, redeployment, rename, replacement, and decommission of nodes: stages, run journal, rollback of the panel and the server, DNS through drivers (including the RU-CENTER (NIC.RU) API), wait steps, handling of common failures.
- The node installer and the node engine (snapshot, rollback, SSH/UFW safety net) as versioned Swellwright artifacts; the engine requires python3 on the node.
- Fleet maintenance (P/N scenarios with a plan, a diff, and rollback): syncing host addresses with node IPs, creating and rolling out subscription templates, configuring sniffing and the profile's DNS/SMTP rules, REALITY key rotation, restricting the node API port, rolling reboots of nodes one at a time, update checks.
- Panel backups: encryption (CMS), timers, restore verification in a disposable Postgres.
- Probes: measuring nodes from different networks, checking fingerprints and whole Xray subscription configs in a sandbox.
- Contract tests and validation of request bodies against the Remnawave OpenAPI specification (3.4.x).
- A node baseline and a "fact / hypothesis" reference.
- Safety policies (policy engine, `08-engine.md`): read-only by default; backup and rollback; accounting for the impact of editing a shared profile; canary and small groups; preserving fallback access; one parameter at a time; distinguishing fact from hypothesis; node changes are reflected in the installer.
- Configurable conventions: remark template, `vlessRoute`, hop service, test-object marker 🧪, address=IP.

## 5. Document map
| File | Contents |
|---|---|
| `00-index.md` | this file: goals, principles, covered capabilities, design decisions |
| `01-architecture.md` | components, stack, processes, SSH layer, repository structure, topologies |
| `02-data-model.md` | entities and relations, data classification, storage |
| `03-scenarios.md` | the full scenario catalog with safeguards and rollback |
| `04-remnawave-integration.md` | panel integration, permission and scope matrix, extensions |
| `05-security.md` | threat model, secrets vault, access, terminal, permission matrix for external systems |
| `06-api-openapi.md` | REST, events, OpenAPI, SDK, CLI, MCP, webhooks |
| `07-ui-ux.md` | interface, pages, patterns, parity with the panel |
| `08-engine.md` | scenario engine, policies, rollout strategies, step catalog |
| `09-ops-docker.md` | Docker, placement, backups, updates, disaster recovery |
| `10-testing.md` | tests, lab, fault injection, readiness criteria |
| `11-roadmap.md` | phases, contents, acceptance criteria, order |
| `12-risks-open.md` | risks, assumptions, what to verify, open decisions |
| `13-plugins-and-opensource.md` | plugins, extension points, manifest, plugin security, the self-steal node scheme and integrations as public plugins and examples, organization of the open repository |

## 6. Design decisions
| Question | Decision | Consequences |
|---|---|---|
| Placement | **on the same host as the panel or on a separate server** (both options are supported) | when placed next to the panel: a separate Docker network and user, own Postgres and Valkey, resource limits, firewall, no `docker.sock`; measures in `05`, `09` |
| Terminal | **included; the user enters real SSH credentials for each session** | the terminal does not use stored secrets; credentials live only in session memory; recording is optional; `05` |
| SSH access methods | **passwords, certificates, keys: any, configurable** | no certificate authority is imposed; all methods are supported; recommendations are made through policies; `05` |
| Panel token | **one token** | `*` by default; a least-privilege profile remains an option; `04` |
| License | **AGPL-3.0-only** | compatible with the panel code; DCO; license checks; `13` |
| Publication | **GitHub for everyone; everything that is code is public** (including RU-CENTER and the self-steal node scheme as plugins and examples); instance data is not published | one `swellwright` repository; `13` |
| Documentation, contributions | **English primary, Russian secondary; DCO** | `13` |
| Third-party plugins | **declarative drivers and containers from the start** | sidecars without `docker.sock`; `13`, `09` |
| Notifications | **Telegram first** | a bot and approvals by buttons (low and medium risk) |
| cert-sync (distributing certificates to nodes) | **a pluggable mechanism, published** | the `CertDistributor` interface; the `certs-rsync` and `certs-cron-script` plugins (an adapter to an external certificate sync script; the command, node list, and user are set in settings); `13` |
| Support policy | **Remnawave: the current and the previous minor version; OS: Ubuntu 22.04 and 24.04; Debian 12/13 where possible after verification in the lab, not in 1.0** | `10`, `11`, ADR 0010 |
| Remnawave users module | **the official `users-admin` plugin, off by default** | the core sees users only in masked form; `05`, `13` |
| Distributing and issuing certificates | **`certs-rsync` by default for new installations; `certs-cron-script` is supported as a compatibility adapter; issuance stays external (for example in the nginx management panel) or is done by `acme-*` plugins; the core contains only the `CertDistributor` and `CertIssuer` interfaces** | existing setups are not broken and nobody is restricted; the choice is the administrator's; `13` |
| Telegram | **in 1.0: notifications and approval by buttons; the `/status` and `/runs` commands, read-only, after 1.0** | `13` |
| Dual approval, multi-panel support, hosting provider APIs | **dual approval in 1.0 as an optional policy; multi-panel support and hosting provider APIs after 1.0** | `08`, `11` |
| Node.js and packages | **Active LTS at the time of the start (Node 26, pinned `>=26 <27`), pnpm 10 installed explicitly (Corepack has not been bundled with Node since version 25), TypeScript 6.0.x until typescript-eslint supports TypeScript 7, versions pinned** | ADR 0009 |
| UI foundation | **the panel's code, components, and theme are used as the foundation (AGPL-3.0, keeping copyright notices and marking changes); the Remnawave name and logo are not copied** | `07`, ADR 0011 |
| The `*` token | **a warning when it is issued and a permanent banner for the instance owner while `*` is in use, with a link to the `core` profile** | `04`, `05` |
| Vault auto-unseal | **off by default; enabled explicitly as a less secure mode with an audit entry, not on a host shared with the panel** | `05`, ADR 0006 |

## 7. Scope summary
Core modules: 14 (servers, nodes, panel, DNS, certificates, hops, secrets, security, probes and alerts, schedules, reports, terminal and commands, integrations, platform) and the **plugin system**. Scenarios in the catalog: 87. Phases: 11 (`11-roadmap.md`), a target of 42-53 weeks to version 1.0 (with plugins and publication preparation). A working slice for deployment after phase 4. Documents in the plan: 14 (00-13).
