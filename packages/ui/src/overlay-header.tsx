import { Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ElementType } from 'react';

/**
 * The title of a modal or a drawer, as the panel's BaseOverlayHeader: a soft icon, the title in white and a small
 * dimmed line under it.
 */
export function OverlayHeader({
  icon: Icon,
  title,
  subtitle,
  iconColor = 'cyan',
}: {
  icon: ElementType<{ size?: number }>;
  title: string;
  subtitle?: string;
  iconColor?: string;
}) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon color={iconColor} size="lg" variant="soft">
        <Icon size={20} />
      </ThemeIcon>
      <Stack gap={0}>
        <Title c="white" order={4}>
          {title}
        </Title>
        {subtitle ? (
          <Text c="dimmed" size="xs">
            {subtitle}
          </Text>
        ) : null}
      </Stack>
    </Group>
  );
}
