# 12. Risks, assumptions and open questions

> English translation of the [Russian design document](../../ru/design/12-risks-open.md).

## 1. Risks
| # | Risk | Likelihood | Impact | Mitigations |
|---|---|---|---|---|
| R1 | Access concentration: Swellwright holds the keys to everything | medium | critical | a dedicated VM or strict isolation on a shared host, a vault with sealing, SSH certificates, scopes, step-up, audit, network isolation, an emergency key kept outside the system |
| R2 | Remnawave API drift (new versions break the client) | high | medium | pinned contract, adapters, spec comparison in CI, a window of two minor versions |
| R3 | Project size (scope creep), delays | high | high | phases with acceptance criteria, the M4 slice comes first, optional modules marked, regular review |
| R4 | Errors in rollback and deployment on a live fleet | medium | high | lab, fault injection, rollback equivalence, canary first runs, policies |
| R5 | AGPL license of the panel when copying code or styles | medium | medium | the project is AGPL-3.0-only; the panel's code, components and theme are used as a base with copyright notices kept and changes marked (ADR 0011); the Remnawave name and mark are not copied; dependency license checks in CI |
| R6 | Web terminal as an attack vector | medium | critical | available only to users with the `terminal:use` permission and elevated authentication (step-up), recording, timeouts; implemented in a late phase |
| R7 | Loss of the vault password or recovery kit | low | critical | Shamir kit, printout, recovery drills; the fleet runs on its own, emergency access exists outside Swellwright |
| R8 | RU-CENTER: replacing and deleting a record, and the ability to create a DNS-only user, need verification in the lab | medium | medium | first run on a test name; check whether a separate user is possible; the "manual" plan is always available |
| R9 | Inaccurate assumptions about token scopes (string names, granularity) | medium | medium | the wizard reads the scope catalog on connect; fallback: a `*` token |
| R10 | The assumption "any SECRET_KEY from keygen works for any node" needs verification in the lab | low | medium | verify with the first redeploy in the lab; if it fails, take the key from the node card (panel API) |
| R11 | The "direct with hop fallback" mode depends on client support (Xray balancer and observatory) | high | low | marked experimental, fallback: "two hosts" |
| R12 | Operator blocking and TSPU behavior change; probes produce noise | high | medium | "measured / community" labels, trends instead of single measurements, agents in several networks |
| R13 | Load on the database and on the storage of probes and logs | medium | low | partitions, retention periods, aggregates |
| R14 | Dependency growth and supply-chain vulnerabilities | medium | high | frozen lockfile, `--ignore-scripts`, SBOM, scanning, manual review |
| R15 | Few maintainers: "bus factor" | high | medium | documentation in the repository, tests as a specification, simple technologies aligned with the panel's stack |
| R16 | Nonstandard OSes and hoster images (no python3, different sudo) | medium | medium | preconditions in `preflight`, installing `python3-minimal`, clear errors, a list of supported OSes |
| R17 | Simultaneous changes made manually in the panel and from Swellwright | medium | medium | optimistic locking by hash, diff before write, snapshots |
| R18 | Leak of Remnawave user data through Swellwright | low | high | masking by default, a separate reveal permission, minimal data selection |
| R19 | SSH time and certificates depend on clock synchronization | low | medium | NTP check, time tolerance, check at startup |
| R20 | Misuse of automation (approved without looking) | medium | high | plan panel with impact, confirmation phrase for high risk, dual approval (optional) |
| R21 | Plugins as an attack vector | medium | high | trust levels, isolation, permissions in the manifest, signing, `community` in a container or declarative drivers only, audit (`13`) |
| R22 | Leak of instance data into the public repository | medium | high | clean history, gitleaks, forbidden-string check, instance data kept outside the repository, check that the documentation and examples contain no instance data |
| R23 | Support load of an open project | high | medium | support boundaries, issue templates, version policy, automation |
| R24 | Core universality breaks provider- and scheme-specific behavior | medium | medium | provider- and scheme-specific behavior is attached through plugins (including the official `node-selfsteal`, `certs-cron-script`, `dns-rucenter`), examples of conventions and policies, end-to-end scenario (golden) tests of behavior |
| R25 | Shared host with the panel: compromise of one system affects the other | medium | high | isolation measures (`09` section 5), separate databases and network, no `docker.sock`, a separate server as the recommended option |
| R26 | Container plugins without `docker.sock` complicate operations | medium | medium | sidecars as compose services, fragment generation, documentation, plugin template |

## 2. Assumptions
1. The project is open (GitHub, AGPL-3.0-only) for Remnawave administrators; there is no public SaaS; all code is public, instance data is not.
2. Nodes remain Ubuntu 22.04/24.04 with the installer in POSIX sh; Remnawave 3.4.x and later.
3. SSH access to nodes is possible from where Swellwright is hosted; access to the panel is over HTTPS.
4. Swellwright can store secrets encrypted and be unsealed manually on restart.
5. Possible future modules (unique decoy sites, neutral SNI, XHTTP and Hysteria2, monitoring from different networks) are part of the plan as modules and are not required immediately.

## 3. What to verify before or at the start of development (hypotheses)
- The panel token scope catalog, the granularity of `write` per endpoint (the wizard reads `GET /api/tokens/scopes` with an admin JWT).
- Whether a separate RU-CENTER user with access to DNS hosting only is possible; replacing and deleting a record (verify in the lab); limits on the number of records.
- Happ client support for the balancer and the Xray observatory (for the "direct with fallback" mode).
- Confirmation of "any SECRET_KEY from keygen works for any node".
- Compatibility of `@remnawave/backend-contract` with 3.5.x when it is released.
- Behavior of `ssh2` with certificates and the `principals` restriction in the required combinations.
- License obligations when reusing panel code: decided (allowed under AGPL-3.0-only, with notices kept and changes marked, ADR 0011); the dependency check in CI remains.
- Performance of terminal recording and storage during long sessions.

## 4. Design decisions and remaining questions
### Design decisions
- See `00-index.md`, §6 ("Design decisions").

### Closed questions
Questions 1-10 (support policy, users module, certificate distribution, Telegram, ACME, dual approval and multiple panels, Node.js and package manager, UI base, warning for the `*` token, automatic vault unsealing) are closed and recorded in `00-index.md`, §6, with the architectural parts in ADR 0005-0011. There are no new open questions; only the hypothesis checks from section 3 remain.

## 5. Legal and ethical
The project is unofficial and does not use Remnawave marks as its own name; the interface states compatibility ("for Remnawave"). It does not store or publish client data; secrets never leave the instance's perimeter. Use: administration of one's own infrastructure.

## 6. Project success criteria
1. Any catalog scenario runs from Swellwright with a plan, approval, verification and rollback.
2. A new node is deployed, renamed, replaced and decommissioned with no manual steps other than actions at the hoster.
3. Secrets are stored only encrypted, logs are clean (automatic check).
4. Losing Swellwright does not disrupt the fleet; recovery by the instructions succeeds.
5. The interface is familiar and convenient: an administrator performs typical tasks without consulting the documentation.
