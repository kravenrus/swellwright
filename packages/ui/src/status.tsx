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
  warn: { icon: IconAlertTriangle, color: 'yellow' },
  run: { icon: IconPlayerPlay, color: 'cyan' },
  wait: { icon: IconCircle, color: 'gray' },
  rollback: { icon: IconRestore, color: 'violet' },
  info: { icon: IconInfoCircle, color: 'blue' },
};

export function StatusIcon({ kind, size = 16 }: { kind: StatusKind; size?: number }) {
  const { icon: Icon, color } = STATUS[kind];
  return <Icon aria-hidden color={`var(--mantine-color-${color}-4)`} size={size} stroke={2} />;
}

export function StatusBadge({
  kind,
  children,
  ...props
}: { kind: StatusKind } & Omit<BadgeProps, 'color' | 'leftSection'>) {
  const { icon: Icon, color } = STATUS[kind];
  return (
    <Badge color={color} leftSection={<Icon aria-hidden size={13} />} {...props}>
      {children}
    </Badge>
  );
}

/** An icon and a label on one line, for table cells and lists. */
export function StatusText({ kind, children }: { kind: StatusKind; children: string }) {
  return (
    <Group gap={8} wrap="nowrap">
      <StatusIcon kind={kind} />
      <Text fz="sm">{children}</Text>
    </Group>
  );
}
