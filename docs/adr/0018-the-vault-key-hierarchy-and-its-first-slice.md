# ADR 0018: The vault: key hierarchy and its first slice

Status: accepted

## Context
ADR 0006 decided that Swellwright keeps its secrets in a vault with envelope encryption that is sealed on start. This ADR fixes how the keys fit together, what the first working slice contains and what it leaves out, now that sign-in, roles, audit and step-up exist (ADR 0014 to 0017).

## Decision

### Keys
- **One random KEK, two ways to open it.** At setup the server makes a random 256-bit key-encryption key (KEK) and stores it wrapped twice: under a key derived from the owner's passphrase with Argon2id (the parameters and the salt are stored with it, 256 MiB and 3 passes by default, so they can be raised later), and under a random 256-bit **recovery key** that is shown once and never stored. This refines ADR 0006, where the passphrase produced the KEK directly: with a random KEK the passphrase can change, and the recovery key can exist, without re-encrypting a single secret.
- **A data key per secret version.** A secret's value is encrypted with AES-256-GCM under its own random data key (DEK); the DEK is wrapped under the KEK with AES-256-GCM. The authenticated context binds both blobs to the secret id, the version and, for the value, the type (`swellwright:secret:v1:<id>:<version>:<type>`, `swellwright:dek:v1:<id>:<version>`), so a blob copied to another secret, version or type fails to open. Blobs carry a format version byte, like the authenticator secrets of ADR 0014.
- **A wrong passphrase is found by the wrap itself.** AES-GCM authentication fails when the key is wrong, so no separate verification block is stored.

### Sealed and unsealed
- The process **starts sealed**: the KEK is not in memory. `POST /vault/unseal` takes the passphrase or the recovery key, opens the KEK and keeps it in memory only; `POST /vault/seal` wipes it. Nothing writes the KEK, a DEK or a plaintext value to the database, a log, an event or a response other than the one reveal.
- **What works while sealed:** the status, the list of secrets (name, type, version, dates: metadata is not encrypted) and deleting a secret. **What needs it open:** creating a secret, replacing a value, revealing. A sealed vault answers 423 with the error code `vault_sealed`.
- **Failed unsealing** is audited and limited to ten attempts in fifteen minutes for the whole vault (the callers are few: they need `vault:manage` and a step-up), answering 429. A single Argon2id run at a time, because each takes a quarter of a gibibyte.
- **Auto-unseal does not exist.** ADR 0006 allows it as a documented, less secure option; it is not built and not offered.
- The unsealed state lives in the API process. Several API processes would each need unsealing; the design runs one.

### Who may do what
- `vault:read`: status and list. `vault:manage`: set up, unseal, seal, create, replace, delete. `vault:reveal`: show a value. The last two are in `STEP_UP_PERMISSIONS` (ADR 0017), so every route behind them needs a fresh second factor; the test that guards the list already covers these routes.
- **Reveal** records `secret.revealed` strictly (no record, no value) and answers with the value and nothing else. Values are otherwise write-only: no route returns one, a replaced value is not kept.
- Secret types are a closed list: `panel_token`, `ssh_key`, `ssh_password`, `ssh_ca`, `dns_oauth`, `provider_token`, `telegram`, `generic`. Names are unique and are not secret.
- Audit actions: `vault.initialized`, `vault.unsealed`, `vault.unseal.failed`, `vault.sealed`, `secret.created`, `secret.updated`, `secret.deleted`, `secret.revealed`. Details carry the type, the version and the unsealing method, never a value.

### Left for later slices
The recovery key as Shamir shares, a key file as a second factor, rotating the KEK and the data keys, `SecretUse` and `SecretRotation` records, the redaction set (it belongs with the engine that handles values), export, expiry reminders, and the vault in the first-run wizard.

## Consequences
- A copy of the database is useless without the passphrase or the recovery key. Losing both, with no unsealed process left, loses every secret: the owner must save the recovery key somewhere that is not the server.
- After a restart someone has to unseal the vault before anything that uses a secret can run. That is the price of ADR 0006 and the reason the status is on the overview.
- Node cannot promise that every copy of a key is erased from memory (the garbage collector moves buffers). The buffers Swellwright controls are overwritten on sealing; the ops guide asks for no core dumps and no swap on the host. This is stated rather than hidden.
- The random KEK means passphrase change and a second recovery slot are cheap later; changing the KEK itself (rotation) re-wraps every DEK and is its own slice.
