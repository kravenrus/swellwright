import { useMediaQuery } from '@mantine/hooks';

/**
 * The panel switches to its mobile layout at `lg` (64em). It asks for `max-width: 64rem`, which also matches at
 * exactly 1024 px, where Mantine's AppShell already counts as desktop; this stops a hair before, so both agree.
 * The right layout is chosen on the first render (no flash of the wrong one).
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 63.99em)', undefined, { getInitialValueInEffect: false });
}

/** From 2048 px the panel puts the tabs in the brand row and pads the page by 10vw on each side. */
export function useIsHiResDesktop(): boolean {
  return useMediaQuery('(min-width: 2048px)', undefined, { getInitialValueInEffect: false });
}
