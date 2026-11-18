# Plugins

The core is universal. Everything that depends on a vendor, protocol, script or naming scheme is a plugin or an example, the way login providers are options in the Remnawave panel.

## What is core and what is a plugin

| Area | Core | Plugin |
|---|---|---|
| Vault, audit, roles, login | local users, password, TOTP, WebAuthn | `auth-oidc`, `auth-telegram` |
| Inventory, SSH (password, key, certificate), terminal, files | yes | external key stores, certificate authority drivers |
| Workflow engine, policies, approvals, schedules | yes | workflow packs |
| Remnawave client | yes (version adapter) | adapters for other panels (future) |
| Standard node: Docker, remnanode, UFW, fail2ban, sysctl, SSH policies, API-port ACL | yes | |
| Self-steal node (HAProxy SNI, nginx SelfSNI, decoy site, certificate receiver) | | `node-selfsteal` |
| DNS | interface, manual mode | `dns-rucenter`, `dns-cloudflare`, `dns-route53`, `dns-rfc2136`, declarative drivers |
| Certificates | checks, expiry alerts, register/sync scenarios | `certs-rsync`, `certs-cron-script`, `certs-push-ssh`, `acme-*` |
| Hosting | manual mode | `hosting-*` (by API) |
| Notifications | internal events | `notify-telegram`, `notify-email`, `notify-webhook` |
| Probes | agent framework and schedules | `probe-vless-xray`, `probe-freeze`, `probe-mtr` |
| Client compatibility | templates and rule mechanics | `client-happ` and others |
| Secrets | built-in vault | `secret-hashicorp-vault`, `secret-file` |

## Extension points

`DnsProvider`, `CertDistributor`, `CertIssuer`, `HostingProvider`, `NotificationChannel`, `AuthProvider`, `SecretBackend`, `AccessMethod`, `NodeFlavor`, `BaselinePack`, `ConventionPack`, `WorkflowPack`, `ProbeTest`, `ReportTemplate`, `ClientProfile`, `PanelAdapter`, `UiContribution`. For REST services (DNS, hosting, notifications) a **declarative driver** (YAML: authentication, requests, response mapping) avoids executing third-party code.

```ts
interface DnsProvider {
  id: string; configSchema: ZodSchema; secretKinds: string[];
  listZones(ctx): Promise<Zone[]>;
  listRecords(ctx, zone): Promise<DnsRecord[]>;
  plan(ctx, intent: DnsIntent): Promise<DnsPlan>;     // read only
  apply(ctx, plan: DnsPlan): Promise<DnsChange>;      // write, commit if needed
  undo(ctx, change: DnsChange): Promise<void>;
  authoritativeServers?(ctx, zone): Promise<string[]>;
}
```

## Manifest (`swellwright.plugin.json`)

```json
{
  "id": "dns-example", "version": "1.0.0", "name": "Example DNS",
  "engines": { "swellwright": ">=1.0 <2" },
  "provides": [{ "kind": "DnsProvider", "entry": "./dist/provider.js" }],
  "permissions": { "network": ["api.example.com:443"], "secrets": ["dns-token"], "panel": [], "ssh": false },
  "config": { "schema": "./config.schema.json" },
  "storage": { "namespace": "dns-example" },
  "license": "AGPL-3.0-only"
}
```

Permissions are requested explicitly and shown when a plugin is enabled. A plugin gets an isolated key-value and JSON store, no access to the core database, and its settings form is generated from its schema.

## Trust levels and isolation

- **builtin / official:** shipped in the image or monorepo, signed; run in a worker process under restrictions (Node permission model where available); network only through a core proxy limited to the hosts in the manifest.
- **community:** run only as **container sidecars** (OCI image + manifest) or as declarative drivers. A sidecar is a compose service on an internal network with a network policy, resource limits and no access to the database or other secrets; Swellwright **does not get `docker.sock`**: enabling a plugin generates a compose fragment that the operator applies.
- **local:** a directory owned by the operator, at the operator's risk.
- Secrets are handed to a plugin only for the duration of a call and only of the declared kind. No `postinstall` scripts, pinned versions, hash and signature verification, an SBOM per plugin, manual approval of updates (permission diff first), every call audited, immediate disable.

In-process isolation in Node is not a hard boundary and is never relied on for untrusted code.

## Lifecycle

Discover (a mounted `plugins/` directory, npm packages `@swellwright/plugin-*`, local directories) -> list in Settings -> enable after reviewing permissions -> configure -> use -> update (permission diff, no automatic download) -> disable -> remove (plugin data optional).

## Registry

`registry/index.json` in this repository lists community plugins (links, versions, hashes, trust level), added through pull requests. Swellwright never downloads anything without an explicit operator action.

## Examples shipped in this repository

`examples/conventions` (naming and remark patterns), `examples/policies` (hop service and route ranges, panel and node on one host, API-port allow-list changes), `examples/templates` (subscription templates without credentials or real domains), `examples/chains` (hop presets), declarative driver samples.
