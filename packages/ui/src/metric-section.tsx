// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/pages/dashboard/home/components/home.page.tsx
// and home.module.css (the section blocks of the Home page: a heading, a grid of metric cards, and the entrance of
// both). Changes: the block is one component instead of repeated markup; the heading may carry icon actions (the
// panel's "Runtime" heading has a camera and an info button next to it); the CSS module became `sw-home-*` rules.
import { ActionIcon, Box, Group, SimpleGrid, type SimpleGridProps, Title } from '@mantine/core';
import { Children, isValidElement, type ReactNode } from 'react';

/** The breakpoints the panel's Home uses for a strip of four metric cards. */
export const METRIC_COLUMNS: NonNullable<SimpleGridProps['cols']> = { base: 1, sm: 2, xl: 4 };

/** An icon button next to a section heading, as the panel's Home has them: transparent, gray, 24 px glyph. */
export function MetricSectionAction({
  label,
  children,
  href,
  loading,
  onClick,
}: {
  /** The accessible name (the panel's buttons have none; the console's have). */
  label: string;
  /** The glyph, 24 px. */
  children: ReactNode;
  /** Makes the button a link that opens in a new tab. */
  href?: string;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <ActionIcon
      aria-label={label}
      color="gray"
      radius="md"
      size="sm"
      variant="transparent"
      {...(href === undefined
        ? {}
        : { component: 'a', href, rel: 'noopener noreferrer', target: '_blank' })}
      {...(loading === undefined ? {} : { loading })}
      {...(onClick === undefined ? {} : { onClick })}
    >
      {children}
    </ActionIcon>
  );
}

/**
 * One block of the Home page of the panel: a level 4 heading with a margin of `xs`, then a grid of cards with a gap
 * of `xs`. The block rises in, its heading slides in and its cards fade in one after another.
 */
export function MetricSection({
  title,
  actions,
  cols = METRIC_COLUMNS,
  children,
}: {
  title: ReactNode;
  /** `MetricSectionAction`s shown after the heading. */
  actions?: ReactNode;
  cols?: NonNullable<SimpleGridProps['cols']>;
  /** The cards. Each is wrapped for its entrance, in order. */
  children: ReactNode;
}) {
  return (
    <div className="sw-home-section">
      {actions ? (
        <Group align="center" gap="xs" m="xs" ml={0}>
          <Title className="sw-home-title" order={4}>
            {title}
          </Title>
          {actions}
        </Group>
      ) : (
        <Title className="sw-home-title" m="xs" ml={0} order={4}>
          {title}
        </Title>
      )}
      <SimpleGrid cols={cols} spacing="xs">
        {Children.toArray(children).map((child, index) => (
          <Box
            className="sw-home-card"
            key={isValidElement(child) && child.key !== null ? child.key : index}
            style={{ '--card-index': index }}
          >
            {child}
          </Box>
        ))}
      </SimpleGrid>
    </div>
  );
}
