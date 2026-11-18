// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/shimmer-skeleton/{shimmer-skeleton.tsx,
// shimmer-skeleton.module.css}. Changes: the CSS module became the `sw-shimmer-skeleton` class (it reuses the `sw-shimmer`
// keyframes of the header controls); the placeholder is hidden from assistive technology.
import { Box, type BoxProps, type ElementProps, type MantineSize } from '@mantine/core';

import { cx } from './internal.js';

type SizeValue = MantineSize | number | (string & {});

export interface ShimmerSkeletonProps
  extends Omit<BoxProps, 'h' | 'w'>, ElementProps<'div', keyof BoxProps> {
  height: SizeValue;
  width: SizeValue;
}

/** A placeholder block with a cyan sheen that sweeps across it; the panel uses it for the value of a metric card. */
export function ShimmerSkeleton({ height, width, className, ...rest }: ShimmerSkeletonProps) {
  return (
    <Box
      aria-hidden
      className={cx('sw-shimmer-skeleton', className)}
      h={height}
      w={width}
      {...rest}
    />
  );
}
