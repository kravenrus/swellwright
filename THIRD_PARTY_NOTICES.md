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

Code adapted from that frontend (Copyright (C) 2025 Remnawave, AGPL-3.0-only, the license of this project too, as ADR 0011 describes) lives in `packages/ui`, `apps/web/src/shell` and `apps/web/src/security` (the token permission rows and the token list styles, from the panel's API-token card). Every adapted file says in its header which file of the panel it comes from and what was changed. The panel's name, logo and links are not copied.

The shared components of `packages/ui` are adapted from the same frontend (ADR 0011). Every adapted file starts with a line `Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): <panel path>. Changes: ...`; the panel's CSS modules are translated into the `sw-*` rules at the end of `packages/ui/src/styles.css`. The adapted components are `OverlayHeader`, `SectionCard`, `SettingsCard`, `ModalFooter`, `DrawerFooter`, `MetricCard`, `ShimmerSkeleton`, `LoaderModal`, `EmptyPageLayout`, `CopyableCodeBlock`, `CopyableDataListItem`, `CopyableField`, `ErrorMessageBlock`, `Callout` (from the one-time notice of the API-token card), `PageHeader`, `EntityCard`, `TagFilterBar`, `SingleRowOverflowList` and `DataTableCard`. `HeaderActions`, `HeaderAction`, `StatusBadge` and `ListTable` encode patterns of the panel without copying its files. No Remnawave name, logo or link is used.

The look of `ListTable` follows the stylesheet of `@kastov/mantine-datatable` 9.3.4 (MIT, a fork of `icflorescu/mantine-datatable`), which the panel uses for its list tables: only values (colours, borders, spacing) were read from it; no code of that package is included and the package is not installed.
