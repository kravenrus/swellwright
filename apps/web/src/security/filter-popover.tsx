import { ActionIcon, Popover, Stack, Tooltip } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/**
 * The filter control of a titled list, as the panel puts filters into the header of its tables: an icon-only soft
 * button (cyan while a filter is set, gray otherwise) that opens a small popover with the fields.
 */
export function FilterPopover({
  label,
  active,
  children,
}: {
  /** The tooltip and the accessible name of the button, already translated. */
  label: string;
  active: boolean;
  /** The fields. A `Select` in here needs `comboboxProps={{ withinPortal: false }}`. */
  children: ReactNode;
}) {
  return (
    <ActionIcon.Group>
      <Popover position="bottom-end" shadow="md" trapFocus width={280} withArrow>
        <Tooltip label={label} withArrow>
          <Popover.Target>
            <ActionIcon
              aria-label={label}
              color={active ? 'cyan' : 'gray'}
              size="input-md"
              variant="soft"
            >
              <IconFilter size={24} />
            </ActionIcon>
          </Popover.Target>
        </Tooltip>
        <Popover.Dropdown>
          <Stack gap="sm">{children}</Stack>
        </Popover.Dropdown>
      </Popover>
    </ActionIcon.Group>
  );
}
