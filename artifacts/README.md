# Artifacts

An artifact is a file that Swellwright ships to a server and runs there: immutable once released, versioned, and verified by its SHA-256. Everything Swellwright changes on a node goes through an artifact (design principle 10 and policy P-009 in [`docs/en/design`](../docs/en/design/00-index.md)), so what runs on your servers is a file you can read, run by hand and compare with its hash, not a command assembled at run time.

| Artifact | What it is |
| --- | --- |
| [`node-installer`](node-installer/README.md) | Installs and hardens a Remnawave node: preflight and verify (read-only), firewall, fail2ban, Docker, the node API port open to the panel only, nginx default site, HAProxy SNI routing, the node container, SSH, rename. |

The second planned artifact is the `node-engine` (snapshot, undo plan and a safety timer for SSH and firewall changes). Decision record: [ADR 0036](../docs/adr/0036-node-installer-artifact.md).

## What is in an artifact directory

```
artifacts/<name>/
  install.sh        the file that runs on the server (POSIX sh)
  manifest.json     what it is: name, version, SHA-256, size, steps, parameters (generated, never edited by hand)
  README.md         for people; its step and parameter tables are generated from the manifest
  test/             the test suite (runs with stubbed commands in a temporary root, never on a real system)
```

## The manifest

`manifest.json` is built by `scripts/artifact-manifest.mjs` from the script itself. The script carries `#@meta`, `#@step` and `#@param` lines, one JSON object each, and the tool turns them into the manifest. Nothing in the manifest is typed by a person, so it cannot disagree with the script.

| Field | Meaning |
| --- | --- |
| `name`, `version`, `description` | The artifact and its semantic version (`INSTALLER_VERSION` in the script). |
| `file`, `interpreter` | The file to run and the interpreter (`sh`). |
| `sha256`, `size` | The digest and the byte size of the file. |
| `minOs` | The systems it is written for. |
| `steps[]` | `id`, `title`, `readOnly` (it changes nothing), `needsRoot`, `inFull` (run by the `full` action), `params` (read by the step), `requires` (the step stops without them when it cannot ask). |
| `params{}` | Per parameter: `group` (`node` or `installer`), `description`, `required` (some step requires it), `secret`, `pattern` or `enum`, `default`, `example`. A secret is never printed or logged. |

A pattern or a default written as `@NAME` in a `#@param` line is the text of the assignment `NAME=...` in the script, so the regular expression that validates an input and the pattern in the manifest are one text.

## How an artifact is verified

The hash is the integrity check. Swellwright checks it before it uploads the file (the bytes it holds against `sha256` of the manifest) and again after the upload (`sha256sum` on the server against the same value) and refuses to run anything on a mismatch. The script does not check itself; a changed script would check whatever it liked. (The mechanism in the server, with SFTP upload and the `Artifact` record, is a later slice. Until then do it by hand, see the README of the artifact.)

Line endings matter: the hash covers the bytes, and a carriage return breaks `sh`. A `.gitattributes` rule keeps the file `LF`, and `--check` refuses a file that has a `CR`.

## Working on an artifact

```
pnpm run artifacts:build     # rewrite manifest.json and the generated tables of the README
pnpm run artifacts:check     # fail when they are out of date (CI runs this)
sh artifacts/node-installer/test/run-tests.sh [filter]
```

Rules:
- A released version is never edited. A change to `install.sh` is a new version: raise `INSTALLER_VERSION`, run `artifacts:build`, commit the script, the manifest and the README together.
- No instance data: no real domains, addresses, keys, names or tokens; documentation ranges (`192.0.2.0/24`, `example.com`) in examples. The repository hygiene check (`scripts/check-hygiene.py`) covers these files too.
- Every change to the system goes through one of a few helpers (`run_cmd`, `q`, `write_file`, `make_dir`, `apt_install`) and every path is written under `$R`, so the tests can run a step in a temporary root with stubbed commands.
