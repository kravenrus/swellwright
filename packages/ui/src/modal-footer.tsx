// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/modal-footer/{modal-footer.shared.tsx,
// ModalFooter.module.css}. Changes: the CSS module became the `sw-modal-footer` class; `isMobile` falls back to a
// media query when the caller does not pass it.
import { Group, Modal } from '@mantine/core';
import type { ReactNode } from 'react';

import { useBelowDesktop } from './internal.js';

export interface ModalFooterProps {
  children: ReactNode;
  /** Stretch the buttons. Defaults to the panel's mobile query (below 64em). */
  isMobile?: boolean;
}

/**
 * The sticky footer of a modal: a `Modal.Header` rendered as a `<footer>` that stays at the bottom of the scrolling
 * body. Put it as the last child of the modal body. The actions are right-aligned; the primary one is
 * `Button color="teal" size="md" variant="soft"` with a 16 px left icon.
 */
export function ModalFooter({ children, isMobile }: ModalFooterProps) {
  const below = useBelowDesktop();
  const stretch = isMobile ?? below;

  return (
    <Modal.Header className="sw-modal-footer" component="footer" h="auto" mt="md" pos="sticky">
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
    </Modal.Header>
  );
}
