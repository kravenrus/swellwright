# 05. Security, secrets and permissions

> English translation of the [Russian design document](../../ru/design/05-security.md).

Swellwright holds the keys to the whole Remnawave node fleet: it is the most valuable target. The goal of this section: compromise of any single part (a node, the panel, a container, a dependency, a browser) does not reveal everything else.

## 1. Threat model
| Asset | Threat | Main controls |
|---|---|---|
| Vault | theft of the database, a dump or a backup | application-level encryption (AES-256-GCM, wrapped keys), master key only in memory, offline brute force made harder (Argon2id) |
| SSH access to nodes | key leak, password reuse | short-lived SSH certificates, per-server keys, host key pinning, source restriction, break-glass key outside the system |
| Panel tokens | leak, excess privileges | scopes, expiry, separate tokens (write, read, probes), revocation, usage audit |
| DNS credentials | domain takeover | separate applications and accounts with minimal permissions, zone-restricted tokens, confirmation for bulk edits |
| Web UI | session hijacking, XSS, CSRF | TOTP/passkey, httpOnly cookies, SameSite=strict, CSRF token, strict CSP, step-up authentication |
| Node output | malicious control sequences, XSS | output sanitization, rendered as text, terminal only in xterm |
| Dependencies | package substitution | frozen lockfiles, `--ignore-scripts`, SBOM, scanning, manual review of updates |
| Swellwright server | host compromise | dedicated VM, minimal images, read-only FS, non-root, egress policy |
| Instance owner and operators | a mistaken action | plan, approval, rollback, windows, guardrail policies |
| Plugins | third-party code with access to secrets | trust levels, process isolation, permissions in the manifest, network proxy, signature, audit; `community` only in a container (`13`) |

## 2. Vault
- **Key hierarchy:** the instance owner's passphrase -> Argon2id -> KEK; the KEK wraps the data keys (DEK); each secret is encrypted with its own DEK (AES-256-GCM, AAD = secret id + version + context). Argon2id parameters are tuned to the machine (about 256 MiB, t=3).
- **Sealed and unsealed:** after start the service is sealed; running workflows and showing secrets are impossible until the passphrase is entered (or a key file from another machine as a second factor). The exception, "auto-unseal" (systemd-creds/TPM), is allowed only by explicit configuration and is marked as less secure.
- **In memory:** decrypted values live only in the worker process for the duration of a step and are zeroed; they are not written to Redis, logs, events, dumps or step environment variables (only to mode-600 files on the node, which are erased afterward).
- **Reveal:** values are write-only in the UI; viewing requires the `vault:reveal` permission and step-up authentication and is recorded in the audit log.
- **Rotation:** KEK (re-wrapping without re-encrypting the data), DEK, secrets on a schedule; wizards for the panel token, DNS and SSH keys.
- **Recovery:** a recovery kit: Shamir 3-of-5 or a printed key; losing the passphrase and the kit means losing the vault (described in `09-ops-docker.md`).
- **Redaction:** every secret value is registered in the process's "redaction list"; output, errors and events are checked before being written (a write that contains a secret is rejected).

## 3. Sign-in and authorization
- Password (Argon2id), TOTP required, WebAuthn (passkey), OIDC optional; lockout on brute force, IP restrictions.
- Sessions: httpOnly, Secure, SameSite=strict; short lifetime, extended on activity; a new session is issued when privileges are elevated.
- **Step-up authentication** for: the terminal, secret reveal, token creation, approval of high-risk runs, dangerous panel operations (`DELETE`, bulk, `restart-all`), policy changes.
- **Roles:** `owner`, `operator` (runs without secrets and without the terminal), `observer` (read-only), `terminal` (the terminal permission), `auditor`. Permissions are fine-grained (`servers:read`, `runs:execute:deploy`, `panel:write`, `vault:reveal`, `terminal:use`); roles are sets of them.
- **Swellwright tokens** (CLI, integrations, probes): scopes `sw:<resource>:<action>`, expiry, IP restrictions; stored as hashes.
- For dangerous runs, optional "dual approval" (a second approver).

## 4. SSH access to nodes (methods are configurable)
Passwords, certificates and keys are supported in any combination; nothing is imposed. The choice is made per server, per group or as a default; the order of attempts can be set.
| Method | Description | Notes |
|---|---|---|
| Password (and sudo password) | secrets in the vault | the simplest option, matches a fresh server (root); policy warns about the risk but does not block |
| Key | a separate ed25519 key per server (or a shared one), in the vault | rotation manually or by scenario N15 |
| Certificate | Swellwright certificate authority (optional): user `swellwright`, short lifetime, `principals`, `from=` | enabled on request; requires node preparation |
General rules (independent of the method): host key pinning (confirmation on first connection, alert on change; an OS reinstall is confirmed explicitly in N04); the first login to a new server is by the root password, then Swellwright access and an administrator account are created, and root is closed only after the login and sudo are verified; a safety timer on the node; the Swellwright address in fail2ban `ignoreip`; for `sudo` the password is passed through stdin; the **break-glass key outside Swellwright** remains (offline with the instance owner, off the Swellwright server); policies P-005 and P-013 remain in force.

## 5. Web terminal (N27)
- By default the terminal is available only to users with the `terminal:use` permission and step-up authentication for every session; it works **only with real SSH data that the user enters for every session**: host (from the inventory or arbitrary), user, password or private key (paste or file upload, passphrase), and, if needed, a response to the server's second factor. Swellwright **does not inject** stored secrets into the terminal: the data lives in session memory and is erased on close; it never reaches the database, logs or recordings.
- Consequence: a hijacked Swellwright session or a lost vault does not give ready-made root access through the terminal; the terminal is also suitable for servers outside the inventory.
- Additional measures: idle timeout and maximum duration, host key pinning with confirmation, broadcast input disabled by default, confirmation for pasting multi-line text, a list of active sessions and forced close.
- **Session recording is optional** (off by default, because output can contain secrets); when enabled, the recording is encrypted and masked against the list of known secrets.
- Difference: ad-hoc commands (N25) and workflows use **stored** access and go through policy and audit; the terminal is a separate interactive client.

## 6. Web security
CSP without `unsafe-inline`, `X-Frame-Options`/`frame-ancestors`, HSTS, `Referrer-Policy`, `Permissions-Policy`; CSRF protection for cookie authentication; size limits; rate limiting per IP and per user; `Origin` check for WebSocket; file uploads with type and size validation; responses that do not disclose internal errors.

## 7. Outbound connections (SSRF)
Allowlist: inventory server hosts, the panel, DNS drivers, providers, GitHub (if enabled), Telegram. Cloud metadata addresses, loopback and internal ranges are blocked for user-supplied URLs; protection against DNS rebinding (pinning the resolved IP).

## 8. Audit
An immutable log with a hash chain (each record contains the hash of the previous one), export and integrity verification; it records sign-in, runs, approvals, secret reveal, the terminal, policy changes, tokens. Retention without deletion.

## 9. Supply chain (policy P-007)
Frozen lockfiles (`pnpm install --frozen-lockfile --ignore-scripts`), manual review of updates (no automatic PRs in production), SBOM (CycloneDX), scanning of images and dependencies (Trivy, `pnpm audit`), license checks (AGPL for code copied from the panel), base image versions pinned by digest, signed releases (optional cosign), a mandatory review checklist for third-party code before it is connected.

## 10. Privacy
No outbound telemetry; personal data of Remnawave users is masked by default (stable pseudonyms), reveal by permission; logs keep the minimum.

## 11. Swellwright backup and disaster recovery
A daily encrypted database backup (CMS: the public key on the server, the private key only with the instance owner) and a vault export; copies outside the Swellwright server (external storage); a monthly restore test. The "Swellwright lost" scenario: the fleet keeps running; access through the break-glass key and manual administration (SSH, panel API); restore from a backup. The "Swellwright compromised" scenario: revoke panel tokens, replace the SSH CA and keys, replace DNS access, audit usage, reissue secrets (wizard N28).

## 12. Permission matrix for external systems
| System | Access | Purpose | Minimal form | Rotation |
|---|---|---|---|---|
| Remnawave panel | tokens with scopes | deployment, maintenance | `core` (write on the listed resources), `readonly`, `probe`; `*` is allowed by explicit configuration | 90 days, reminder 14 days before |
| Nodes | SSH `swellwright` (certificate), sudo | installation, maintenance | certificate valid for 5-15 minutes, `from=` the Swellwright address, `principals` | automatic (short lifetime) |
| Panel server | SSH user with sudo for `docker compose` in the panel directory, read of the backup directory, write to the cert-sync directory (the path is set in settings) | cert-sync, backups, updates | no access to docker.sock, no database read | as for nodes |
| DNS RU-CENTER (plugin `dns-rucenter`) | OAuth application (ID and secret) and account login/password (the API's "password" scheme) | A records | a separate account with minimal permissions is recommended if the provider's API allows it; otherwise the permissions equal those of the account, so the plugin requests only the needed scope (`dns-master`), and the secrets are kept in the vault | per instance policy |
| Other DNS | zone token | A records | limited to specific zones and record types | 90 days |
| Server providers | API token | creation, reinstall, power | only the needed project and permissions | 90 days |
| GitHub | public read (or a read-only PAT) | releases and recommendations | no write access | as needed |
| Telegram | bot token | notifications | `sendMessage` only | on leak |
| SMTP | login | e-mail | send only | 180 days |
| Backup storage | S3/SFTP keys | shipping backups off-site | write and list under its own prefix | 180 days |
| Docker host | no access to `docker.sock` | isolation | separate network, non-root | n/a |
| Probe agents | token for writing results | availability reports | write only and read of its own configuration | 180 days |

## 13. Decisions on previously open security questions
Auto-unseal of the vault is off by default and is enabled explicitly as a less secure mode with an audit entry, not on a host shared with the panel (ADR 0006). Dual approval of dangerous operations is part of 1.0 as an optional policy. The warning about a `*` token is shown at issuance and as a persistent banner (`00-index.md`, §6).

## 14. Plugin security
A plugin is third-party code with access to secrets: trust levels, permissions in the manifest shown when a plugin is enabled, network access only by host list, secrets issued for the duration of a call and only of the declared type, `postinstall` forbidden, signature, audit of every call, immediate disable. `builtin` and `official` run in the worker process under restrictions, **`community` only as sidecar containers** (no `docker.sock`, network policy, limits) and declarative drivers that execute no code. Approvals through Telegram are allowed only for low and medium risk. Details in `13-plugins-and-opensource.md`.
