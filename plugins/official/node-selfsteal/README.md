# plugins/official/node-selfsteal

Node flavor: HAProxy SNI routing, nginx SelfSNI, decoy site, certificate receiver, verification checks.

Status: planned, no plugin code yet. The steps themselves exist: the self-steal scheme is installed by `artifacts/node-installer` (steps `certsync`, `nginx`, `haproxy`, `node`, `verify`, with the parameters of its manifest; ADR 0036). This plugin will select and parametrise those steps for a workflow and register the flavor next to a plain node. See `docs/en/` for the design.
