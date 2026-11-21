// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/page-header/{page-header.shared.tsx,
// page-header.module.css}. The entrance is the panel's `motion` (the same 0.5 s rise from -10 px with the same easing).
// Changes: copying the description reports to an optional `onCopy` callback (the panel shows a toast); a `badges` slot
// next to the title is ours; the icon is optional when `customIcon` is given.
import {
  Box,
  Card,
  type CardProps,
  type ElementProps,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { motion } from 'motion/react';
import type { ReactNode, Ref } from 'react';

import { RISE } from './motion.js';

export interface PageHeaderProps
  extends
    Omit<CardProps, 'c' | 'fw' | 'size' | 'tt' | 'children'>,
    ElementProps<'div', keyof CardProps | 'title' | 'onCopy'> {
  /** The glyph of the soft icon; give it size 24. */
  icon?: ReactNode;
  /** Replaces the soft icon, for example with a logo. */
  customIcon?: ReactNode;
  title: ReactNode;
  /** A dimmed line under the title; clicking it copies it (an entity page puts the entity id here). */
  description?: string;
  /** Badges next to the title. */
  badges?: ReactNode;
  /** The icon-only action buttons on the right: a `HeaderActions` cluster. */
  actions?: ReactNode;
  /**
   * Let the actions wrap onto several lines. The panel's default is false: its actions are a few icon buttons that
   * wrap by themselves inside `HeaderActions`.
   */
  wrapActions?: boolean;
  /** Called after the description was copied. */
  onCopy?: (value: string) => void;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The header card every page opens with, as in the panel: a soft icon, a title, a description and actions, all
 * rising into place when the page opens.
 */
export function PageHeader({
  icon,
  customIcon,
  title,
  description,
  badges,
  actions,
  wrapActions = false,
  withBorder = true,
  onCopy,
  ref,
  ...props
}: PageHeaderProps) {
  const { copy } = useClipboard();

  const handleCopy = () => {
    if (description) {
      copy(description);
      onCopy?.(description);
    }
  };

  return (
    <Card
      className="sw-page-header-card"
      mb="md"
      padding="md"
      ref={ref}
      shadow="xl"
      withBorder={withBorder}
      {...props}
    >
      <motion.div {...RISE} style={{ position: 'relative', zIndex: 1 }}>
        <Box className="sw-ph-wrapper">
          <Box className="sw-ph-content">
            <Group align="center" gap="md" wrap="nowrap">
              <motion.div {...RISE}>
                {customIcon ?? (
                  <ThemeIcon size="xl" variant="soft">
                    {icon}
                  </ThemeIcon>
                )}
              </motion.div>

              <Stack gap={0}>
                <motion.div {...RISE}>
                  <Group gap="sm" wrap="wrap">
                    <Title order={4} pt={0}>
                      {title}
                    </Title>
                    {badges}
                  </Group>
                </motion.div>
                {description ? (
                  <motion.div {...RISE}>
                    <Text
                      c="dimmed"
                      fz="sm"
                      onClick={handleCopy}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleCopy();
                        }
                      }}
                      role="button"
                      style={{ cursor: 'copy' }}
                      tabIndex={0}
                    >
                      {description}
                    </Text>
                  </motion.div>
                ) : null}
              </Stack>
            </Group>
          </Box>

          {actions ? (
            <motion.div {...RISE} className="sw-ph-actions">
              <Group gap="sm" justify="flex-end" wrap={wrapActions ? 'wrap' : 'nowrap'}>
                {actions}
              </Group>
            </motion.div>
          ) : null}
        </Box>
      </motion.div>
    </Card>
  );
}
