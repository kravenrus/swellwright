import { Box, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Badges next to the title. */
  badges?: ReactNode;
  /** Buttons on the right. */
  actions?: ReactNode;
}

/** The header card every page opens with, as in the panel: a soft icon, a title, a description and actions. */
export function PageHeader({ icon, title, description, badges, actions }: PageHeaderProps) {
  return (
    <Card mb="md" padding="md" shadow="xl">
      <Group align="center" gap="md" justify="space-between" wrap="wrap">
        <Group align="center" gap="md" style={{ minWidth: 0 }} wrap="nowrap">
          <ThemeIcon size="xl" variant="soft">
            {icon}
          </ThemeIcon>
          <Stack gap={0}>
            <Group gap="sm" wrap="wrap">
              <Title order={4}>{title}</Title>
              {badges}
            </Group>
            {description ? (
              <Text c="dimmed" fz="sm">
                {description}
              </Text>
            ) : null}
          </Stack>
        </Group>
        {actions ? (
          <Box ml="auto">
            <Group gap="sm" justify="flex-end" wrap="wrap">
              {actions}
            </Group>
          </Box>
        ) : null}
      </Group>
    </Card>
  );
}
