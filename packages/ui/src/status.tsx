// Chips follow the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/widgets/dashboard/users/user-status-badge/
// user-status-badge.widget.tsx (`Badge size="lg" variant="soft"` with an 18 px icon and the status colour) and the
// node status badge. Changes: one vocabulary of kinds for every status; warnings are orange as in the panel's
// "limited" chip, yellow is kept for the callout.
import { Badge, type BadgeProps, Group, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircle,
  IconCircleCheck,
  IconCircleX,
  IconInfoCircle,
  IconPlayerPlay,
  IconRestore,
  type TablerIcon,
} from '@tabler/icons-react';

/** Status vocabulary of the UI. Every status is an icon plus a word, never a color alone. */
export type StatusKind = 'ok' | 'err' | 'warn' | 'run' | 'wait' | 'rollback' | 'info';

const STATUS: Record<StatusKind, { icon: TablerIcon; color: string }> = {
  ok: { icon: IconCircleCheck, color: 'teal' },
  err: { icon: IconCircleX, color: 'red' },
  warn: { icon: IconAlertTriangle, color: 'orange' },
  run: { icon: IconPlayerPlay, color: 'cyan' },
  wait: { icon: IconCircle, color: 'gray' },
  rollback: { icon: IconRestore, color: 'violet' },
  info: { icon: IconInfoCircle, color: 'blue' },
};

export function StatusIcon({ kind, size = 16 }: { kind: StatusKind; size?: number }) {
  const { icon: Icon, color } = STATUS[kind];
  return <Icon aria-hidden color={`var(--mantine-color-${color}-4)`} size={size} stroke={2} />;
}

export interface StatusBadgeProps extends Omit<BadgeProps, 'color' | 'leftSection'> {
  kind: StatusKind;
  /** Size of the icon in pixels; the panel uses 18 in its large chips. */
  iconSize?: number;
}

/** A status chip: `Badge size="lg" variant="soft"` with an 18 px icon. Size and variant can be overridden. */
export function StatusBadge({ kind, iconSize = 18, children, ...props }: StatusBadgeProps) {
  const { icon: Icon, color } = STATUS[kind];
  return (
    <Badge
      color={color}
      leftSection={<Icon aria-hidden size={iconSize} />}
      size="lg"
      variant="soft"
      {...props}
    >
      {children}
    </Badge>
  );
}

export interface StatusTextProps {
  kind: StatusKind;
  children: string;
  /** Render an icon and a plain word instead of a chip, for dense lists. */
  plain?: boolean;
  /** Overrides for the chip; ignored with `plain`. */
  badgeProps?: Omit<StatusBadgeProps, 'kind' | 'children'>;
}

/** The state of a row in a table cell: a `StatusBadge` chip, or with `plain` an icon and a word on one line. */
export function StatusText({ kind, children, plain = false, badgeProps }: StatusTextProps) {
  if (!plain) {
    return (
      <StatusBadge kind={kind} {...badgeProps}>
        {children}
      </StatusBadge>
    );
  }
  return (
    <Group gap={8} wrap="nowrap">
      <StatusIcon kind={kind} />
      <Text fz="sm">{children}</Text>
    </Group>
  );
}
