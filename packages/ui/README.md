# packages/ui

Shared UI components and theme tokens.

Status: the Remnawave panel theme tokens, `theme`, `styles.css`, the compact `AppHeader` controls, and the panel's shared primitives (frontend 3.4.11, adapted with notices, see `THIRD_PARTY_NOTICES.md`): `PageHeader`, `HeaderActions`/`HeaderAction`, `OverlayHeader`, `SectionCard`, `SettingsCard`, `ModalFooter`, `DrawerFooter`, `MetricCard`, `ShimmerSkeleton`, `LoadingScreen`, `LoaderModal`, `EmptyPageLayout`, `CopyableCodeBlock`, `CopyableDataListItem`, `CopyableField`, `ErrorMessageBlock`, `Callout`, `StatusBadge`, `EntityCard`, `TagFilterBar`, `DataTableCard`, `ListTable` and `StatRow`. See `docs/en/design/wireframes/README.md` for the token table.

Conventions: components take already translated strings as props (a few accessible names have English fallbacks that the caller should replace), report copies through an optional `onCopy` callback instead of showing a toast, and keep the panel's props (sizes, variants, colours). The styles of the primitives are the `sw-*` rules at the end of `src/styles.css`.
