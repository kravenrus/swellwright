// The look of a server's state in the table and the drawer. The status icon column follows the panel's Hosts table
// (src/widgets/dashboard/hosts/hosts-datatable/use-hosts-table-widget.tsx, `buildStatusColumn`: a soft `ActionIcon`
// of size lg per state, the same icons as in its filter), the badge is the console's `StatusBadge`.
import { ActionIcon, type MantineColor } from '@mantine/core';
import type { ElementType } from 'react';
import {
  PiCloudArrowUpDuotone,
  PiHourglassMediumDuotone,
  PiNotePencilDuotone,
  PiProhibitDuotone,
  PiPulseDuotone,
} from 'react-icons/pi';

import type { ServerState } from '@swellwright/contracts';
import type { StatusKind } from '@swellwright/ui';

export const STATE_COLOR: Record<ServerState, MantineColor> = {
  draft: 'gray',
  provisioning: 'cyan',
  active: 'teal',
  draining: 'orange',
  retired: 'gray',
};

export const STATE_ICON: Record<ServerState, ElementType<{ size?: number }>> = {
  draft: PiNotePencilDuotone,
  provisioning: PiCloudArrowUpDuotone,
  active: PiPulseDuotone,
  draining: PiHourglassMediumDuotone,
  retired: PiProhibitDuotone,
};

export const STATE_KIND: Record<ServerState, StatusKind> = {
  draft: 'wait',
  provisioning: 'run',
  active: 'ok',
  draining: 'warn',
  retired: 'wait',
};

/** The soft square icon of a state, as the panel's Hosts table draws its status column. */
export function StateIcon({ state }: { state: ServerState }) {
  const Icon = STATE_ICON[state];
  return (
    <ActionIcon
      aria-hidden
      color={STATE_COLOR[state]}
      component="div"
      size="lg"
      style={{ flexShrink: 0 }}
      variant="soft"
    >
      <Icon size={16} />
    </ActionIcon>
  );
}
