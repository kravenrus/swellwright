// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/section-card/{index.ts,
// section-card.root.tsx,section-card.section.tsx}. Changes: the surface (translucent white, thin border) comes from the
// `sw-section-card` class instead of an inline style, so a caller's `style` stays free; HTML attributes are accepted.
import {
  Box,
  type BoxProps,
  Card,
  type CardProps,
  Divider,
  type ElementProps,
  type MantineSpacing,
  Stack,
} from '@mantine/core';
import { Children, type ReactNode, type Ref } from 'react';

import { cx } from './internal.js';

export interface SectionCardRootProps
  extends Omit<CardProps, 'children'>, ElementProps<'div', keyof CardProps> {
  children: ReactNode;
  /** Opacity of the dividers between the sections; 0.3 by default. */
  dividerOpacity?: number;
  /** With `allDividers={false}`: only one divider, under the first section. */
  onlyFirstDivider?: boolean;
  /** A divider between every two sections; on by default. */
  allDividers?: boolean;
  /** Gap between a section and a divider; 'md' by default. */
  gap?: MantineSpacing;
  ref?: Ref<HTMLDivElement>;
}

function SectionCardRoot({
  children,
  dividerOpacity = 0.3,
  onlyFirstDivider = false,
  allDividers = true,
  gap = 'md',
  p = 'md',
  radius = 'md',
  className,
  ref,
  ...props
}: SectionCardRootProps) {
  const childArray = Children.toArray(children).filter(Boolean);

  const childrenWithDividers = childArray.flatMap((child, index) => {
    if (onlyFirstDivider && index === 0 && childArray.length > 1) {
      return [
        child,
        <Divider key={`divider-${String(index)}`} style={{ opacity: dividerOpacity }} />,
      ];
    }
    if (allDividers && index < childArray.length - 1) {
      return [
        child,
        <Divider key={`divider-${String(index)}`} style={{ opacity: dividerOpacity }} />,
      ];
    }
    return [child];
  });

  return (
    <Card className={cx('sw-section-card', className)} p={p} radius={radius} ref={ref} {...props}>
      <Stack gap={gap}>{childrenWithDividers}</Stack>
    </Card>
  );
}

export interface SectionCardSectionProps extends BoxProps, ElementProps<'div'> {
  ref?: Ref<HTMLDivElement>;
}

function SectionCardSection({ children, ...props }: SectionCardSectionProps) {
  return <Box {...props}>{children}</Box>;
}

/**
 * The neutral grouped card of the panel: a translucent card with dividers between its sections. The usual
 * composition is a first section with an `OverlayHeader titleOrder={5}` and one or more sections with fields.
 */
export const SectionCard = {
  Root: SectionCardRoot,
  Section: SectionCardSection,
};
