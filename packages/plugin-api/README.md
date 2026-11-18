# packages/plugin-api

The plugin manifest schema and, later, the contracts of the extension points (`DnsProvider`, `NodeFlavor`, `CertDistributor`, ...). Decisions: [ADR 0021](../../docs/adr/0021-plugin-manifest-and-discovery.md); design: `docs/en/design/13-plugins-and-opensource.md`.

Status: the manifest schema and the permission diff exist. The extension-point interfaces come with the first plugin that provides each kind (the kind names are already fixed in `EXTENSION_KINDS`).

## The manifest

`swellwright.plugin.json` in the root of the plugin directory (which is named after the plugin id):

```json
{
  "id": "dns-rucenter",
  "version": "1.0.0",
  "name": "RU-CENTER (NIC.RU) DNS",
  "engines": { "swellwright": ">=1.0 <2" },
  "provides": [{ "kind": "DnsProvider", "entry": "./dist/provider.js" }],
  "permissions": { "network": ["api.nic.ru:443"], "secrets": ["dns-oauth"], "panel": [], "ssh": false },
  "config": { "schema": "./config.schema.json" },
  "ui": { "settings": "./ui/settings.json" },
  "storage": { "namespace": "dns-rucenter" },
  "license": "AGPL-3.0-only"
}
```

Check a manifest with `PluginManifestSchema.safeParse(json)`. The rules, in short: unknown keys are refused; every path is relative and inside the plugin; `network` entries are public `host:port` names; a `driver` (YAML, no code) only for `DnsProvider`, `HostingProvider` and `NotificationChannel`; `storage.namespace`, if given, equals the id; no install scripts in a `package.json`.

`permissionDiff(before, after)` and `widensPermissions(diff)` say what an update changes in what a plugin may do.
