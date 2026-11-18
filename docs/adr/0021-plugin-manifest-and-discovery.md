# ADR 0021: The plugin manifest and discovery

Status: accepted

## Context
ADR 0003 and 0008 decided that everything specific is a plugin and how plugins are isolated; `13-plugins-and-opensource.md` sketches the manifest. The runtime is a large piece (isolation, permissions, enabling, a proxy for the network, sidecars). Its first step is the part every later step stands on and that needs nothing else to exist: what a plugin declares, and how the core finds plugins and tells a usable one from one that is not.

## Decision
- **The manifest is a schema in `packages/plugin-api`** (Zod, so plugin authors and tools can use it without the core). `swellwright.plugin.json` names the plugin (`id`, `version`, `name`, `license`), the core versions it fits (`engines.swellwright`, a semver range), what it provides (`provides`: an extension kind and either a module, `entry`, or a declarative driver, `driver`), what it asks for (`permissions`: `network`, `secrets`, `panel`, `ssh`), and optionally a config schema, a settings page and a storage namespace.
- **Strict and closed.** Unknown keys are refused, so a misspelled permission is an error and not a permission that silently does nothing. Everything that is not listed is denied. `id` is lower-case words joined by dashes; `version` is semver.
- **Files stay inside the plugin.** Every path in a manifest is relative, in forward slashes, from a small set of characters, with no `..`, no empty part, no absolute form. At discovery each named file must exist, be an ordinary file and, with links resolved, be inside the plugin directory.
- **Network permissions name public hosts.** `host:port` with a DNS name of at least two labels whose last one is a word: no wildcard, no address, `localhost`, `.local`, `.internal` and similar suffixes refused. A plugin that may call "anything" or an internal address is not a request an administrator can judge, and the core's proxy would have to defend its own network against it.
- **A declarative driver only where it makes sense.** `driver` is allowed for the kinds that talk to a REST service (`DnsProvider`, `HostingProvider`, `NotificationChannel`); a `NodeFlavor` that runs commands cannot be declarative.
- **The storage namespace is the plugin id.** The manifest may state it, and then it must be equal to the id, so two plugins never share one.
- **Discovery describes, it never loads.** `discoverPlugins(roots, coreVersion)` reads the sub-directories of the configured roots and returns, for each, its trust (`official` or `local`: where the directory came from), its state and, if there is one, its manifest. States: `available`; `incompatible` (sound, but for other versions of the core, with the reason); `invalid` (with every problem found, not only the first). Nothing is imported or executed. A root that does not exist is skipped.
- **What makes a plugin invalid:** no manifest, a manifest that is a link, too large (64 KiB) or not JSON; any schema problem; a directory name that differs from the id (a plugin is found by id and by directory, and they must agree); a named file that is missing, not a file, or leads outside the directory; an unusable `engines` range; a `package.json` with `preinstall`, `install`, `postinstall` or `prepare` (plugins may not run code by being placed on a disk, ADR 0008); a plugin directory that is itself a link; a second plugin with an id already taken (the earlier root wins, so an `official` plugin cannot be shadowed by a `local` one).
- **A pre-release core counts as the version it is heading for** (`1.3.0-rc.1` fits `>=1.0 <2`), so release candidates can be tested with the plugins of the release.
- **Permission diff is a library function** (`permissionDiff`, `widensPermissions`): an update that asks for more (a host, a secret kind, a panel scope, SSH) needs the administrator's approval again; asking for less does not. The approval itself is a later step.

## Consequences
- Plugin authors get a schema to check against today, and a plugin that violates the rules is reported with the reasons instead of failing somewhere later.
- Nothing in the running application uses discovery yet: no route, no page, no permission, no persistence of "enabled". Those come next, and they need a permission in the catalogue (`plugins:*`) and an OpenAPI change, so they follow the pull requests that touch the same files.
- `trust` records only where a directory came from. The `signature` field is carried but **not verified**, so no plugin is shown as verified; signature and hash checks (ADR 0008) come with enabling.
- Not part of this slice: enabling and its approval and audit, isolation (worker process, permission model, the network proxy), container sidecars and the compose fragment, the registry, the declarative driver interpreter, the interfaces of the individual extension points (only their names exist).
- The only new package is `@types/semver` (types, no code); `semver` itself was already in the lockfile.
