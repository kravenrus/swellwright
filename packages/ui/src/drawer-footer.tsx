// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/drawer-footer/{drawer-footer.shared.tsx,
// DrawerFooter.module.css}. Changes: the CSS module became the `sw-drawer-footer-bar` class; `isMobile` can be passed in,
// otherwise a media query decides (the panel reads it from a context).
import { Box, Group } from '@mantine/core';
import type { ReactNode } from 'react';

import { useBelowDesktop } from './internal.js';

export interface DrawerFooterProps {
  children: ReactNode;
  /** Stretch the buttons. Defaults to the panel's mobile query (below 64em). */
  isMobile?: boolean;
}

/** The sticky footer of a drawer, with the safe-area inset at the bottom on phones. Put it last in the drawer body. */
export function DrawerFooter({ children, isMobile }: DrawerFooterProps) {
  const below = useBelowDesktop();
  const stretch = isMobile ?? below;

  return (
    <Box className="sw-drawer-footer-bar" component="footer">
      <Group
        gap="md"
        grow={stretch}
        justify="flex-end"
        preventGrowOverflow={false}
        w="100%"
        wrap="wrap"
      >
        {children}
      </Group>
    </Box>
  );
}
