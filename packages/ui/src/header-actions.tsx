// New in Swellwright, encoding a pattern of the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): the icon-only soft
// action buttons that every `features/ui/dashboard/*/header-action-buttons/*.feature.tsx` puts into the actions of a page
// header (for example hosts/header-action-buttons/header-action-buttons.feature.tsx). Changes: one component instead of
// repeated markup; every button has an accessible name equal to its tooltip.
import { ActionIcon, Group, type GroupProps, type MantineColor, Tooltip } from '@mantine/core';
import type { ElementType, MouseEvent, ReactNode } from 'react';

export interface HeaderActionsProps extends GroupProps {
  children: ReactNode;
}

/**
 * The cluster of icon-only actions for the `actions` slot of a `PageHeader` or a `DataTableCard.Title`. Order, left
 * to right: help, search, tools, refresh, create (create is always last).
 */
export function HeaderActions({ children, ...props }: HeaderActionsProps) {
  return (
    <Group grow preventGrowOverflow={false} wrap="wrap" {...props}>
      {children}
    </Group>
  );
}

export interface HeaderActionProps {
  /** The tooltip and the accessible name, already translated. */
  label: string;
  /** The icon component; it is drawn at 24 px. */
  icon: ElementType<{ size?: number }>;
  /**
   * The colour says what the action is: none (primary cyan) for refresh, teal for create, lime for help and
   * documentation, gray for search, view and filter tools, red for destructive, grape and indigo for special tools.
   */
  color?: MantineColor;
  loading?: boolean;
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Makes the action a link (documentation, for instance). */
  href?: string;
  /** For a link: '_blank' also sets `rel="noopener noreferrer"`. */
  target?: string;
}

/** One icon-only soft action: `ActionIcon size="input-md" variant="soft"` in a group, with a tooltip. */
export function HeaderAction({
  label,
  icon: Icon,
  color,
  loading,
  disabled,
  onClick,
  href,
  target,
}: HeaderActionProps) {
  const common = {
    'aria-label': label,
    size: 'input-md',
    variant: 'soft',
    ...(color === undefined ? {} : { color }),
    ...(loading === undefined ? {} : { loading }),
  } as const;

  return (
    <ActionIcon.Group>
      <Tooltip label={label} withArrow>
        {href === undefined ? (
          <ActionIcon
            {...common}
            {...(disabled === undefined ? {} : { disabled })}
            {...(onClick === undefined ? {} : { onClick })}
          >
            <Icon size={24} />
          </ActionIcon>
        ) : (
          <ActionIcon
            {...common}
            component="a"
            href={href}
            {...(disabled === true ? { 'data-disabled': true } : {})}
            {...(onClick === undefined ? {} : { onClick })}
            {...(target === undefined ? {} : { target })}
            {...(target === '_blank' ? { rel: 'noopener noreferrer' } : {})}
          >
            <Icon size={24} />
          </ActionIcon>
        )}
      </Tooltip>
    </ActionIcon.Group>
  );
}
