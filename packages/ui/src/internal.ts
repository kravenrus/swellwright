import { useMediaQuery } from '@mantine/hooks';

/** Joins class names and skips the parts that are not strings. Returns `undefined` when nothing is left. */
export function cx(...parts: (string | false | null | undefined)[]): string | undefined {
  const joined = parts.filter((part) => typeof part === 'string' && part !== '').join(' ');
  return joined === '' ? undefined : joined;
}

/**
 * The panel's mobile flag: below its `lg` breakpoint (64em) the dialogs go full screen and the footers stretch their
 * buttons. It asks for the value on the first render, so there is no flash of the wrong layout.
 */
export function useBelowDesktop(): boolean {
  return useMediaQuery('(max-width: 63.99em)', undefined, { getInitialValueInEffect: false });
}
