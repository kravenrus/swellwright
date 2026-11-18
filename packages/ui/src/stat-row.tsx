// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/widgets/dashboard/http-stats/http-stats-table/
// {http-stat-row.tsx,http-stats-table.module.css}. Changes: the method badge and the request counter are slots
// (`leading`, `trailing`) so any kind of row can use it; the proportional fill is optional; the CSS module became
// `sw-stat-row*` classes; the rolling number is not used.
import { Group, type MantineColor, Text } from '@mantine/core';
import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from './internal.js';

export interface StatRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
  /** The main text of the row, set in the monospace font and cut with an ellipsis when it is too long. */
  label: string;
  /** A chip or an icon in front of the label (the panel puts the HTTP method here). */
  leading?: ReactNode;
  /** What stands at the right edge: a status chip, a figure. */
  trailing?: ReactNode;
  /**
   * Draws a tinted bar behind the row, from the left, as wide as `percent` (at least 1.5 %), in the colour. The panel
   * uses it to show a route's share of all requests.
   */
  fill?: { percent: number; color: MantineColor };
}

/**
 * A row of a list of figures, as the panel's HTTP statistics show them: a bordered, faintly tinted bar with a
 * monospace label on the left and figures on the right. It lifts a little on hover.
 */
export function StatRow({ label, leading, trailing, fill, className, ...rest }: StatRowProps) {
  return (
    <div className={cx('sw-stat-row', className)} {...rest}>
      {fill ? (
        <div
          aria-hidden
          className="sw-stat-row-fill"
          style={{
            background: `var(--mantine-color-${fill.color}-6)`,
            width: `${String(Math.max(fill.percent, 1.5))}%`,
          }}
        />
      ) : null}

      <Group className="sw-stat-row-content" gap="sm" justify="space-between" wrap="nowrap">
        <Group gap="sm" miw={0} wrap="nowrap">
          {leading}
          <Text className="sw-stat-row-label" title={label} truncate="end">
            {label}
          </Text>
        </Group>

        {trailing ? (
          <Group align="center" gap="xs" wrap="nowrap">
            {trailing}
          </Group>
        ) : null}
      </Group>
    </div>
  );
}
