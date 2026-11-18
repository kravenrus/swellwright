# 09. Docker, hosting, operations

> English translation of the [Russian design document](../../ru/design/09-ops-docker.md).

## 1. Containers (like the panel: application, PostgreSQL, Redis-compatible store)
| Service | Image | Role | Network |
|---|---|---|---|
| `swellwright` | own image (multi-stage, non-root) | api + UI serving | internal + published on 127.0.0.1 only, behind nginx |
| `swellwright-worker` | same image, different command | workflow execution, SSH, probes | internal + outbound by allowlist |
| `postgres` | `postgres:17` (pinned by digest) | database | internal only |
| `valkey` | `valkey/valkey` (pinned) | queues, locks | internal only |
| `swellwright-probe` | own, separate image (optional) | probe agent on observer machines | outbound HTTPS to the api only |

Images are built with `docker build` using `pnpm install --frozen-lockfile --ignore-scripts`. The result is tagged with the version (`swellwright:1.0.0`), never `latest`. CI builds and publishes the release images (section 10); a local build is also possible.

## 2. `docker-compose.yml` (sketch)
```yaml
name: swellwright
services:
  swellwright:
    image: swellwright:${SW_VERSION}
    restart: unless-stopped
    user: "10001:10001"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql://sw:${POSTGRES_PASSWORD}@postgres:5432/swellwright
      REDIS_URL: redis://valkey:6379
      SW_PUBLIC_URL: https://sw.example.com
    secrets: [pg_password]
    ports: ["127.0.0.1:3100:3000"]
    depends_on: { postgres: { condition: service_healthy }, valkey: { condition: service_healthy } }
    healthcheck: { test: ["CMD", "node", "dist/healthcheck.js"], interval: 15s, timeout: 3s, retries: 5 }
    networks: [internal, egress]
  swellwright-worker:
    image: swellwright:${SW_VERSION}
    command: ["node", "dist/worker.js"]
    restart: unless-stopped
    user: "10001:10001"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    env_file: .env
    networks: [internal, egress]
  postgres:
    image: postgres:17@sha256:...
    restart: unless-stopped
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U sw -d swellwright"], interval: 10s, retries: 5 }
    networks: [internal]
  valkey:
    image: valkey/valkey:8@sha256:...
    command: ["valkey-server", "--appendonly", "yes", "--save", ""]
    volumes: [valkeydata:/data]
    healthcheck: { test: ["CMD", "valkey-cli", "ping"], interval: 10s, retries: 5 }
    networks: [internal]
networks:
  internal: { internal: true }
  egress: {}
volumes: { pgdata: {}, valkeydata: {} }
secrets: { pg_password: { file: ./secrets/pg_password } }
```
Outbound traffic is restricted by the host firewall (allowed: inventory servers, the panel, DNS APIs, GitHub, Telegram), not by Docker alone.

## 3. Environment variables (main ones)
`SW_PUBLIC_URL`, `SW_VERSION`, `DATABASE_URL`, `REDIS_URL`, `SW_AUTH_KEY` (base64 of 32 random bytes; seals the TOTP secrets, not a vault key, ADR 0014; required in production), `SW_SETUP_TOKEN` (optional fixed first-run token), `SW_COOKIE_SECURE`, `SW_ALLOWED_ORIGINS`, `SW_STEP_UP_MINUTES` (how long a session stays elevated after the second factor, 5 by default, 1 to 30; ADR 0017), `SW_LOG_LEVEL`, `SW_EGRESS_ALLOWLIST` (a hint for the policy), `SW_UNSEAL_MODE` (`manual` by default, `file`, `systemd-creds`), `SW_METRICS_BASIC_AUTH` (for Prometheus), `SW_RETENTION_*`, `SW_TRUSTED_PROXIES`. **The vault master password is never passed through the environment.**

## 4. Reverse proxy (nginx, modeled on the panel)
- Domain `sw.<base>`, certificate (for example a wildcard for the base domain), `proxy_pass http://127.0.0.1:3100`.
- Headers: `X-Forwarded-For`, `X-Forwarded-Proto: https`, no sub-path.
- WebSocket: `Upgrade`/`Connection`, `proxy_read_timeout` of at least 1 hour for the terminal.
- Access restriction: an address allowlist (trusted networks, VPN), optional mTLS; rate limiting; a separate `location` for `/ws`.
- `/metrics` and `/docs` are closed to external addresses.

## 5. Hosting (on the same host as the panel or on a separate one)
A separate server is recommended. Hosting on the panel host is acceptable with isolation measures: a dedicated system user without sudo; a separate docker network and **its own** Postgres and Valkey (not the panel's); no access to `docker.sock` or to the panel's volumes and network; limits (`cpus`, `memory`, `pids`) and `read_only`; a firewall that restricts outbound connections of the Swellwright containers; a separate vhost and separate backups; Swellwright does not read the panel database (API only); the panel host is in the Swellwright inventory as an ordinary server with a restricted user.
Resources: measure the spare CPU and RAM before launch; the baseline need of Swellwright is 2 vCPU and 2 GB RAM (it grows with probes and logs).
Residual risk on a shared host: the kernel and the host are shared, so a host compromise affects both systems.

## 6. First run
`docker compose up -d` → open the console and enter the setup token the server printed to its log → create the instance owner (password, TOTP, recovery codes) → create and **unseal** the vault (password + an optional key file) → connect the panel (P01) → import the fleet → adopt the nodes (N01) → set up notifications and schedules.

## 7. Operations
- **Swellwright updates:** new image version → `prisma migrate deploy` → `ready` check → rollback: the previous image plus a database restore from the pre-migration backup (an automatic backup is taken before each update).
- **Backups:** daily `pg_dump` (encrypted in CMS format: the public key stays on the server, the private key is kept off the server by the administrator), export of the vault metadata (ciphertext), off-server copies (external storage), a monthly restore check into a disposable Postgres.
- **Monitoring:** `/health`, `/ready`, `/metrics` (Basic Auth), alerts on lock age, queue, token and certificate expiry, database size.
- **Logs:** JSON, Docker rotation (`max-size`, `max-file`), retention by policy, no secrets.
- **Clock:** NTP is mandatory (SSH certificates and webhook signatures depend on time).

## 8. Disaster recovery (runbooks)
| Situation | Actions |
|---|---|
| Vault password lost | restore from the recovery kit (Shamir); without a kit the vault is lost: reissue all secrets and reconnect the panel and the servers (the nodes stay alive, access through the emergency key) |
| Nobody can sign in (the owner lost the password and the authenticator) | on the Swellwright host, with the environment of the server: `node dist/admin.js reset-credentials <login name>` deletes the credentials of that account, ends its sessions and prints a one-time invitation; open the console with it, choose a password, set up the authenticator again. `node dist/admin.js users` lists the accounts. Recorded in the audit chain as `user.credentials.reset` with `via: cli` (ADR 0016) |
| Swellwright server lost | bring up a new machine, restore the database from a backup, unseal the vault, recreate the agent tokens, verify access |
| Database corrupted | restore from the latest backup, resync the panel and the servers, mark the runs as "undetermined state" and reconcile them against snapshots |
| Swellwright compromised | revoke the panel tokens, rotate the SSH CA and keys, rotate the DNS secrets, audit, reissue (wizard N28) |
| Panel unavailable | runs that depend on the panel are paused; work with servers over SSH continues; "panel later" scenarios |

## 9. Host hardening checklist
OS updates, SSH by certificate, UFW (allow 22 from trusted addresses, 443 from allowed ones), fail2ban, swap disabled or encrypted, disk encryption, a dedicated user, integrity monitoring, database and queue ports closed, no `docker.sock` in containers, regular image rebuilds.

## 10. Releasing the project on GitHub
Image builds in GitHub Actions (multi-arch if needed), publishing to GHCR, version tags, digest pinning, SBOM (CycloneDX), cosign signatures, checks (linters, types, tests, gitleaks, Trivy, licenses, `oasdiff`, a check that no instance data is present), release notes from the CHANGELOG, OpenAPI published as an artifact. A local build is also acceptable for installation in your own infrastructure. Details are in `13-plugins-and-opensource.md`.

## 11. Sidecar plugins
A `community` plugin ships as an OCI image with a manifest. Swellwright generates a `compose` fragment (service `swellwright-plugin-<id>`, internal network, `read_only`, `cap_drop: [ALL]`, limits, a network policy for the allowed hosts) and **does not get `docker.sock`**: the administrator applies the fragment with `docker compose up -d`. The plugin talks to the core over authenticated HTTP/gRPC; it cannot see the database, Redis or any secrets that are not its own, and a secret is issued only for the duration of a call.
