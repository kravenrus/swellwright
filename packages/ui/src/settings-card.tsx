// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/settings-card/{index.ts,
// settings-card-container.tsx,settings-card-header.tsx,settings-card-content.tsx,settings-card-bottom.tsx,
// settings-card.module.css}. Changes: the CSS module became the `sw-settings-card` class; the header's icon colour and
// variant default to cyan and soft and its description is optional; HTML attributes are accepted on the container.
import {
  Box,
  Card,
  type CardProps,
  Divider,
  type ElementProps,
  Flex,
  Group,
  Stack,
  Text,
  ThemeIcon,
  type ThemeIconProps,
  Title,
} from '@mantine/core';
import type { ReactNode } from 'react';

import { cx } from './internal.js';

export type SettingsCardContainerProps = CardProps & ElementProps<'div', keyof CardProps>;

function SettingsCardContainer({ children, className, ...props }: SettingsCardContainerProps) {
  return (
    <Card
      className={cx('sw-settings-card', className)}
      padding="md"
      shadow="xl"
      withBorder
      {...props}
    >
      <Flex direction="column" gap="xs">
        {children}
      </Flex>
    </Card>
  );
}

export interface SettingsCardHeaderProps {
  title: string;
  description?: ReactNode;
  /** Usually an icon of size 24. */
  icon: ReactNode;
  /** Defaults to cyan. */
  iconColor?: ThemeIconProps['color'];
  /** Defaults to soft. */
  iconVariant?: ThemeIconProps['variant'];
}

function SettingsCardHeader({
  description,
  icon,
  iconColor = 'cyan',
  iconVariant = 'soft',
  title,
}: SettingsCardHeaderProps) {
  return (
    <Box>
      <Group align="flex-start" justify="space-between">
        <Group align="flex-start" gap="md" wrap="nowrap">
          <ThemeIcon color={iconColor} size="xl" variant={iconVariant}>
            {icon}
          </ThemeIcon>

          <Stack gap={0}>
            <Title order={4}>{title}</Title>
            {description ? (
              <Text c="dimmed" size="sm">
                {description}
              </Text>
            ) : null}
          </Stack>
        </Group>
      </Group>

      <Divider my="md" style={{ opacity: 0.3 }} />
    </Box>
  );
}

function SettingsCardContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** The action bar of the card: a divider, then the buttons (a primary `Button color="teal" size="md" variant="soft"`). */
function SettingsCardBottom({ children }: { children: ReactNode }) {
  return (
    <>
      <Divider mt="lg" style={{ opacity: 0.3 }} />
      {children}
    </>
  );
}

/**
 * A settings card of the panel: a gradient card with a header (soft icon, title, description, divider), the content
 * and a bottom bar. Each form card has its own save button, there is no page-level save.
 */
export const SettingsCard = {
  Container: SettingsCardContainer,
  Header: SettingsCardHeader,
  Content: SettingsCardContent,
  Bottom: SettingsCardBottom,
};
