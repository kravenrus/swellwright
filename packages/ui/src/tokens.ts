/**
 * Design tokens mirrored from the Remnawave panel frontend 3.4.11 (`src/shared/constants/theme/theme.ts`).
 * Re-verify them when the supported panel minor version changes (see docs/en/design/wireframes/README.md).
 */

/** Mantine `dark` palette of the panel, index 0 (text) to 9 (deepest background). */
export const DARK = [
  '#c9d1d9',
  '#b1bac4',
  '#8b949e',
  '#6e7681',
  '#484f58',
  '#30363d',
  '#21262d',
  '#161b22',
  '#0d1117',
  '#010409',
] as const;

export const SHADED_GRAY = [
  '#f5f5f5',
  '#e8e8e8',
  '#d4d4d4',
  '#c0c0c0',
  '#a8a8a8',
  '#a0a0a0',
  '#808080',
  '#686868',
  '#505050',
  '#383838',
] as const;

export const FONT_FAMILY =
  "Montserrat, Vazirmatn, 'Apple Color Emoji', 'Noto Sans SC', 'Twemoji Country Flags', sans-serif";
/** The font of the brand title (the panel uses it for the title and nothing else). */
export const FONT_FAMILY_BRAND = 'Unbounded, sans-serif';

/** The panel moves every breakpoint: `lg` (64em, 1024 px) is where its mobile layout ends. */
export const BREAKPOINTS = {
  xs: '30em',
  sm: '40em',
  md: '48em',
  lg: '64em',
  xl: '80em',
  '2xl': '96em',
  '3xl': '120em',
  '4xl': '160em',
} as const;
export const FONT_FAMILY_MONOSPACE = "'Fira Mono', monospace";

/** The panel paints cards as translucent white over the page background. */
export const SURFACE = {
  card: 'rgba(255, 255, 255, 0.02)',
  border: 'rgba(255, 255, 255, 0.08)',
  separator: 'rgba(255, 255, 255, 0.06)',
  drawerHeader: 'rgba(22, 27, 35, 0.95)',
} as const;

/** Layout constants of the panel's compact layout, in pixels. */
export const LAYOUT = { brandRow: 64, navRow: 52, pagePadding: 32 } as const;
