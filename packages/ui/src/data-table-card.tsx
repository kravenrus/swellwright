// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/table/{index.ts,table.card-titile.tsx,
// table.container.shared.tsx,table.table-content.tsx,table.module.css}. Changes: `motion` is replaced by the CSS class
// `sw-page-header` (the same rise); the CSS module became `sw-dtc-*` classes (shared with the page header); the glyph in
// the title is an inert `div`, not a button that does nothing.
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
import type { ReactNode, Ref } from 'react';

import { cx } from './internal.js';

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
      <div className="sw-page-header" style={{ position: 'relative', zIndex: 1 }}>
        <Box className="sw-ph-wrapper">
          <Box className="sw-ph-content">
            <Group align="center" gap="md" wrap="nowrap">
              <div className="sw-page-header">
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
              </div>

              <Stack gap={0}>
                <div className="sw-page-header">
                  <Title order={4} pt={0}>
                    {title}
                  </Title>
                </div>
                {description ? (
                  <div className="sw-page-header">
                    <Text c="dimmed" fz="sm">
                      {description}
                    </Text>
                  </div>
                ) : null}
              </Stack>
            </Group>
          </Box>

          {actions ? (
            <div className="sw-page-header sw-ph-actions">
              <Group align="flex-end" gap="sm" wrap="nowrap">
                {actions}
              </Group>
            </div>
          ) : null}
        </Box>
      </div>
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
 * then the list on the page background. Compose it as `Container > Title + Content` and put a `ListTable` in the
 * content (with `withTableBorder={false}` and `borderRadius={0}`, since the card already has a border).
 */
export const DataTableCard = {
  Container: DataTableCardContainer,
  Title: DataTableCardTitle,
  Content: DataTableCardContent,
};
