# Contributing

Thank you for your interest. Swellwright is in the design phase, so the most useful contributions right now are design feedback, plugin ideas, documentation and translations.

## Developer Certificate of Origin

All contributions are accepted under the [Developer Certificate of Origin](DCO). Sign off every commit:

```bash
git commit -s -m "docs: clarify plugin permissions"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line. Use an address you are comfortable publishing (GitHub offers a `users.noreply.github.com` address).

## Workflow

1. Open an issue first for anything larger than a typo or small fix.
2. Fork, create a branch, make focused commits ([Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. Run `pnpm run check`, `python scripts/check-hygiene.py` and `bash scripts/check-dco.sh` locally.
4. Open a pull request using the template.

## Development setup

You need Node.js 26 (see `.nvmrc`) and pnpm 10 (the exact version is in the `packageManager` field of `package.json`). Corepack is not bundled with Node.js 25 and later, so install pnpm explicitly (for example with `npm install --global pnpm@10.34.9`).

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check      # format, lint, typecheck and build every package
python scripts/check-hygiene.py
```

The workspace is `apps/*` and `packages/*` (pnpm workspaces plus Turborepo); the layout and the reasons are in [ADR 0009](docs/adr/0009-monorepo-and-tooling.md).

## Never commit real deployment data

No real domains, IP addresses, node names, tokens, passwords, SSH keys, `.env` files, backups or user data, not even in tests or screenshots. Use `example.com` and the documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`. CI rejects secrets and personal e-mail addresses.

## Code and docs

- TypeScript (strict), ESLint, Prettier; Zod schemas are the single source for types and OpenAPI.
- Every public API change updates the OpenAPI document and keeps `oasdiff` green.
- Documentation is English first (`docs/en/`); Russian translations are welcome in `docs/ru/`.
- Tests are required, including failure and rollback cases for anything that changes a server or the panel.

## Plugins

Plugins declare every permission they need in the manifest, never execute install scripts, and must not read anything beyond the secret kinds they declare. See [docs/en/plugins.md](docs/en/plugins.md). Community plugins are listed in `registry/index.json` through pull requests.

## Security

Do not open public issues for vulnerabilities; follow [SECURITY.md](SECURITY.md).

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
