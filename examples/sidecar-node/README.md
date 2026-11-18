# examples/sidecar-node

A reference **sidecar**: the code of a plugin that runs in a container of its own (ADR 0031). It is for plugins by others (trust `community`), or for any code you do not want inside the Swellwright process; the container has no network of its own and reaches the world only through Swellwright.

## The protocol

Swellwright talks to the container over HTTP on an internal network. Every request carries `Authorization: Bearer <SW_PLUGIN_TOKEN>` and the container answers 401 to anything else.

| Request | Answer |
|---|---|
| `GET /describe` | `{ "modules": [{ "kind": "DnsProvider", "methods": ["echo"] }] }` |
| `POST /call` with `{ kind, method, params, config }` | `{ "ok": true, "value": ... }` or `{ "ok": false, "message": "..." }` |

`config` holds the settings the administrator entered (secret fields left out). Answers are JSON of at most 4 MiB.

To reach the world the container asks the core, with the same token, at `POST {SW_CORE_URL}/api/v1/plugins/{SW_PLUGIN_ID}/gateway`:

| Request | What the core does |
|---|---|
| `{ "op": "fetch", "url": "https://...", "init": { "method", "headers", "body" } }` | Makes the request itself, only to a `host:port` the administrator approved, over https, to public addresses |
| `{ "op": "secret", "field": "name" }` | Returns the vault secret bound to that settings field, if its kind was approved and the vault is unsealed |
| `{ "op": "storage", "action": "get" \| "set" \| "delete" \| "keys", "key", "value" }` | The plugin's own key-value storage |

## Use

1. Copy `server.mjs`, change `METHODS`, build an image and push it; note its **digest**.
2. Put a `swellwright.plugin.json` like the one here in a directory under `SW_PLUGINS_COMMUNITY_DIR` (or `SW_PLUGINS_LOCAL_DIR`), with the image pinned as `name:tag@sha256:<digest>`.
3. In Swellwright open Settings → Plugins, review and enable the plugin, then press **Compose fragment** and save the file next to your compose file.
4. `docker compose -f docker-compose.yml -f plugin-example-sidecar.yml up -d`, then press **Check**: the container is asked what it offers.

The fragment puts the container on an internal network, read-only, without capabilities or privileges, with the memory, cpu and process limits of the manifest. It holds the token the container proves itself with: keep it like a secret. The token belongs to the plugin as it was approved; when the files change, enable the plugin again and apply the new fragment.
