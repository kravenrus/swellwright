import { Box, createPolymorphicComponent, UnstyledButton, type BoxProps } from '@mantine/core';
import type { ReactNode } from 'react';

export interface HeaderControlProps extends BoxProps {
  children: ReactNode;
}

function BaseHeaderControl({ className, ...others }: HeaderControlProps) {
  return <UnstyledButton className={className ? `sw-hc ${className}` : 'sw-hc'} {...others} />;
}

/**
 * A square control of the header, as in the panel: 44 px, a rounded gradient face, a sheen and a lift on hover.
 * Polymorphic, so it can be a button, a link or a div that holds a menu target.
 */
export const HeaderControl = createPolymorphicComponent<'button', HeaderControlProps>(
  BaseHeaderControl,
);

/** The placeholder of a header control while its data loads. */
export function SkeletonHeaderControl({ width = 44 }: { width?: number | string }) {
  return <Box aria-hidden className="sw-hc-skeleton" h={44} w={width} />;
}
