import { Badge, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import type { CommandRunState, CommandTargetState, DangerLevel } from '@swellwright/contracts';
import type { StatusKind } from '@swellwright/ui';

/** The colour of each level of danger: nothing changes, something can be put back, something cannot. */
export const DANGER_COLOR = {
  read: 'teal',
  change: 'orange',
  destructive: 'red',
} as const satisfies Record<DangerLevel, string>;

/** The chip of a level; its hint says what the level means. */
export function DangerBadge({ level }: { level: DangerLevel }) {
  const { t } = useTranslation('commands');
  return (
    <Tooltip label={t(`dangerHint.${level}`)} multiline w={260}>
      <Badge color={DANGER_COLOR[level]} maw="none" size="lg" variant="soft">
        {t(`danger.${level}`)}
      </Badge>
    </Tooltip>
  );
}

export const RUN_STATE_KIND = {
  pending: 'wait',
  running: 'run',
  succeeded: 'ok',
  failed: 'err',
  cancelled: 'wait',
  partial: 'warn',
} as const satisfies Record<CommandRunState, StatusKind>;

export const TARGET_STATE_KIND = {
  pending: 'wait',
  running: 'run',
  succeeded: 'ok',
  failed: 'err',
  lost: 'warn',
  cancelled: 'wait',
  skipped: 'info',
} as const satisfies Record<CommandTargetState, StatusKind>;

/** A run is going while it is queued or running; its page keeps asking. */
export const isGoing = (state: CommandRunState): boolean =>
  state === 'pending' || state === 'running';
