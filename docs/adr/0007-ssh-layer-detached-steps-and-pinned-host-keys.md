# ADR 0007: SSH layer with detached steps and pinned host keys

Status: accepted

## Context
Node operations (package installs, firewall and SSH changes, reboots) are long and risky, and an SSH session can drop in the middle. Nodes should not need a permanent agent.

## Decision
Swellwright is agentless over SSH, using the `ssh2` library with connection pooling. Host keys are pinned: the first login shows the fingerprint for explicit confirmation, a changed key blocks the operation and raises an alert (a reinstall is confirmed explicitly in the workflow). Steps that run on a node are started with `setsid` and write a log and an exit-code file under `/var/lib/swellwright/runlogs/<run>/`; the console follows the log by polling, so a dropped session does not kill `apt` or `docker`. `sudo` passwords go through stdin, never through command lines. Node-side artifacts are a versioned POSIX `sh` installer and a small Python engine (snapshot, undo plan, undo, safety timer for SSH and firewall changes), uploaded with hash verification. Access methods (password, key, certificate) stay configurable (ADR 0004).

## Consequences
Nothing is installed permanently on a node except what a workflow installs. Nodes need `python3` (the preflight installs `python3-minimal` when it is missing). Steps are idempotent and can be re-attached after a worker restart.

Refined by ADR 0035 (the SSH layer as built): the layout of a step on the server, the host key policy, the sudo wrapper and the limits.
