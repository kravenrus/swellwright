# 07. UI and UX

> English translation of the [Russian design document](../../ru/design/07-ui-ux.md).

Goal: the UI looks and behaves like the Remnawave panel (it is immediately familiar to Remnawave administrators) and still offers fundamentally more: plans, live runs, diff, terminal, monitoring.

## 1. Foundation
- The same libraries as the panel (versions checked against the frontend of the Remnawave 3.4.x panel): React 19, Vite, **Mantine 9** (core, notifications, modals, spotlight, code-highlight, form, dates, dropzone, charts), TanStack Query 5, Zustand 5, React Router 7, Zod 4, i18next, Tabler icons, Monaco, `@xterm/xterm` (+ fit, webgl, unicode11, web-links).
- Theme: dark by default, light as an option; colors, radii, sizes and fonts are **taken from the panel theme** (the code, components and theme of the panel's open-source frontend are used as a base: AGPL-3.0, keeping copyright notices and marking changes, see ADR 0011; the Remnawave name and mark are not copied); own tokens live in `packages/ui`.
- **Visual language (verified against the panel frontend 3.4.11):** the panel's dark palette (body `#161b22`, text `#c9d1d9`), primary color cyan (shade 8), Montserrat for text and Fira Mono for code and terminals (self-hosted, not loaded from a CDN), Tabler icons, radius `md`, translucent cards, tinted "light" buttons, outline badges and pill tabs. The token table and the panel source files are in [wireframes/README.md](wireframes/README.md#visual-language).
- Tables: Mantine DataTable/Mantine React Table as in the panel (the panel's `@kastov/*` forks serve as a reference, regular packages where necessary), virtualization for large lists.
- Charts: Mantine Charts (Recharts); probe heatmaps and time series are built on top of them (Highcharts in the panel has its own license and is not used).

## 2. Shell
- **AppShell:** the panel's default compact layout: a header with a brand row (64 px: logo, panel switcher, tray of active runs, Spotlight search Ctrl+K, alerts, user) and a navigation row (52 px) with grouped sections and dropdowns; a floating left sidebar is an option; every page opens with a header card (icon, title, description, actions) as in the panel.
- Navigation sections: Overview; **Fleet** (Servers, Nodes, Chains, DNS, Certificates); **Operations** (Runs, Scenarios, Schedules); **Monitoring** (Probes, Alerts, Reports); **Panel** (Profiles, Hosts, Squads, Templates, Subscriptions, Plugins, Billing, Users, API console); **Security** (Vault, Users and roles, Tokens, Sessions, Audit); **Settings** (General, Conventions, Baselines, Policies, Integrations, Notifications). Documentation is a header button.
- Responsiveness: works on a phone (the emergency use case "look and roll back").

## 3. Pages
| Page | Contents |
|---|---|
| **Overview** | fleet health (online, drift, expirations), active runs and pending approvals, alerts, versions and vulnerability notices, upcoming schedules, daily availability picture |
| **Servers** | table (country, provider, IP, OS, kernel, state, drift, version, tags), filters and saved views; server card: Overview, Facts, Baseline and drift, Runs, Terminal, Files, DNS, Certificate, Panel (linked node), Secrets (who used them), Log |
| **Nodes (panel)** | list of panel nodes linked to servers, actions, metrics, quick scenarios |
| **Runs** | list; run card: timeline of stages, live output (with search and a "copy as text" mode), remaining-time estimate, approvals, tree of undo records, buttons "Stop", "Resume", "Retry", "Roll back"; comparison with the previous run by stage timing |
| **Scenarios** | catalog (by the groups from `03`), parameter form (Zod validation), "Plan" button (dry run), then "Run" |
| **Panel: profiles** | list, Monaco editor with diff, inbound builder, linter, impact calculator ("N nodes will restart, approximately X-Y s") |
| **Panel: hosts** | table with conventions (violations highlighted), batch actions, binding to nodes and inbounds |
| **Panel: squads, templates, subscriptions, plugins, billing, users** | CRUD in the panel style, versions and diff |
| **Chains** | visual topology (node graph: entry, exit, route), creation wizard, end-to-end check |
| **DNS** | zones, records with actual visibility on the NS, changes, rollback |
| **Certificates** | expiry dates, cert-sync state, starting a sync |
| **Probes** | matrix "node × operator × time", daily charts, comparison with the baseline, agent setup |
| **Alerts** | active, history, rules, suppressions |
| **Schedules** | calendar and list |
| **Reports** | generation and viewing |
| **Security** | vault (status, rotation), users and roles, tokens, sessions, audit, terminal recordings |
| **API console** | explorer of panel operations (schemas, examples, dry run), log |
| **Settings** | general, conventions, baselines, policies, integrations, notifications, language and theme |
| **Plugins** | list with trust level and version, enabling with a display of the requested permissions, settings by the manifest schema, call log, updates (with a permissions diff) |

## 4. Key patterns
- **Plan drawer** for any change: what changes (diff), impact (restarts, how many nodes, time), risk and required approvals, rollback (what comes back, what does not), locks; the "Run" button is active only after the plan has been reviewed. This is a direct embodiment of policy P-001 (read-only by default, writes require an approved plan).
- **Live run:** a header with an overall progress bar and a remaining-time estimate, stages with statuses, step output in terminal style with a gray separator, colors and icons aligned with Tabler: ✔ done, ✖ error, ⚠ warning, ℹ info, ▶ running, ● waiting, ↺ rollback (replaced by SVG icons; a "text icons" mode).
- **Diff everywhere:** profiles, templates, hosts, settings, node configs (side-by-side, unified).
- **Copying:** "Copy as text" (without ANSI) and "Download log" buttons; output copies as plain text.
- **Approvals:** a separate center, a card with the plan and the buttons approve, reject, request changes; for high risk, entering a confirmation phrase.
- **Wizard forms:** deployment (steps: server, parameters, DNS, panel, access, verification, plan, run); rename; hop chain; panel connection; DNS connection.
- **Secrets in forms:** masked fields, a "take from vault" choice, visible only at the moment of entry, hints on where to get them (RU-CENTER and others).
- **Empty and error states:** clear messages and "what to do next" actions, loading skeletons, request retry.
- **Search and commands:** Spotlight (servers, nodes, hosts, runs, commands such as "run a check on node XX-02"), hotkeys.
- **Notifications:** Mantine Notifications for short events, a notification center for history.
- **Localization:** ru and en, date and duration formats, 24-hour time, no emoji in the UI (country flags on hosts are shown as panel data).
- **Accessibility:** keyboard, focus, contrast (axe checks), status is never conveyed by color alone.

## 5. Terminal
Tabs, server selection, font and size, copy and paste with confirmation of multiline input, search, recording, a "session is being recorded" indicator, an elevated-privileges indicator, idle timeout, a "close for everyone" button for the administrator.

## 6. Technical requirements
- Server state in TanStack Query (cache, retries, invalidation on WebSocket events), local state in Zustand.
- Lazy loading of heavy components (Monaco, xterm, charts), a bundle size budget.
- Visual regression and e2e tests on Playwright, accessibility checks.
- Shared components in `packages/ui`, Storybook as a catalog (optional).

## 7. Language and universality
The UI is English by default, Russian is complete (i18next); core texts are not tied to a country or provider; plugin contributions are described declaratively (settings pages, widgets) and rendered with the same set of Mantine components; arbitrary React bundles from plugins are not loaded in the first version.

## 8. Wireframes
Annotated wireframes of the key screens (overview, server card, plan and approval, run card, sealed vault, vault, first-run setup, phone layouts) are in [`wireframes/`](wireframes/README.md).
