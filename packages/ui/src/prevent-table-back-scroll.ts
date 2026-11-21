// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/hooks/use-prevent-table-back-scroll.ts and
// src/shared/utils/misc/prevent-back-scroll.ts. Every table page of the panel calls the hook. Changes: the two files are
// one, and the scroll-parent search is typed.
import { useLayoutEffect } from 'react';

/** The nearest ancestor that scrolls sideways, or nothing. */
function findScrollableParent(start: Element | null): Element | null {
  let element = start;
  while (element && element !== document.body) {
    const { overflowX } = window.getComputedStyle(element);
    if (overflowX === 'auto' || overflowX === 'scroll') {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

/**
 * A sideways wheel or trackpad swipe at the edge of a scrolling table would otherwise go on to the browser as "go back".
 * This stops it there, and leaves the scrolling inside the table alone.
 */
function preventBackScrollTables(event: WheelEvent): void {
  if (event.deltaX === 0) {
    return;
  }

  const scrollable = findScrollableParent(event.target instanceof Element ? event.target : null);

  if (scrollable) {
    const atLeftEdge = scrollable.scrollLeft <= 0 && event.deltaX < 0;
    const atRightEdge =
      scrollable.scrollLeft + scrollable.clientWidth >= scrollable.scrollWidth - 1 &&
      event.deltaX > 0;

    if (!atLeftEdge && !atRightEdge) {
      return;
    }
  }

  event.preventDefault();
  event.stopPropagation();
}

/** Call it once in a page that shows a table, as every table page of the panel does. */
export function usePreventTableBackScroll(): void {
  useLayoutEffect(() => {
    document.body.addEventListener('wheel', preventBackScrollTables, { passive: false });
    return () => {
      document.body.removeEventListener('wheel', preventBackScrollTables);
    };
  }, []);
}
