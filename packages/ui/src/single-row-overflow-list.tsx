// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/single-row-overflow-list/
// single-row-overflow-list.tsx. Changes: none in behaviour.
import { OverflowList, type OverflowListProps } from '@mantine/core';

export interface SingleRowOverflowListProps<T> extends Omit<OverflowListProps<T>, 'maxRows'> {
  /** Height of the single row in pixels; 20 by default. */
  rowHeight?: number;
}

/** Mantine's `OverflowList` fixed to one row: what does not fit is handed to `renderOverflow`. */
export function SingleRowOverflowList<T>({
  rowHeight = 20,
  ...props
}: SingleRowOverflowListProps<T>) {
  return (
    <OverflowList<T>
      {...props}
      maxRows={1}
      styles={{ root: { maxHeight: rowHeight, overflow: 'hidden' } }}
    />
  );
}
