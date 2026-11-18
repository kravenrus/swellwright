// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/metrics/metric-card/{metric-card.tsx,
// metric-card-with-trend.tsx,metric-card.module.css}. Changes: the CSS module became `sw-metric-*` classes; the icon
// component prop is called `icon`; `formatValue` replaces the panel's number formatter and `valueNode` its
// `rollingNumberComponent`; the trend glyphs come from react-icons like in the panel; a zero difference is neutral.
import {
  Box,
  Card,
  type ElementProps,
  Group,
  px,
  Stack,
  Text,
  ThemeIcon,
  type ThemeIconProps,
} from '@mantine/core';
import type { ElementType, ReactNode } from 'react';
import { PiTrendDown, PiTrendUp } from 'react-icons/pi';

import { ShimmerSkeleton } from './shimmer-skeleton.js';

interface MetricCardBase {
  /** The icon component. */
  icon: ElementType<{ size?: number }>;
  /** The colour of the soft icon; it says what the number means (teal active, red problem, orange pending...). */
  iconColor?: ThemeIconProps['color'];
  /** Defaults to 24. */
  iconSize?: number;
  /** Defaults to 'soft'. */
  iconVariant?: ThemeIconProps['variant'];
  /** Show a shimmering placeholder instead of the value. */
  isLoading?: boolean;
  themeIconProps?: ThemeIconProps;
  title: string;
}

export interface MetricCardProps extends MetricCardBase, ElementProps<'div', 'title'> {
  value: number | string;
  /** The verdict or a unit under the value. */
  subtitle?: string;
  /** Formats a numeric value; defaults to the browser's number formatting. */
  formatValue?: (value: number) => string;
  /** Replaces the value text, for an animated number. */
  valueNode?: ReactNode;
}

function MetricIcon({
  icon: Icon,
  iconColor,
  iconSize = 24,
  iconVariant = 'soft',
  themeIconProps,
}: Pick<MetricCardBase, 'icon' | 'iconColor' | 'iconSize' | 'iconVariant' | 'themeIconProps'>) {
  return (
    <ThemeIcon
      aria-hidden
      radius="lg"
      size="xl"
      variant={iconVariant}
      {...(iconColor === undefined ? {} : { color: iconColor })}
      {...themeIconProps}
    >
      <Icon size={iconSize} />
    </ThemeIcon>
  );
}

/**
 * A metric of the panel: a soft icon, a dimmed title, a bold monospace value and an optional line under it. Used in
 * strips above a list (`SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="xs"`).
 */
export function MetricCard({
  icon,
  iconColor,
  iconSize,
  iconVariant,
  themeIconProps,
  isLoading = false,
  title,
  value,
  subtitle,
  formatValue = (n) => n.toLocaleString(),
  valueNode,
  ...rest
}: MetricCardProps) {
  return (
    <Card {...rest}>
      <Group gap="md" wrap="nowrap">
        <MetricIcon
          icon={icon}
          {...(iconColor === undefined ? {} : { iconColor })}
          {...(iconSize === undefined ? {} : { iconSize })}
          {...(iconVariant === undefined ? {} : { iconVariant })}
          {...(themeIconProps === undefined ? {} : { themeIconProps })}
        />

        <Stack gap={0} miw={0}>
          <Text className="sw-metric-title" truncate="end">
            {title}
          </Text>
          {isLoading ? (
            <ShimmerSkeleton height={24} width={80} />
          ) : (
            (valueNode ?? (
              <Text className="sw-metric-value" truncate="end">
                {typeof value === 'number' ? formatValue(value) : value}
              </Text>
            ))
          )}
          {subtitle ? <Text className="sw-metric-subtitle">{subtitle}</Text> : null}
        </Stack>
      </Group>
    </Card>
  );
}

export interface MetricCardWithTrendProps extends MetricCardBase, ElementProps<'div', 'title'> {
  value: number | string;
  /**
   * The change. A number is a percentage (positive teal with an up arrow, negative red with a down arrow, zero
   * neutral); a string is shown as given and read as a drop when it starts with a minus sign.
   */
  difference: number | string;
  /** The period the change refers to, in dimmed text after it. */
  period?: string;
}

function trendOf(difference: number | string): {
  color: string;
  Glyph: typeof PiTrendUp;
  text: string;
} {
  const up = 'var(--mantine-color-teal-6)';
  const down = 'var(--mantine-color-red-6)';
  if (typeof difference === 'number') {
    if (difference > 0) {
      return { color: up, Glyph: PiTrendUp, text: `+${String(Math.round(difference))}%` };
    }
    if (difference < 0) {
      return { color: down, Glyph: PiTrendDown, text: `${String(Math.round(difference))}%` };
    }
    return { color: 'var(--mantine-color-dimmed)', Glyph: PiTrendUp, text: '0%' };
  }
  return difference.startsWith('-')
    ? { color: down, Glyph: PiTrendDown, text: difference }
    : { color: up, Glyph: PiTrendUp, text: difference };
}

/** A metric card with a trend line under the value: an arrow, the change and the period. */
export function MetricCardWithTrend({
  icon,
  iconColor,
  iconSize,
  iconVariant,
  themeIconProps,
  isLoading = false,
  title,
  value,
  difference,
  period,
  ...rest
}: MetricCardWithTrendProps) {
  const { color, Glyph, text } = trendOf(difference);

  return (
    <Card {...rest}>
      <Group gap="md" wrap="nowrap">
        <MetricIcon
          icon={icon}
          {...(iconColor === undefined ? {} : { iconColor })}
          {...(iconSize === undefined ? {} : { iconSize })}
          {...(iconVariant === undefined ? {} : { iconVariant })}
          {...(themeIconProps === undefined ? {} : { themeIconProps })}
        />

        <Stack gap={0} miw={0}>
          <Text className="sw-metric-title" truncate="end">
            {title}
          </Text>
          {isLoading ? (
            <ShimmerSkeleton height={24} width={80} />
          ) : (
            <Text className="sw-metric-value" truncate="end">
              {value}
            </Text>
          )}
          <Box className="sw-metric-trend" component="div">
            <Glyph aria-hidden color={color} size={px('0.85rem')} />
            <Text className="sw-metric-trend-value" component="span" style={{ color }}>
              {text}
            </Text>
            {period ? <Text className="sw-metric-trend-text">{period}</Text> : null}
          </Box>
        </Stack>
      </Group>
    </Card>
  );
}
