# apps/web

React web UI built on Mantine, styled after the Remnawave panel (phase 1).

Status: the application shell in the panel's visual language, an overview page that reads the API status, and the screens before it: first-run setup, sign-in, the authenticator (QR code and recovery codes) and sign-out ([ADR 0014](../../docs/adr/0014-sign-in-with-password-and-authenticator.md)), navigation that shows only what the role may open, the Roles page and the Audit page with the chain check ([ADR 0015](../../docs/adr/0015-permissions-and-the-audit-chain.md)). Run it with `pnpm --filter @swellwright/web dev`; design in `docs/en/design/wireframes/`.
