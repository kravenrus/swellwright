// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/features/dashboard/hosts/multi-select-hosts/
// multi-select-hosts.feature.tsx. The panel's bar for the rows that are selected in a table: an `Affix` at the bottom right
// that slides up when something is selected, a 300 px bordered paper with the count in a soft gray badge, "select all" and
// "clear" at the right, and the actions as soft buttons (cyan, indigo, red). Changes: the one action is to run a script or a
// command on the selected servers; the texts come from the console's catalogue.
import {
  ActionIcon,
  Affix,
  Badge,
  Button,
  CloseButton,
  Group,
  Paper,
  Stack,
  Tooltip,
  Transition,
} from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TbSelectAll } from 'react-icons/tb';

import type { ServerSummary } from '@swellwright/contracts';

export function ServersBulkBar({
  servers,
  visibleIds,
  selected,
  onSelect,
  onRun,
}: {
  /** Every server of the inventory: a selected server that is gone is dropped from the selection. */
  servers: readonly ServerSummary[];
  /** The ids that "select all" takes: what the table shows after its filters. */
  visibleIds: readonly string[];
  selected: readonly string[];
  onSelect: (ids: string[]) => void;
  onRun: () => void;
}) {
  const { t } = useTranslation('commands');

  useEffect(() => {
    const alive = new Set(servers.map((server) => server.id));
    const kept = selected.filter((id) => alive.has(id));
    if (kept.length !== selected.length) {
      onSelect(kept);
    }
    // Only a change of the inventory prunes the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

  return (
    <Affix position={{ bottom: 20, right: 20 }} zIndex={100}>
      <Transition mounted={selected.length > 0} transition="slide-up">
        {(styles) => (
          <Paper
            p={4}
            shadow="md"
            style={{ ...styles, width: '300px', maxWidth: '1200px', margin: '0 auto' }}
            withBorder
          >
            <Paper
              p="md"
              style={{
                borderRadius: 'calc(var(--mantine-radius-default) - 4px)',
                border: '1px solid var(--mantine-color-dark-5)',
              }}
            >
              <Stack>
                <Group justify="space-between">
                  <Badge color="shaded-gray" size="lg" variant="soft">
                    {t('bar.selected', { count: selected.length })}
                  </Badge>
                  <Group gap={0} justify="flex-end">
                    <Tooltip label={t('bar.selectAll')} withArrow>
                      <ActionIcon
                        aria-label={t('bar.selectAll')}
                        color="gray"
                        onClick={() => {
                          onSelect([...visibleIds]);
                        }}
                        size="lg"
                        variant="subtle"
                      >
                        <TbSelectAll size={20} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t('bar.clear')} withArrow>
                      <CloseButton
                        aria-label={t('bar.clear')}
                        onClick={() => {
                          onSelect([]);
                        }}
                      />
                    </Tooltip>
                  </Group>
                </Group>
                <Button
                  color="cyan"
                  fullWidth
                  leftSection={<IconPlayerPlay size={18} />}
                  onClick={onRun}
                  variant="soft"
                >
                  {t('bar.run')}
                </Button>
              </Stack>
            </Paper>
          </Paper>
        )}
      </Transition>
    </Affix>
  );
}
