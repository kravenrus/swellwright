# ADR 0006: Secrets vault with envelope encryption, sealed on start

Status: accepted

## Context
Swellwright holds the keys to a whole fleet: panel tokens, SSH credentials, DNS and provider credentials. A stolen database, dump or backup must not reveal them.

## Decision
The operator passphrase goes through Argon2id to a key-encryption key (KEK). The KEK wraps data keys; every secret has its own data key (AES-256-GCM, AAD = secret id + version + context). The vault is **sealed on start**: no run and no secret access until it is unsealed with the passphrase, optionally plus a key file from another machine. Decrypted values live only in worker memory for the duration of a step and are never written to Redis, logs, events or core dumps. Reveal needs a permission and step-up authentication and is audited; every secret value is registered in a redaction set. A recovery kit (Shamir shares or a printed key) is created at setup.

Auto-unseal (systemd-creds or TPM) is an explicit, documented, less secure option. It is off by default, is recorded in the audit log and is not offered when Swellwright shares a host with the panel.

## Consequences
After a restart someone has to unseal the vault, so scheduled runs wait until then. In exchange a copy of the database alone is useless. Rotation of the KEK, data keys and secrets is part of the design.
