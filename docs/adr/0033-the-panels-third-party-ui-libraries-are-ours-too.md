# ADR 0033: The panel's third-party UI libraries are ours too

Status: accepted

## Context
ADR 0032 ported the panel's shell and components and, for the pieces the panel builds on third-party libraries, wrote our own look-alikes: the list table was Mantine's `Table` styled like the panel's data table, the entrance animations were CSS keyframes, tag colours came from a small local hash. The owner's rule (2026-11-21): when the panel's layout, design or UX uses a third-party solution to show a component, we use the same solution; an imitation is never the same, and differences show (no column resizing, toggling or persistence; other tag colours; other motion curves).

Reading the panel (frontend 3.4.11) showed that it has two table libraries, each for its own kind of page:

- `@kastov/mantine-react-table-open` (MRT, a Mantine fork of Material React Table) renders the tables inside a card with a title: Users, the subscription request history, the HWID inspector, torrent blocker reports. The toolbar above has the column filters under the head, density, full screen and column visibility; the toolbar below has the pages.
- `@kastov/mantine-datatable` renders the page-level lists of infrastructure objects (Hosts, Nodes) and the tables in dialogs (a user's devices): resizable, draggable, toggleable columns, pinned columns, column filters in popovers, a "reset" menu under the table.

## Decision
- The panel's third-party display libraries are used as the panel uses them, at the versions it pins. Today: `@kastov/mantine-react-table-open` 9.0.12 for the tables inside `DataTableCard` (ported option set `panelTableOptions`, persisted table state `useMrtTableState`, both in `packages/ui/src/mrt-table.tsx`), `motion` 12.42.2 for the entrance of page headers, table card titles and pages, `color-hash` 2.0.2 for tag colours. Their peers come with them: `@mantine/dates` 9.5.2 (the MRT date filters), `dayjs` 1.11.23, `clsx` 2.1.1. Dates shown to people keep `Intl` (`useDateTime`), which follows the language of the console; `dayjs` is only the peer MRT asks for.
- `@kastov/mantine-datatable` 9.3.4 is the table for a page-level list and for a dialog. No page of the console is of that kind yet; it is added, with the panel's cells, column-visibility popover, controls and sort helpers, with the first page that is (the fleet pages of phase 2). Its tarball was already read (no network, no `eval`, no URLs).
- Others (charts, editors, the terminal, markdown) are added when the console builds the component that needs them.
- A library is added with the component that uses it, not in advance. It passes ADR 0009: exact pin, at least three days old, no install scripts, `pnpm audit` clean, and its published tarball is read once for network access, dynamic code and embedded URLs before first use. Done for `@kastov/mantine-react-table-open` 9.0.12 (no network access, no `eval` or `new Function`, no `innerHTML`, no lifecycle scripts, one URL in a comment) and for the TanStack packages it depends on (`react-table`, `table-core`, `match-sorter-utils`, `react-virtual`, `virtual-core`: nothing but an author's URL). Each is listed in `THIRD_PARTY_NOTICES.md`; the libraries are reached through `packages/ui` (it re-exports the table API and the Russian and English texts), so a swap stays possible.
- Plumbing is not a display solution and is not copied: `zustand` stores, `@ebay/nice-modal-react` registries, route guards. The panel keeps the state of a table in a zustand store; ours is the same state kept with Mantine's `useLocalStorage` (the key `sw-table:<name>`).
- Where the panel does not translate a library (the table texts are English in its Russian interface), the console passes the library's own Russian bundle.
- This supersedes the sentence of ADR 0032 that excluded `motion`, `zustand`, nice-modal and the table libraries; the exclusion of plumbing stays.

## Consequences
The console's tables behave as the panel's (filters under the head, sorting, column order, width, pinning and visibility, density, full screen, pages, a layout that survives a reload), at the price of dependencies maintained by few people and a larger table chunk (about 87 kB gzipped, loaded with the first page that has a table). Our lists are small and filtered where they are loaded; a page with a big server-side list turns `manualPagination`, `manualFiltering` and `manualSorting` on, as the panel's Users page does. Following a panel release means bumping these pins with the panel's.
