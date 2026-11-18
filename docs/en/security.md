# Security

Swellwright holds the keys to a whole fleet, so it is the most valuable target in it. The goal: compromise of any single part (a node, the panel, a container, a dependency, a browser) does not reveal everything else.

## Threat model (summary)

| Asset | Threat | Main controls |
|---|---|---|
| Vault | stolen database, dump or backup | application-level encryption (AES-256-GCM, wrapped keys), master key only in memory, Argon2id |
| SSH access to nodes | leaked keys, reused passwords | pinned host keys, per-server credentials, optional short-lived SSH certificates, source restriction, offline break-glass key |
| Panel tokens | leak, excess privilege | scopes, expiry, rotation reminders, usage audit |
| DNS credentials | domain takeover | zone-limited tokens, confirmation for bulk edits |
| Web UI | session theft, XSS, CSRF | TOTP/passkeys, httpOnly cookies, SameSite=strict, CSRF tokens, strict CSP, step-up authentication |
| Node output | terminal-escape or HTML injection | sanitization, rendered as text, terminal only in xterm |
| Dependencies | supply chain | frozen lockfiles, `--ignore-scripts`, SBOM, scanning, manual review of updates |
| Host | compromise of the Swellwright host | isolated network, minimal images, read-only FS, non-root, egress allowlist |
| Plugins | third-party code with secret access | trust levels, process isolation, declared permissions, network proxy, signatures, audit |
| Operator | a mistaken action | plan with impact, approvals, rollback, maintenance windows, policy guardrails |

## Vault

- Operator passphrase -> Argon2id -> KEK; the KEK wraps data keys; each secret has its own data key (AES-256-GCM, AAD = secret id + version + context).
- **Sealed on start:** no run and no secret access until unsealed (passphrase, optionally plus a key file from another machine). Auto-unseal (systemd-creds/TPM) is an explicit, less secure option.
- Decrypted values live only in the worker for the duration of a step and are zeroed; never written to Redis, logs, events, core dumps or step environments (only to mode-600 files on the node that are shredded afterwards).
- Reveal needs a permission and step-up authentication and is audited. Rotation of KEK, data keys and secrets is supported. A recovery kit (Shamir 3-of-5 or a printed key) is created at setup.
- Every secret value is registered in a redaction set; output and events are checked before being stored.

## Authentication and authorization

Password (Argon2id), mandatory TOTP, WebAuthn passkeys, optional OIDC; brute-force lockout and IP restrictions. Short sessions, httpOnly Secure SameSite=strict cookies. **Step-up authentication** for the terminal, secret reveal, token creation, high-risk approvals and destructive panel operations. Roles are sets of fine permissions (`servers:read`, `runs:execute:deploy`, `vault:reveal`, `terminal:use` and so on). Tokens carry scopes `sw:<resource>:<action>`, expiry and IP restrictions and are stored hashed.

## SSH access methods (configurable)

Password (and sudo password), key, or certificate; any combination, chosen per server, group or default, with an attempt order. Nothing is forced.

- Host keys are pinned; changes block the operation until confirmed (a reinstall is confirmed explicitly in the workflow).
- First login to a fresh server is usually by password; the workflow then installs the operator's access, and closes root login only after a verified login and sudo (so access is never lost).
- A safety timer on the node reverts firewall and SSH changes if a new login is not confirmed.
- An optional SSH certificate authority issues short-lived certificates with principals and `from=` restrictions.
- An **offline break-glass key** outside Swellwright remains.

## Web terminal

The terminal is enabled by default only for users with the `terminal:use` permission and step-up authentication on each session. **The user types real SSH credentials (host, user, password or private key, passphrase) for every session.** Swellwright never injects stored secrets into the terminal; the credentials live in session memory and are erased on close, never stored in the database, logs or recordings.

Further controls: idle and maximum duration timeouts, host-key pinning with confirmation, no broadcast input by default, confirmation for multi-line paste, active-session list with forced close. Session recording is optional, off by default (output can contain secrets), encrypted and masked when enabled.

Ad-hoc commands and workflows use **stored** access, pass through policy and audit, and are a different feature from the terminal.

## Web security

Strict CSP without `unsafe-inline`, frame-ancestors, HSTS, Referrer-Policy, Permissions-Policy, CSRF protection, request-size limits, rate limiting, WebSocket Origin checks, validated uploads, no internal error details in responses.

## Outbound traffic (SSRF)

Allowlist of inventory hosts, the panel, DNS and hosting drivers, release feeds and notification endpoints. Cloud metadata, loopback and internal ranges are blocked for user-supplied URLs; DNS-rebinding is prevented by pinning the resolved address.

## Audit

An append-only log with a hash chain (each record contains the previous hash), export and integrity verification; it records logins, runs, approvals, secret reveals, terminal sessions, policy and token changes.

## Supply chain

Frozen lockfiles, manual review of dependency updates, CycloneDX SBOM, image and dependency scanning, license checks, base images pinned by digest, optional cosign signatures, a review checklist for third-party code.

## Privacy

No telemetry. Personal data of panel users is masked by default and revealed only with a permission.

## Backup and disaster recovery

Daily encrypted database backups (public key on the server, private key only with the operator), vault metadata export, off-site copies, a monthly restore test. If Swellwright is lost, the fleet keeps running and access is regained through the break-glass key; if it is compromised, panel tokens, SSH credentials and DNS secrets are rotated through an incident wizard.

## Permissions Swellwright needs on external systems

| System | Access | Minimal form |
|---|---|---|
| Remnawave panel | API token | one `*` token by default; optional `core`, `readonly` and `probe` profiles |
| Nodes | SSH | per-server password, key or short-lived certificate; sudo |
| Panel host | SSH | restricted user for `docker compose` in the panel directory and the backup and certificate directories; no `docker.sock` |
| DNS provider | API | zone-limited token (provider-specific) |
| Hosting provider | API | scoped to the needed project and actions |
| Notifications | bot or webhook | send-only |
| Backup targets | storage keys | write and list under its own prefix |
| Docker host | none | no `docker.sock` inside any Swellwright container |
