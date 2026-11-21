// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/widgets/dashboard/hosts/hosts-datatable/
// {hosts-datatable.widget.tsx,use-hosts-table-widget.tsx} and src/widgets/dashboard/nodes/nodes-datatable/
// {nodes-datatable.widget.tsx,use-nodes-table-widget.tsx}, the two page-level lists of the panel. Changes: the columns are
// those of a server; the filters are the hosts table's (text, select, yes/no) with the status filter of both; the
// empty state asks to add a server; a click on a row opens it; rows can be selected (`selectedRecords`, a checkbox in
// the head, as the hosts table does) when the person may run commands: the selection feeds the bar of
// `servers-bulk-bar.tsx`; the texts come from the console's catalogue.
import { ActionIcon, Badge, Box, Button, Group, MultiSelect, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PiEmpty,
  PiKeyDuotone,
  PiShieldCheckDuotone,
  PiShieldWarningDuotone,
} from 'react-icons/pi';
import { TbEdit, TbSearch } from 'react-icons/tb';

import { SERVER_STATES, type ServerState, type ServerSummary } from '@swellwright/contracts';
import {
  type BooleanFilterValue,
  BooleanFilterControl,
  CountryFlag,
  DataTable,
  type DataTableColumn,
  type DataTableSortStatus,
  DataTableControls,
  EllipsisCell,
  panelDataTableProps,
  SelectFilter,
  sortRecords,
  StatusBadge,
  TextSearchFilter,
  useDataTableColumns,
  usePreventTableBackScroll,
} from '@swellwright/ui';

import { useDateTime } from '../format.js';
import { useCountries } from './countries.js';
import { StateIcon, STATE_ICON, STATE_COLOR, STATE_KIND } from './server-state.js';

/** Bump the number when the columns change: a width or an order kept for other columns would not fit. */
const SERVERS_CACHE_KEY = 'servers-datatable-v1';
const DEFAULT_SORT_STATUS: DataTableSortStatus<ServerSummary> = {
  columnAccessor: 'name',
  direction: 'asc',
};
const DASH = '–';

type TextFilterKey = 'name' | 'address' | 'port' | 'os' | 'kernel';
type SelectFilterKey = 'provider' | 'tags';

interface Filters {
  text: Record<string, string>;
  select: Record<string, string[]>;
  states: ServerState[];
  pinned: BooleanFilterValue;
  setText: (key: TextFilterKey, value: string) => void;
  setSelect: (key: SelectFilterKey, value: string[]) => void;
  setStates: (value: ServerState[]) => void;
  setPinned: (value: BooleanFilterValue) => void;
}

const textOf = (server: ServerSummary, key: TextFilterKey): string => {
  switch (key) {
    case 'name':
      return server.name;
    case 'address':
      return server.address;
    case 'port':
      return String(server.sshPort);
    case 'os':
      return server.facts?.os ?? '';
    case 'kernel':
      return server.facts?.kernel ?? '';
  }
};

const TEXT_KEYS: readonly TextFilterKey[] = ['name', 'address', 'port', 'os', 'kernel'];

export interface ServersTableProps {
  servers: ServerSummary[];
  /** The ids of the selected rows. Without `onSelectedChange` the table has no checkboxes. */
  selectedIds?: readonly string[];
  onSelectedChange?: ((ids: string[]) => void) | undefined;
  /** Told which servers the table shows after its filters (what "select all" of the bar takes). */
  onVisibleChange?: ((ids: string[]) => void) | undefined;
  onOpen: (id: string) => void;
  /** The empty state offers to add a server when this is given. */
  onCreate?: (() => void) | undefined;
}

export const ServersTable = memo(function ServersTable({
  servers,
  selectedIds = [],
  onSelectedChange,
  onVisibleChange,
  onOpen,
  onCreate,
}: ServersTableProps) {
  const { t } = useTranslation(['servers', 'common']);
  const formatTime = useDateTime();
  const { nameOf } = useCountries();
  usePreventTableBackScroll();

  const [sortStatus, setSortStatus] =
    useState<DataTableSortStatus<ServerSummary>>(DEFAULT_SORT_STATUS);
  const [textQueries, setTextQueries] = useState<Record<string, string>>({});
  const [debouncedText] = useDebouncedValue(textQueries, 200);
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>({});
  const [states, setStates] = useState<ServerState[]>([]);
  const [pinned, setPinned] = useState<BooleanFilterValue>('all');

  const filters: Filters = {
    text: textQueries,
    select: selectFilters,
    states,
    pinned,
    setText: (key, value) => {
      setTextQueries((previous) => ({ ...previous, [key]: value }));
    },
    setSelect: (key, value) => {
      setSelectFilters((previous) => ({ ...previous, [key]: value }));
    },
    setStates,
    setPinned,
  };

  const options = useMemo(() => {
    const providers = new Set<string>();
    const tags = new Set<string>();
    for (const server of servers) {
      if (server.provider !== null) {
        providers.add(server.provider);
      }
      server.tags.forEach((tag) => tags.add(tag));
    }
    const asOptions = (values: Set<string>) =>
      [...values].sort().map((value) => ({ label: value, value }));
    return { provider: asOptions(providers), tags: asOptions(tags) };
  }, [servers]);

  const columns = getColumns({
    t,
    filters,
    options,
    formatTime,
    nameOf,
    onOpen,
  }).map((column) => ({ draggable: true, resizable: true, toggleable: true, ...column }));

  const {
    effectiveColumns,
    resetColumnsWidth,
    resetColumnsOrder,
    resetColumnsToggle,
    columnsToggle,
    setColumnsToggle,
  } = useDataTableColumns({ key: SERVERS_CACHE_KEY, columns });

  const labelByAccessor = Object.fromEntries(
    columns
      .filter((column) => typeof column.title === 'string' && column.title !== '')
      .map((column) => [column.accessor, column.title as string]),
  );
  // The icon column has no title; the popover still has to name it.
  labelByAccessor['state'] = t('columns.status');

  const visible = useMemo(() => {
    const filtered = servers.filter((server) => {
      for (const key of TEXT_KEYS) {
        const query = debouncedText[key];
        if (query && !textOf(server, key).toLowerCase().includes(query.toLowerCase())) {
          return false;
        }
      }
      const providers = selectFilters['provider'] ?? [];
      if (
        providers.length > 0 &&
        (server.provider === null || !providers.includes(server.provider))
      ) {
        return false;
      }
      const tags = selectFilters['tags'] ?? [];
      if (tags.length > 0 && !tags.some((tag) => server.tags.includes(tag))) {
        return false;
      }
      if (states.length > 0 && !states.includes(server.state)) {
        return false;
      }
      if (pinned !== 'all' && server.pinned !== (pinned === 'yes')) {
        return false;
      }
      return true;
    });
    return sortRecords(filtered, sortStatus);
  }, [servers, debouncedText, selectFilters, states, pinned, sortStatus]);

  useEffect(() => {
    onVisibleChange?.(visible.map((server) => server.id));
  }, [visible, onVisibleChange]);

  const selectedRecords = useMemo(() => {
    const chosen = new Set(selectedIds);
    return servers.filter((server) => chosen.has(server.id));
  }, [servers, selectedIds]);

  return (
    <>
      <DataTable
        {...panelDataTableProps}
        columns={effectiveColumns}
        emptyState={
          <Stack align="center" gap="xs">
            <Box mb={4} p={4}>
              <PiEmpty aria-hidden size={36} strokeWidth={1.5} />
            </Box>
            <Text c="dimmed" size="sm">
              {t('table.empty')}
            </Text>
            {onCreate ? (
              <Button onClick={onCreate} style={{ pointerEvents: 'all' }} variant="light">
                {t('table.add')}
              </Button>
            ) : null}
          </Stack>
        }
        height="65vh"
        idAccessor="id"
        onRowClick={({ record }) => {
          onOpen(record.id);
        }}
        onSortStatusChange={setSortStatus}
        records={visible}
        {...(onSelectedChange === undefined
          ? {}
          : {
              selectedRecords,
              onSelectedRecordsChange: (records: ServerSummary[]) => {
                onSelectedChange(records.map((record) => record.id));
              },
            })}
        sortStatus={sortStatus}
        storeColumnsKey={SERVERS_CACHE_KEY}
      />
      <DataTableControls
        columnsToggle={columnsToggle}
        labelByAccessor={labelByAccessor}
        labels={{
          reset: t('common:datatable.reset'),
          resetSort: t('common:datatable.resetSort'),
          columnWidth: t('common:datatable.columnWidth'),
          columnOrder: t('common:datatable.columnOrder'),
          columnToggle: t('common:datatable.columnToggle'),
          showAll: t('common:datatable.showAll'),
          hideAll: t('common:datatable.hideAll'),
          columns: t('common:datatable.columns'),
        }}
        onResetColumnsOrder={resetColumnsOrder}
        onResetColumnsToggle={resetColumnsToggle}
        onResetColumnsWidth={resetColumnsWidth}
        onResetSort={() => {
          setSortStatus(DEFAULT_SORT_STATUS);
        }}
        setColumnsToggle={setColumnsToggle}
        sortResetDisabled={
          sortStatus.columnAccessor === DEFAULT_SORT_STATUS.columnAccessor &&
          sortStatus.direction === DEFAULT_SORT_STATUS.direction
        }
      />
    </>
  );
});

interface ColumnContext {
  t: ReturnType<typeof useTranslation<['servers', 'common']>>['t'];
  filters: Filters;
  options: Record<SelectFilterKey, { label: string; value: string }[]>;
  formatTime: (value: string | number | Date) => string;
  nameOf: (code: string | null | undefined) => string;
  onOpen: (id: string) => void;
}

function getColumns({
  t,
  filters,
  options,
  formatTime,
  nameOf,
  onOpen,
}: ColumnContext): DataTableColumn<ServerSummary>[] {
  const textFilter = (key: TextFilterKey, label: string) => ({
    filter: (
      <TextSearchFilter
        clearLabel={t('common:clear')}
        label={label}
        onChange={(value) => {
          filters.setText(key, value);
        }}
        value={filters.text[key] ?? ''}
      />
    ),
    filtering: (filters.text[key] ?? '') !== '',
  });
  const selectFilter = (key: SelectFilterKey, label: string) => ({
    filter: (
      <SelectFilter
        data={options[key]}
        label={label}
        onChange={(value) => {
          filters.setSelect(key, value);
        }}
        value={filters.select[key] ?? []}
      />
    ),
    filtering: (filters.select[key] ?? []).length > 0,
  });

  return [
    {
      accessor: 'name',
      title: t('columns.name'),
      sortable: true,
      draggable: false,
      resizable: true,
      toggleable: false,
      ...textFilter('name', t('columns.name')),
      render: ({ name, country }) => (
        <Group gap={6} wrap="nowrap">
          <CountryFlag code={country} label={nameOf(country)} />
          <Text
            size="sm"
            style={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </Text>
        </Group>
      ),
    },
    {
      accessor: 'state',
      title: '',
      sortable: true,
      filter: (
        <MultiSelect<ServerState>
          clearable
          comboboxProps={{ withinPortal: false }}
          data={SERVER_STATES.map((value) => ({ label: t(`states.${value}`), value }))}
          label={t('columns.state')}
          leftSection={<TbSearch size={16} />}
          onChange={filters.setStates}
          renderOption={({ option }) => {
            const state = option.value;
            const Icon = STATE_ICON[state];
            return (
              <Group gap="xs" wrap="nowrap">
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
                <Text size="sm">{option.label}</Text>
              </Group>
            );
          }}
          searchable
          value={filters.states}
        />
      ),
      filtering: filters.states.length > 0,
      render: ({ state }) => <StateIcon state={state} />,
    },
    {
      accessor: 'stateBadge',
      title: t('columns.state'),
      sortable: false,
      // A badge is cut by the cell's ellipsis; give the column room for the longest state name.
      width: 180,
      render: ({ state }) => (
        <StatusBadge kind={STATE_KIND[state]}>{t(`states.${state}`)}</StatusBadge>
      ),
    },
    {
      accessor: 'address',
      title: t('columns.address'),
      sortable: true,
      ...textFilter('address', t('columns.address')),
      render: ({ address }) => <EllipsisCell>{address}</EllipsisCell>,
    },
    {
      accessor: 'sshPort',
      title: t('columns.port'),
      sortable: true,
      ...textFilter('port', t('columns.port')),
      render: ({ sshPort }) => <EllipsisCell>{sshPort}</EllipsisCell>,
    },
    {
      accessor: 'provider',
      title: t('columns.provider'),
      sortable: true,
      ...selectFilter('provider', t('columns.provider')),
      render: ({ provider }) => <EllipsisCell>{provider ?? DASH}</EllipsisCell>,
    },
    {
      accessor: 'facts.os',
      title: t('columns.os'),
      sortable: true,
      ...textFilter('os', t('columns.os')),
      render: ({ facts }) => <EllipsisCell>{facts?.os ?? DASH}</EllipsisCell>,
    },
    {
      accessor: 'facts.kernel',
      title: t('columns.kernel'),
      sortable: true,
      ...textFilter('kernel', t('columns.kernel')),
      render: ({ facts }) => <EllipsisCell>{facts?.kernel ?? DASH}</EllipsisCell>,
    },
    {
      accessor: 'pinned',
      title: t('columns.hostKey'),
      sortable: true,
      textAlign: 'center',
      filter: (
        <BooleanFilterControl
          allLabel={t('common:datatable.all')}
          label={t('columns.hostKey')}
          noLabel={t('common:no')}
          onChange={filters.setPinned}
          value={filters.pinned}
          yesLabel={t('common:yes')}
        />
      ),
      filtering: filters.pinned !== 'all',
      render: ({ pinned }) =>
        pinned ? (
          <Badge
            color="teal"
            leftSection={<PiShieldCheckDuotone size={14} />}
            size="lg"
            variant="soft"
          >
            {t('hostKey.pinned')}
          </Badge>
        ) : (
          <Badge
            color="orange"
            leftSection={<PiShieldWarningDuotone size={14} />}
            size="lg"
            variant="soft"
          >
            {t('hostKey.notPinned')}
          </Badge>
        ),
    },
    {
      accessor: 'accessCount',
      title: t('columns.access'),
      sortable: true,
      render: ({ accessCount }) => (
        <Badge
          color={accessCount > 0 ? 'teal' : 'gray'}
          leftSection={<PiKeyDuotone size={14} />}
          miw="10ch"
          size="lg"
          variant="outline"
        >
          {accessCount}
        </Badge>
      ),
    },
    {
      accessor: 'tags',
      title: t('columns.tags'),
      sortable: true,
      ...selectFilter('tags', t('columns.tags')),
      render: ({ tags }) => <EllipsisCell>{tags.length > 0 ? tags.join(', ') : DASH}</EllipsisCell>,
    },
    {
      accessor: 'notes',
      title: t('columns.notes'),
      defaultToggle: false,
      sortable: false,
      render: ({ notes }) => <EllipsisCell>{notes ?? DASH}</EllipsisCell>,
    },
    {
      accessor: 'createdAt',
      title: t('columns.created'),
      defaultToggle: false,
      sortable: true,
      render: ({ createdAt }) => <EllipsisCell>{formatTime(createdAt)}</EllipsisCell>,
    },
    {
      accessor: 'updatedAt',
      title: t('columns.updated'),
      defaultToggle: false,
      sortable: true,
      render: ({ updatedAt }) => <EllipsisCell>{formatTime(updatedAt)}</EllipsisCell>,
    },
    {
      accessor: 'actions',
      draggable: false,
      resizable: false,
      toggleable: false,
      titleStyle: { backgroundColor: 'var(--mantine-color-dark-7)' },
      cellsStyle: () => ({ backgroundColor: 'var(--mantine-color-dark-7)' }),
      title: (
        <Group c="dimmed" gap={4} justify="flex-end" pr={4} wrap="nowrap">
          <TbEdit aria-label={t('table.edit')} size={18} />
        </Group>
      ),
      textAlign: 'right',
      render: ({ id, name }) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <ActionIcon
            aria-label={t('table.editNamed', { name })}
            color="teal"
            onClick={(event) => {
              // The row opens the same drawer; do not open it twice.
              event.stopPropagation();
              onOpen(id);
            }}
            size="md"
            variant="outline"
          >
            <TbEdit size={18} />
          </ActionIcon>
        </Group>
      ),
    },
  ];
}
