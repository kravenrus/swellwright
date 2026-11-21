# ADR 0032: The console shell is ported from the panel, not imitated

Status: accepted

## Context
ADR 0011 says the UI is built on the panel's code, components and theme. The first console slices copied the panel's tokens and then built their own header, their own navigation (state in a variable, no URLs), their own page cards and their own dialogs. People who use the panel noticed at once: the header controls were small icon buttons, there was no version button and no GitHub link with the star count, the tabs sat in a separate bar instead of in the header, the language and sign-out controls hid in a menu, and many smaller things differed. The goal is the opposite: someone who works in the Remnawave panel should have the impression of switching to another tab of it, not of opening another tool.

## Decision
- **The shell is the panel's shell.** A fixed header (Mantine `AppShell`, 116 px: a 64 px brand row and a 52 px navigation row, or 64 px with the tabs in the brand row from 2048 px, where the page also gets 10vw side padding), the tabs as a `Menubar` that opens on hover, the 44 px header controls with their gradient and sheen, a floating drawer with the grouped navigation below 64em. The code is ported from `src/app/layouts/dashboard/main-layout` and `src/shared/ui/header-buttons` of the panel (frontend 3.4.11, AGPL-3.0-only like this project); every ported file names its origin and what changed, and `THIRD_PARTY_NOTICES.md` lists it.
- **The theme is completed**, not only the tokens: the panel's breakpoints (`lg` is 64em), `v8CssVariablesResolver` (translucent tints for every light surface), the Menu, Tooltip, Modal, Drawer, SegmentedControl, Fieldset overrides, the scrollbars, notifications, the top progress bar and the modals provider.
- **Pages have URLs**, grouped like the panel's (`/dashboard/<area>/<page>`), in one table (`apps/web/src/routes.ts`) that feeds the router and the navigation. The API serves `index.html` for deep links (ADR 0019).
- **The header carries the panel's Version and GitHub controls.** The version opens a build information dialog and glows when a newer release exists; the GitHub control shows the stars. The browser does not call GitHub (the CSP is `connect-src 'self'`, and the project does not send people's addresses to third parties); the server reads the release and the stars at most once a day, with nothing identifying in the request, and `SW_UPDATE_CHECK=off` turns it off. Unknown values stay unknown: the panel's invented starting numbers are not copied.
- **Page-level patterns come from the panel's components** (page header with icon-only actions, section and settings cards, metric cards, entity cards, tables in a titled card, dialogs with a header and a sticky footer, confirmation dialogs, toasts); they live in `packages/ui` as ports. The project skill `swellwright-ui` and the pinned analysis of the panel in it describe the workflow.

What deliberately differs from the panel:
- **The brand** is ours (mark and name); the panel's logo, name and links are never copied. The Telegram, Prime and Recap controls have no counterpart; the Support control (a red heart to the panel's donation page) is replaced by a Documentation control with the same recipe, which leads to the docs of the repository.
- **An account control** sits before Sign out: here people have accounts (change password, role), the panel has one administrator.
- **Planned pages are shown in the menu, disabled**; the panel has only built pages.
- **Accessibility**: our header controls have labels, the custom controls show a keyboard focus ring (the panel theme sets `focusRing: 'never'`), `user-scalable=no` is not copied, and `prefers-reduced-motion` switches the entrance animations off.
- **Plumbing libraries** (`zustand`, nice-modal) are not used. The panel's display libraries were first imitated (CSS keyframes, a styled Mantine table); ADR 0033 reverses that: they are used as the panel uses them.

## Consequences
- A new panel minor version means diffing the ported files and the specification notes (the shell and the components) and updating both; the version is written in the headers.
- The console depends on `react-router`, `react-icons` (the Phosphor and Heroicons glyphs the panel uses), `@mantine/notifications`, `@mantine/modals` and `@mantine/nprogress`, all pinned exactly; fonts (Unbounded) and the flag-emoji font are self-hosted.
- The server grew two reads (`GET /api/v1/version` with build information, `GET /api/v1/updates`) and the deep-link fallback.

## Audit of 2026-11-21 (shell, sign-in and Overview)
A second pass measured the console against the live panel with the browser's computed styles (header, tabs, the Menubar menus, the language menu, the version dialog, the drawer at 390 px, the two-row and the single-row header, the main padding, the toast container, the Home sections, the 404 page). Everything listed measured identical except what was changed in the audit:
- The sign-in screens are the panel's login page and its registration form: no heading on the sign-in and authenticator screens, a centered level 2 title and a dimmed line on the screens that create something (first run, invitation, authenticator setup, recovery codes), labelled fields with placeholders, a 408 px column, a full-width default button with a leading icon, errors as red toasts, and the panel's "generate and copy" password button. The boot state is the top progress bar alone.
- The Overview is laid out as the panel's Home page: titled sections of metric cards (`MetricSection`) with the panel's breakpoints and entrance animations, no page header card.
- The 404 page is the panel's full-screen page (outside the header), the 500 page is the route's error page with the technical details in the console's copyable block (the panel uses `@mantine/code-highlight`; a dependency for one stack trace was not worth it), and the connection-lost pill with the panel's three-failures watchdog is ported.
- A confirmation text is drawn at the body size, as the panel's `children` string is.
- Deliberate difference: at exactly 1024 px the panel renders its mobile header but Mantine counts the navbar as desktop, so its drawer cannot open. The console switches one hair below (63.99em) and shows the desktop header at 1024 px.

