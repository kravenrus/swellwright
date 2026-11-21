# Third-party notices

Material that is included in the repository or bundled in the application, and material that is referenced, is listed here with its license and attribution. When dependencies or adapted code are added they are listed here too. Any code derived from Remnawave (`AGPL-3.0-only`) is listed with its origin and the retained notices.

## Tabler Icons (MIT)

The icon shapes inside `docs/en/design/wireframes/*.svg` are taken from [Tabler Icons](https://github.com/tabler/tabler-icons) (outline set). The same icon set is used by the Remnawave panel.

```text
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts (bundled in the web build)

Montserrat and Fira Mono, the fonts of the Remnawave panel theme, and Unbounded, the font of its brand title, are bundled into the web build from the `@fontsource/montserrat`, `@fontsource/fira-mono` and `@fontsource/unbounded` packages. All are distributed under the SIL Open Font License 1.1; the license texts ship inside those packages, and a release adds them next to the build output.

The flag emoji font `Twemoji Country Flags` ships in the `country-flag-emoji-polyfill` package (MIT, TalkJS) and is bundled into the web build so that Windows can draw the flags in the language menu. Its glyphs come from Twemoji and are used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): the art is copyright Twitter, Inc. and other contributors (<https://github.com/twitter/twemoji>), it is redistributed in the font file without changes beyond the font packaging.

## Icon sets of `react-icons` (MIT)

The navigation and the header controls use a few glyphs from the Phosphor (`react-icons/pi`, MIT, Phosphor Icons) and Heroicons v1 (`react-icons/hi`, MIT, Refactoring UI Inc.) sets, as the Remnawave panel does, through the `react-icons` package (MIT). Only the imported icons are bundled.

## Remnawave panel frontend (AGPL-3.0-only)

The design tokens described in `docs/en/design/wireframes/README.md` (palette, primary color, fonts, radii, component variants, layout) were read from the open-source Remnawave frontend, version 3.4.11, under `src/shared/constants/theme`.

Code adapted from that frontend (Copyright (C) 2025 Remnawave, AGPL-3.0-only, the license of this project too, as ADR 0011 describes) lives in `packages/ui`, `apps/web/src/shell`, `apps/web/src/settings` (the failed-load card and the settings card of the plugin dialog, from the panel's active-sessions failed state and its external-squads response-headers card) and `apps/web/src/security` (the token permission rows and the token list styles, from the panel's API-token card; the card layout of the invite and change dialogs of the Users page, from the panel's create-user and view-user modals and their form cards) and `apps/web/src/fleet` (the Servers page: its table and its drawer, from the panel's Hosts and Nodes pages and its edit-host drawer). Every adapted file says in its header which file of the panel it comes from and what was changed. The panel's name, logo and links are not copied.

The shared components of `packages/ui` are adapted from the same frontend (ADR 0011). Every adapted file starts with a line `Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): <panel path>. Changes: ...`; the panel's CSS modules are translated into the `sw-*` rules at the end of `packages/ui/src/styles.css`. The adapted components are `OverlayHeader`, `SectionCard`, `SettingsCard`, `ModalFooter`, `DrawerFooter`, `MetricCard`, `ShimmerSkeleton`, `LoaderModal`, `EmptyPageLayout`, `CopyableCodeBlock`, `CopyableDataListItem`, `CopyableField`, `ErrorMessageBlock`, `Callout` (from the one-time notice of the API-token card), `PageHeader`, `EntityCard`, `TagFilterBar`, `SingleRowOverflowList`, `DataTableCard`, `StatRow` (from the panel's HTTP-statistics row) `MetricSection` (the section blocks of the panel's Home page) and `usePreventTableBackScroll` (from the hook every table page of the panel calls). `HeaderActions`, `HeaderAction`, `HeaderActionGroup`, `StatusBadge` and the date field setup of `packages/ui/src/date-picker.ts` (Mantine's `DatePickerInput` with the `ru` dayjs locale and the `customParseFormat` plugin, as the panel's `app.tsx` and `time-utils` prepare it) encode patterns of the panel without copying its files. The table option set and the persisted table state in `packages/ui/src/mrt-table.tsx` are adapted from the panel's Users and request-history table widgets and its table store (`src/shared/lib/mrt-table-store`). No Remnawave name, logo or link is used.


## Pages and overlays adapted from the panel's shell (AGPL-3.0-only, MIT for the drawing)

`apps/web/src/shell/error-pages.tsx` (the 404 and 500 pages), `apps/web/src/shell/connection-status.tsx` (the connection-lost pill, its probe and the watchdog), `apps/web/src/shell/loading-progress.tsx` and the sign-in screens in `apps/web/src/auth` follow the panel's `src/pages/errors`, `src/shared/ui/connection-status-overlay`, `src/shared/api/connection-watchdog.ts`, `src/shared/ui/loading-screen/loading-progress.tsx`, `src/pages/auth/login` and `src/features/auth` (login and register forms); each file names its origin. The drawing of the digits 404 in the not-found page is the "nothing found" illustration of the Mantine UI examples (MIT, Copyright (c) Mantine), which the panel itself uses.

## Libraries the panel's pages are built on (MIT)

The console uses the libraries the Remnawave panel renders its tables, entrances and tag colours with, at the versions the panel pins (ADR 0033). They are ordinary dependencies, not copied code:

- `@kastov/mantine-react-table-open` 9.0.12 (MIT, Copyright (c) 2023 Kevin Vandy, a Mantine fork of Material React Table), with `@tanstack/react-table`, `@tanstack/match-sorter-utils` and `@tanstack/react-virtual` (MIT, Tanner Linsley): the tables inside the cards.
- `motion` 12.42.2 (MIT, Matt Perry): the entrance of page headers, table card titles and pages.
- `color-hash` 2.0.2 (MIT, zenozeng): the colours of tags.
- `@kastov/mantine-datatable` 9.3.4 (MIT, Ionut-Cristian Florescu, a Mantine data table): the page-level lists, as the panel's Hosts and Nodes (the Servers page). It imports only `@mantine/core`, `@mantine/hooks`, `clsx` and React. Its cells, filters, controls and sort helper are adapted from the panel's `src/shared/ui/datatable` in `packages/ui/src/datatable.tsx`.
- `react-country-flag` 3.1.0 (MIT, Dan Alloway): the flag of a country in its emoji mode, as in the panel's Nodes table (`packages/ui/src/country-flag.tsx`). Its picture mode loads images from a CDN and is not used.
- `@mantine/code-highlight` 9.5.2 (MIT, Mantine): the details of the 500 page.
- `@mantine/dates` 9.5.2, `dayjs` 1.11.23 and `clsx` 2.1.1 (MIT): peers of the table package; `dayjs` (MIT, iamkun) also formats the dates of the console, as in the panel.

## SSH layer (`packages/ssh`)

The SSH layer uses `ssh2` 1.17.0 (MIT, Copyright Brian White) in its pure JavaScript mode, with its four runtime dependencies: `asn1` 0.2.6 (MIT, Copyright (c) 2011 Mark Cavage), `bcrypt-pbkdf` 1.0.2 (BSD-3-Clause, with the Blowfish portions of Niels Provos, Copyright 1997, and Implementation advice by David Mazieres), `safer-buffer` 2.1.2 (MIT, Copyright (c) 2018 Nikita Skovoroda) and `tweetnacl` 0.14.5 (Unlicense, public domain). `@types/ssh2` 1.15.6 (MIT, DefinitelyTyped contributors) is a development dependency. They are ordinary dependencies, not copied code; the license texts ship inside the packages and a release adds them next to the build output. `ssh2` lists two optional native add-ons (`cpu-features`, `nan`) that are never installed (`ignoredOptionalDependencies` in `pnpm-workspace.yaml`). The review of the dependency is in ADR 0035.
