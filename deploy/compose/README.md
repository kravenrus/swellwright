# deploy/compose

Docker Compose files. The decisions are in [ADR 0019](../../docs/adr/0019-container-image-and-deployment.md); the design is `docs/en/design/09-ops-docker.md`.

| File | What it is |
| --- | --- |
| `docker-compose.yml` | Swellwright with PostgreSQL and Valkey, built from this checkout. For running it. |
| `.env.example` | The settings of that stack. Copy it to `.env` and fill in three secrets. |
| `docker-compose.dev.yml` | Only PostgreSQL and Valkey on `127.0.0.1`, for developing on the host. Not a deployment. |

## Run it

You need Docker with Compose v2 and a reverse proxy with TLS in front (see `deploy/nginx`).

```sh
cd deploy/compose
cp .env.example .env
# fill in POSTGRES_PASSWORD, SW_AUTH_KEY and SW_SETUP_TOKEN (the commands are in the file)
docker compose up -d --build
```

The first build downloads and compiles everything and takes a few minutes. When it is up, the console is on `http://127.0.0.1:3100`; put the proxy in front of it and open it under your own name. The first visitor enters `SW_SETUP_TOKEN` and creates the owner; **remove the token from `.env` afterwards** (`docker compose up -d` applies it).

What starts: `postgres`, `valkey`, then `migrate` (applies the database migrations and exits), then the server. The server container has a read-only file system, no capabilities and runs as a normal user; the database and the cache sit on a network nothing outside can reach; the only published port is the server's, on the loopback address.

The image can carry facts about its build for the console's "Build info" (`GET /api/v1/version`): the build arguments `SW_BUILD_TIME`, `SW_BUILD_NUMBER`, `SW_GIT_BRANCH` and `SW_GIT_COMMIT`, all optional (`docker build --build-arg SW_GIT_COMMIT="$(git rev-parse HEAD)" .`; with Compose, under `build.args`). Whatever is not given is shown as unknown. The server also asks `api.github.com` once a day for the newest release and the star count; `SW_UPDATE_CHECK=off` in `.env` stops that.

## Keep these

- **`SW_AUTH_KEY`** seals the authenticator secrets in the database. Without it nobody can sign in with an authenticator and every user sets it up again. Keep a copy outside the server.
- **The `pgdata` volume** is the database. Back it up (`docker compose exec postgres pg_dump -U sw swellwright`), and test the restore.

## Everyday commands

```sh
docker compose ps                      # state and health of the services
docker compose logs -f swellwright     # the server log
docker compose up -d --build           # after pulling a new version: rebuilds, migrates, restarts
docker compose exec swellwright node apps/api/dist/admin.js users
docker compose exec swellwright node apps/api/dist/admin.js reset-credentials <login name>
```

The last two are the way back in when nobody can sign in (ADR 0016).

## Checking a deployment

`scripts/smoke-test.sh <url> <setup token>` runs the checks CI runs against a stack that is up. **It creates the owner**, so use it on a stack you are about to throw away.
