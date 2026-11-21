// The entrance the Remnawave panel frontend 3.4.11 (AGPL-3.0-only) gives the parts of a page header and of a table card
// title: they rise 10 px into place while fading in, over half a second with this easing (src/shared/ui/page-header/
// page-header.shared.tsx and src/shared/ui/table/table.card-titile.tsx, written out there on every `motion.div`).
export const RISE = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0, 0.71, 0.2, 1.01] as [number, number, number, number] },
} as const;
