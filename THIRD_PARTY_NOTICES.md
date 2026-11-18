# Third-party notices

No third-party code is bundled in the application yet. Material that is already included in the repository, and material that is referenced, is listed here with its license and attribution. When dependencies or adapted code are added they are listed here too. Any code derived from Remnawave (`AGPL-3.0-only`) is listed with its origin and the retained notices.

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

Montserrat and Fira Mono, the fonts of the Remnawave panel theme, are bundled into the web build from the `@fontsource/montserrat` and `@fontsource/fira-mono` packages. Both are distributed under the SIL Open Font License 1.1; the license texts ship inside those packages, and a release adds them next to the build output.

## Remnawave panel frontend (AGPL-3.0-only)

The design tokens described in `docs/en/design/wireframes/README.md` (palette, primary color, fonts, radii, component variants, layout) were read from the open-source Remnawave frontend, version 3.4.11, under `src/shared/constants/theme`. The shared components of `packages/ui` are adapted from the same frontend (ADR 0011). Every adapted file starts with a line `Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): <panel path>. Changes: ...`; the panel's CSS modules are translated into the `sw-*` rules at the end of `packages/ui/src/styles.css`. The adapted components are `OverlayHeader`, `SectionCard`, `SettingsCard`, `ModalFooter`, `DrawerFooter`, `MetricCard`, `ShimmerSkeleton`, `LoaderModal`, `EmptyPageLayout`, `CopyableCodeBlock`, `CopyableDataListItem`, `CopyableField`, `ErrorMessageBlock`, `Callout` (from the one-time notice of the API-token card), `PageHeader`, `EntityCard`, `TagFilterBar`, `SingleRowOverflowList` and `DataTableCard`. `HeaderActions`, `HeaderAction`, `StatusBadge` and `ListTable` encode patterns of the panel without copying its files. No Remnawave name, logo or link is used.

The look of `ListTable` follows the stylesheet of `@kastov/mantine-datatable` 9.3.4 (MIT, a fork of `icflorescu/mantine-datatable`), which the panel uses for its list tables: only values (colours, borders, spacing) were read from it; no code of that package is included and the package is not installed.
