import { useMediaQuery } from '@mantine/hooks';

/**
 * The panel's mobile flag (`MOBILE_QUERY` of its `IsMobileProvider`): `max-width: 64rem`, so up to and including
 * 1024 px. The right layout is chosen on the first render (no flash of the wrong one). The drawer's AppShell
 * breakpoint is set one pixel higher (see `console-layout.tsx`), so the drawer opens at exactly 1024 px, where the
 * panel itself cannot open it.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 64rem)', undefined, { getInitialValueInEffect: false });
}

/** From 2048 px the panel puts the tabs in the brand row and pads the page by 10vw on each side. */
export function useIsHiResDesktop(): boolean {
  return useMediaQuery('(min-width: 2048px)', undefined, { getInitialValueInEffect: false });
}
