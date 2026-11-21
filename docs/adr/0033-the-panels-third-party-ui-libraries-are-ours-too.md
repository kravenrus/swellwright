# ADR 0033: The panel's third-party UI libraries are ours too

Status: accepted

## Context
ADR 0032 ported the panel's shell and components and, for the pieces the panel builds on third-party libraries, wrote our own look-alikes: the list table was Mantine's `Table` styled like the panel's data table, the entrance animations were CSS keyframes, tag colours came from a small local hash. The owner's rule (2026-11-21): when the panel's layout, design or UX uses a third-party solution to show a component, we use the same solution; an imitation is never the same, and differences show (no column resizing, toggling or persistence; other tag colours; other motion curves).

## Decision
- The panel's third-party display libraries are used as the panel uses them, at the versions it pins: `@kastov/mantine-datatable` for list tables (with the panel's helpers for cells, column visibility and controls, ported with notices), `motion` for the page and card entrances, `color-hash` for tag colours, `dayjs` for date display. Others (charts, editors, the terminal, markdown) are added when the console builds the component that needs them.
- A library is added with the component that uses it, not in advance. It passes ADR 0009: exact pin, at least three days old, no install scripts, `pnpm audit` clean, and its published tarball is read once for network access, dynamic code and embedded URLs before first use (done for `@kastov/mantine-datatable` 9.3.4: no network, no `eval`, no URLs; one maintainer, a fork of `icflorescu/mantine-datatable`). Each is listed in `THIRD_PARTY_NOTICES.md` and kept behind our `packages/ui` wrappers where that costs nothing, so a swap stays possible.
- Plumbing is not a display solution and is not copied: `zustand` stores, `@ebay/nice-modal-react` registries, route guards.
- This supersedes the sentence of ADR 0032 that excluded `motion`, `zustand`, nice-modal and the table libraries; the exclusion of plumbing stays.

## Consequences
The console's tables behave as the panel's (resize and reorder columns, hide columns, sort, persisted layout, the same reset menu), at the price of a dependency maintained by one person. Following a panel release means bumping these pins with the panel's.
