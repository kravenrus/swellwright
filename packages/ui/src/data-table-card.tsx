// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/table/{index.ts,table.card-titile.tsx,
// table.container.shared.tsx,table.table-content.tsx,table.module.css}. The entrance is the panel's `motion`. Changes:
// the CSS module became `sw-dtc-*` classes; the glyph in the title is an inert `div`, not a button that does nothing.
import {
  ActionIcon,
  type ActionIconProps,
  Box,
  Card,
  type CardProps,
  type CardSectionProps,
  type ElementProps,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { motion } from 'motion/react';
import type { ReactNode, Ref } from 'react';

import { cx } from './internal.js';
import { RISE } from './motion.js';

export type DataTableCardContainerProps = CardProps & ElementProps<'div', keyof CardProps>;

function DataTableCardContainer({ children, ...props }: DataTableCardContainerProps) {
  return <Card {...props}>{children}</Card>;
}

export interface DataTableCardTitleProps
  extends
    Omit<CardSectionProps, 'c' | 'fw' | 'size' | 'tt' | 'children'>,
    ElementProps<'div', keyof CardSectionProps | 'title'> {
  /** The icon-only actions on the right: a `HeaderActions` cluster. */
  actions?: ReactNode;
  description?: string;
  /** The glyph of the soft icon; give it size 24. */
  icon: ReactNode;
  /** For example `{ color: 'red' }` (the panel's torrent-blocker page). */
  iconProps?: ActionIconProps;
  title: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

function DataTableCardTitle({
  title,
  description,
  actions,
  withBorder = true,
  icon,
  iconProps,
  className,
  ref,
  ...props
}: DataTableCardTitleProps) {
  return (
    <Card.Section
      className={cx('sw-dtc-title', className)}
      data-orientation="vertical"
      inheritPadding
      py="md"
      ref={ref}
      withBorder={withBorder}
      {...props}
    >
      <motion.div {...RISE} style={{ position: 'relative', zIndex: 1 }}>
        <Box className="sw-ph-wrapper">
          <Box className="sw-ph-content">
            <Group align="center" gap="md" wrap="nowrap">
              <motion.div {...RISE}>
                <ActionIcon
                  aria-hidden
                  className="sw-dtc-icon"
                  color="cyan"
                  component="div"
                  size="input-md"
                  variant="soft"
                  {...iconProps}
                >
                  {icon}
                </ActionIcon>
              </motion.div>

              <Stack gap={0}>
                <motion.div {...RISE}>
                  <Title order={4} pt={0}>
                    {title}
                  </Title>
                </motion.div>
                {description ? (
                  <motion.div {...RISE}>
                    <Text c="dimmed" fz="sm">
                      {description}
                    </Text>
                  </motion.div>
                ) : null}
              </Stack>
            </Group>
          </Box>

          {actions ? (
            <motion.div {...RISE} className="sw-ph-actions">
              <Group align="flex-end" gap="sm" wrap="nowrap">
                {actions}
              </Group>
            </motion.div>
          ) : null}
        </Box>
      </motion.div>
    </Card.Section>
  );
}

export type DataTableCardContentProps = Omit<CardSectionProps, 'children'> &
  ElementProps<'div', keyof CardSectionProps> & { children?: ReactNode; ref?: Ref<HTMLDivElement> };

function DataTableCardContent({ children, ref, ...props }: DataTableCardContentProps) {
  return (
    <Card.Section bg="var(--mantine-color-body)" data-orientation="vertical" ref={ref} {...props}>
      {children}
    </Card.Section>
  );
}

/**
 * The titled card that wraps a list: a header with a soft cyan icon, a title, a description and icon-only actions,
 * then the list on the page background. Compose it as `Container > Title + Content` and put a `MantineReactTable`
 * (see `panelTableOptions`) in the content, as the panel's Users page does.
 */
export const DataTableCard = {
  Container: DataTableCardContainer,
  Title: DataTableCardTitle,
  Content: DataTableCardContent,
};
