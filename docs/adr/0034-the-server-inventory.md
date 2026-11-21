# ADR 0034: The server inventory

Status: accepted

## Context
Phase 2 starts with the list of servers the fleet runs on: what a server is, how to reach it, which SSH host key it must show and which vault secrets log in to it. The SSH layer is built in parallel and a later slice joins them (scan the host key, verify the access, collect facts), so this slice has to be useful with no SSH at all: a person types in a fingerprint they checked, and an access entry only names secrets of the vault. The design is `docs/en/design/02-data-model.md` (section 3), `05-security.md` (section 4) and `07-ui-ux.md` (Servers).

## Decision
**Data (migration `20261121000000_create_servers`).**
- `Server`: a unique `name` (letters, digits, space, dot, dash, underscore, 1 to 64), an `address` (host name, IPv4 or IPv6, 255 at most), `sshPort`, an ISO country code, a provider as text, a `state` (`draft`, `provisioning`, `active`, `draining`, `retired`), tags (a list, GIN-indexed), notes, who created it and when. The creator is a plain id without a foreign key, as in the audit chain.
- `ServerHostKey`: the algorithm and the OpenSSH SHA-256 fingerprint of a pinned key, where it came from (`manual` now, `scan` with the SSH layer) and who accepted it. One row per server and fingerprint.
- `ServerAccess`: a method (`password` or `key`; certificates come with their own migration), a login, a reference to a vault `Secret`, an optional reference to a second secret used for `sudo`, and a priority. **Both references restrict on delete**: a secret in use cannot be removed.
- `ServerFact`: the facts of a server as JSON with the time and the source. Nothing writes it yet; `GET` returns it, or null.
- The database holds the rules the schema language cannot say as checks (port range, upper-case country code, fingerprint shape, login shape). The application validates first; the database is the second wall.

**Rules.**
- A password entry needs a secret of kind `ssh_password`, a key entry one of kind `ssh_key`, the sudo secret one of kind `ssh_password`. The type of a secret never changes, so an entry cannot become inconsistent later. A missing secret or a wrong kind answers 400 (`bad_request`, with a message that names the secret and the kinds); the API has no 422, and the other modules use 400 for a request that is well formed but refused.
- At most five access entries and sixteen pinned host keys per server (409). The first is the brief's rule; the second only keeps a table bounded, since a server has a handful of key types. Both are checked under one advisory lock, so two requests cannot beat them.
- The state may move between any two of the five states. The audit record keeps the old and the new one. A server can be deleted only while it is a draft or retired (409 otherwise); its keys, entries and facts go with it and the secrets stay.
- Pinning a fingerprint that is already pinned answers 200 with the key that is there and writes no record; a new one answers 201. A fingerprint must end in one of the sixteen characters that fit 256 bits (`AEIMQUYcgkosw048`); anything that cannot be a SHA-256 digest is refused.
- Deleting a secret that an entry uses answers 409 and names the servers (up to five). The foreign key is the last word for the race between the check and the delete.
- The list is sorted by name in the application (case-insensitively), not by the database: its collation changes how upper and lower case compare, and the order of a list must not depend on how PostgreSQL was initialised.
- Names are ASCII (`[A-Za-z0-9 _.-]`): the pattern has to mean the same in the OpenAPI document and in every client, and Unicode property classes do not.
- The address is stored as typed after validation. The inventory does not decide where Swellwright may connect: the SSRF allowlist of `05-security.md` section 7 belongs to the SSH layer, which must apply it to this field.

**API.** Ten routes under `/servers` (list with `state`, `tag` and `q` filters, create, read, change, delete, pin and revoke a host key, add, change and remove an access entry), all with the authentication level `any`: `servers:read` for the two reads and `servers:write` for the rest. No step-up: none of these permissions is in `STEP_UP_PERMISSIONS`, and nothing here reveals a secret. An entry shows the names of its secrets, never a value, and the audit records never hold one. Eight actions are new in the audit log: `server.created`, `server.updated`, `server.deleted`, `server.host_key.pinned`, `server.host_key.revoked`, `server.access.added`, `server.access.updated`, `server.access.removed`; each is written in the same transaction as the change. A change that changes nothing writes nothing. OpenAPI 0.19.0.

**Console.** `/dashboard/fleet/servers` is the first page-level list, so it is built as the panel builds Hosts and Nodes: `@kastov/mantine-datatable` 9.3.4 (ADR 0033) with the panel's cells, filters in the column heads, the "Reset" menu and the columns popover under the table, columns that can be moved, resized and hidden and that are remembered in this browser. The panel's helpers live in `packages/ui` (`datatable.tsx`) with their texts as props. The flag of a country is `react-country-flag` 3.1.0 in its emoji mode, as in the panel's Nodes table. The row opens the panel's drawer for a host: a 700 px `Drawer` with cards, a sticky footer, Save on the left and delete on the right. Its overview, host keys, access entries and facts are separate cards; a server that was just created stays open so that its key and access can be added at once.

## Consequences
- The inventory works without SSH. When the SSH layer arrives it adds `scan` keys and facts through the same tables and the same audit actions.
- A secret that a server uses is protected from deletion in the vault, and the vault tells the person which servers use it.
- Two more dependencies, both read before use and listed in `THIRD_PARTY_NOTICES.md`: `@kastov/mantine-datatable` (it imports only `@mantine/core`, `@mantine/hooks`, `clsx` and React; no network access, no dynamic code, no install scripts, no URLs) and `react-country-flag` (a component of about one kilobyte; in its emoji mode it draws a character; its picture mode, which would load flags from a CDN, is not used and `CountryFlag` does not expose it).
- Tags in the table are text joined by commas, as the panel's Nodes table shows them; chips like the panel's card view show only in the drawer's tag input.

## Not built here
SSH of any kind, host key scanning, access verification, facts collection, commands, snapshots, events, linking a server to a panel node, providers as objects, maintenance windows, certificates as an access method, row selection and bulk actions.
