# 02. Data model

> English translation of the [Russian design document](../../ru/design/02-data-model.md).

The Prisma schema is built from this description. Sensitive fields are encrypted at the application level (the `vault`), not only at the disk level. Data classes: **S** secret (vault only), **P** personal or sensitive (masked by default), **N** normal.

## 1. Access and audit
| Entity | Fields | Class |
|---|---|---|
| `User` | id, name, email (optional), role, status, language, theme, last login | P |
| `Credential` | password (Argon2id), TOTP secret (S), WebAuthn keys (public), recovery codes (hashes) | S |
| `Session` | id, user, IP, UA, created, expires, elevated until | N |
| `Role` / `RolePermission` | name, permission set (`servers:write`, `runs:execute:deploy`, `terminal:use`, `vault:reveal` …) | N |
| `ApiToken` (Swellwright) | name, hash, scopes, expiry, last use, IP restrictions | S (hash) |
| `AuditLog` | seq, time, subject, action, object, outcome, IP, hash of the previous entry (chain) | N |

## 2. Secrets vault
| Entity | Fields |
|---|---|
| `VaultMeta` | KEK version, Argon2id parameters, verification block, state (sealed/unsealed) |
| `Secret` | id, name, type (`panel-token`, `ssh-key`, `ssh-password`, `ssh-ca`, `dns-oauth`, `provider-token`, `telegram`, `generic`), ciphertext (AES-256-GCM), wrapped DEK, version, metadata (expiry, scope of use), secret owner, reveal policy |
| `SecretUse` | which run or step used which secret (without values) |
| `SecretRotation` | rotation history, next scheduled date |

## 3. Inventory
| Entity | Fields |
|---|---|
| `Provider` | name, driver type (`manual`, `hetzner` …), account secret, link to the panel's `infra-billing` |
| `Server` | id, name, provider, IPv4/IPv6, country, OS, lifecycle state (`draft`, `provisioning`, `active`, `draining`, `retired`), tags, notes, link to the panel node (uuid), host keys (fingerprints), access method (link to a secret), maintenance window |
| `ServerAccess` | method (`password`, `key`, `cert`), user, port, priority, source restriction |
| `ServerFact` | JSON of facts (OS, kernel, packages, services, ports, versions, disk, time), timestamp, source |
| `ServerSnapshot` | run, directory on the server, manifest hash, size, status (created, used for rollback, deleted) |
| `ServerEvent` | lifecycle and drift events |
| `NodeLink` | link between `Server` and a Remnawave node (node uuid, profile, inbounds, hosts) |

## 4. Configuration and baselines
| Entity | Fields |
|---|---|
| `Blueprint` | deployment template: profile sample, profile mode, squads, host sample, limits, provider, hardening profile, installer version, DNS policy |
| `Baseline` | node baseline: list of checks, expected values, version |
| `BaselineResult` | server, check, outcome, details, time |
| `Convention` | rules for names and fields: remark template, address=IP, explicit sni, fingerprint policy, `vlessRoute` range, test-object marker (🧪) |
| `PanelConnection` | panel (URL, version, capabilities), tokens (links to secrets), expiry, state |
| `PanelSnapshot` | object types (profiles, hosts, squads, templates, settings, plugins), JSON, hash, time, encrypted |
| `PanelDiff` | a pair of snapshots, differences |
| `HopChain` | entry, exit, `vlessRoute`, hop profile, hosts, mode (`always`, `direct-first`), state |

## 5. DNS and certificates
| Entity | Fields |
|---|---|
| `DnsProviderAccount` | driver, secret, zones |
| `DnsZone` | name, service, provider, NS |
| `DnsIntent` | desired record (name, type, value, TTL), owner (server or run) |
| `DnsChange` | before, after, run, approval, visibility on NS |
| `CertSyncEntry` | node, domain, status, last sync, certificate expiry |
| `CertIssuer` (optional) | ACME module: account, domains, expiry |

## 6. Execution
| Entity | Fields |
|---|---|
| `WorkflowDefinition` | code, version, parameter schema (Zod → JSON Schema), time estimate |
| `WorkflowRun` | id, definition, parameters (without secrets), initiator, state (`planned`, `awaiting_approval`, `queued`, `running`, `paused`, `awaiting_input`, `succeeded`, `failed`, `cancelled`, `rollback_requested`, `rolling_back`, `rolled_back`, `rollback_partial`), time, link to the parent |
| `RunStage` / `RunStep` | order, key, state, start and end, attempts, error |
| `RunEvent` | run, stage, status, payload (JSONB), time |
| `RunLogChunk` | run, step, offset, text (sanitized, secrets hidden) |
| `UndoRecord` | run, number, operation (`panel.delete_node`, `dns.restore`, `node.undo`, `file.restore` …), data without secrets, outcome |
| `Approval` | request, risk, impact, who approved and when, comment |
| `Lock` | resource, owner (run), expiry |
| `Schedule` | cron, scenario, parameters, window, enabled |
| `PolicyRule` / `PolicyViolation` | rule, scope, action (`block`, `warn`, `require-approval`) |

## 7. Observability
| Entity | Fields |
|---|---|
| `ProbeAgent` | name, network/carrier, version, token, last response |
| `ProbeTarget` | node, port, test type, schedule |
| `ProbeResult` | target, agent, time, outcome, metrics (RTT, bytes before the freeze, rcode …); monthly partitions |
| `AlertRule` / `Alert` | condition, severity, state, suppression |
| `NotificationChannel` / `NotificationLog` | Telegram, webhook, email |
| `Report` | type, period, data, format |

## 8. Artifacts and library
| Entity | Fields |
|---|---|
| `Artifact` | type (`installer`, `node-engine`, `baseline`, `script`, `template`), version, SHA256 hash, content, signature, note |
| `Script` | script library (audit, diagnostics): body, parameters, permissions, danger level |
| `ChangeAdvisory` | vulnerability and release records (CVE, USN, GitHub), affected versions, recommendation, "fact/hypothesis" label |

## 9. Retention and lifetime
- Events and run journals: 12 months (configurable); output chunks: 6 months, then compression.
- Probe results: raw for 90 days, aggregates for 2 years.
- Panel snapshots: daily for 90 days, weekly for 2 years.
- Audit: no deletion (export and archive).
- Secrets: versions are kept until revoked; values are never written to logs, events, or snapshots (checked on write).

## 10. Migrations and initial data
Prisma migrate; migrations are rolled back through backups. Initialization: `bootstrap` creates the instance owner (role `owner`) and the vault, then the panel connection wizard loads the fleet (import of nodes, hosts, and profiles), collects facts over SSH, and builds the first drift report without making changes (adoption of existing nodes, scenario N01).
