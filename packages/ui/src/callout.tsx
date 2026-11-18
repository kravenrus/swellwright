// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): the `.oneTimeNotice` rules of
// src/widgets/remnawave-settings/api-tokens-card/api-token-card.module.css and their use in
// .../modals/create-api-token-modal.widget.tsx. Changes: generalised by colour (the panel's notice is amber), with an
// icon, an optional title and children; the emphasis span is exported as `CalloutEmphasis`.
import { Box, type BoxProps, type ElementProps } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';
import { TbAlertTriangle } from 'react-icons/tb';

import { cx } from './internal.js';

export interface CalloutProps
  extends BoxProps, ElementProps<'div', 'title' | 'color' | keyof BoxProps> {
  /**
   * A theme colour name: 'yellow' (the default, the panel's amber warning), 'orange', 'red', 'teal', 'blue', 'cyan'...
   */
  color?: string;
  /** Defaults to a warning triangle of size 20. */
  icon?: ReactNode;
  /** A bold first line. */
  title?: ReactNode;
  children?: ReactNode;
}

/** The panel's amber is Tailwind amber-500, not Mantine's yellow-6, so the warning keeps its own tint. */
const AMBER = 'rgb(245, 159, 11)';

/**
 * A highlighted note, for things the reader must not miss ("shown once", "this cannot be undone"). The panel draws
 * these by hand rather than with `Alert`: a tinted gradient, a thin tinted border, an icon and one paragraph. Wrap
 * the key words in `CalloutEmphasis`.
 */
export function Callout({
  color = 'yellow',
  icon,
  title,
  children,
  className,
  style,
  ...rest
}: CalloutProps) {
  const tint = color === 'yellow' ? AMBER : `var(--mantine-color-${color}-6)`;
  const vars = {
    '--sw-callout-color': tint,
    '--sw-callout-icon': `var(--mantine-color-${color}-5)`,
    '--sw-callout-emphasis': `var(--mantine-color-${color}-4)`,
  } as CSSProperties;

  return (
    <Box className={cx('sw-callout', className)} role="note" style={[vars, style]} {...rest}>
      <span aria-hidden className="sw-callout-icon">
        {icon ?? <TbAlertTriangle size={20} />}
      </span>
      <div className="sw-callout-body">
        {title ? <div className="sw-callout-title">{title}</div> : null}
        {children ? <div className="sw-callout-text">{children}</div> : null}
      </div>
    </Box>
  );
}

/** Bold, tinted text inside a `Callout`; the panel's replacement for `<emphasis>` in its translated notices. */
export function CalloutEmphasis({ children }: { children: ReactNode }) {
  return <span className="sw-callout-emphasis">{children}</span>;
}
