import {
  ActionIcon,
  Badge,
  Box,
  DataList,
  Group,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconDevices,
  IconFilterOff,
  IconLogout,
  IconRefresh,
  IconRestore,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Permission, SessionSummary } from '@swellwright/contracts';
import {
  CopyableDataListItem,
  DataTableCard,
  EmptyPageLayout,
  HeaderAction,
  HeaderActionGroup,
  HeaderActions,
  LoaderModal,
  MantineReactTable,
  type MRT_ColumnDef,
  OverlayHeader,
  PageHeader,
  panelTableOptions,
  SectionCard,
  useMantineReactTable,
  useMrtTableState,
} from '@swellwright/ui';

import {
  listMySessions,
  listSessions,
  revokeMySession,
  revokeOtherSessions,
  revokeSession,
  revokeUserSessions,
} from '../api.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { confirmAction, notifyError, notifySuccess } from '../shell/feedback.js';
import { useTableLocalization } from '../tables.js';
import { FilterPopover } from './filter-popover.js';
import { QueryErrorCard } from './query-error.js';
import { useTimeFirst } from './time-first.js';

/** A user the administrator is about to sign out everywhere. */
interface Target {
  readonly id: string;
  readonly username: string;
}

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg(?:e|A|iOS)?\//u, 'Edge'],
  [/OPR\/|Opera/u, 'Opera'],
  [/Firefox\/|FxiOS\//u, 'Firefox'],
  [/Chrome\/|CriOS\//u, 'Chrome'],
  [/Safari\//u, 'Safari'],
];

/** Order matters: an Android user agent also says Linux, and an iPhone one says Mac OS X. */
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/Windows/u, 'Windows'],
  [/Android/u, 'Android'],
  [/iPhone|iPad|iPod/u, 'iOS'],
  [/Mac OS X|Macintosh/u, 'macOS'],
  [/CrOS/u, 'ChromeOS'],
  [/Linux|X11/u, 'Linux'],
];

/** The browser and the system a user agent string names, for a title; null where it is not one we know. */
function recognise(userAgent: string | null): { browser: string; system: string | null } | null {
  if (!userAgent) {
    return null;
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser === undefined) {
    return null;
  }
  return { browser, system: SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null };
}

/** The "Current" and "Elevated" chips of a session. */
function SessionBadges({ session, nowrap = false }: { session: SessionSummary; nowrap?: boolean }) {
  const { t } = useTranslation('sessions');
  if (!session.current && !session.elevated) {
    return null;
  }
  return (
    <Group gap="xs" wrap={nowrap ? 'nowrap' : 'wrap'}>
      {session.current ? (
        <Badge color="cyan" size="lg" variant="soft">
          {t('badges.current')}
        </Badge>
      ) : null}
      {session.elevated ? (
        <Tooltip label={t('badges.elevatedHint')} withArrow>
          <Badge color="teal" size="lg" variant="soft">
            {t('badges.elevated')}
          </Badge>
        </Tooltip>
      ) : null}
    </Group>
  );
}

/**
 * One of your own sessions as a card, as the panel lists the passkeys of an account: a header with the browser, the
 * chips and, unless it is the session in use, a red soft sign-out button; under it the facts. The session in use has
 * no end action: ending it is signing out, and the server refuses it.
 */
function MySessionCard({
  session,
  onEnd,
  ending,
}: {
  session: SessionSummary;
  onEnd: () => void;
  ending: boolean;
}) {
  const { t } = useTranslation('sessions');
  const formatTime = useTimeFirst();
  const known = recognise(session.userAgent);
  const title = known
    ? known.system
      ? t('mine.browserOn', { browser: known.browser, system: known.system })
      : known.browser
    : t('mine.unknownBrowser');
  const when = formatTime(session.createdAt);

  return (
    <SectionCard.Root>
      <SectionCard.Section>
        <Group gap="xs" justify="space-between" wrap="wrap">
          <Box miw={0}>
            <OverlayHeader
              icon={IconDevices}
              iconColor={session.current ? 'teal' : 'cyan'}
              title={title}
              titleOrder={5}
              truncateTitle
            />
          </Box>
          <Group gap="xs" wrap="nowrap">
            <SessionBadges session={session} />
            {session.current ? null : (
              <Tooltip label={t('mine.signOut')} withArrow>
                <ActionIcon
                  aria-label={t('mine.signOutAria', { when })}
                  color="red"
                  loading={ending}
                  onClick={onEnd}
                  size="lg"
                  variant="soft"
                >
                  <IconLogout size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </SectionCard.Section>
      <SectionCard.Section>
        <DataList orientation="vertical" size="xs" withDivider>
          <CopyableDataListItem
            emptyValue="–"
            label={t('columns.started')}
            monospace
            value={when}
          />
          <CopyableDataListItem
            emptyValue="–"
            label={t('columns.lastActive')}
            monospace
            value={formatTime(session.lastSeenAt)}
          />
          <CopyableDataListItem
            emptyValue="–"
            label={t('columns.address')}
            monospace
            value={session.ip}
          />
          <CopyableDataListItem
            emptyValue="–"
            label={t('columns.browser')}
            monospace
            value={session.userAgent}
          />
        </DataList>
      </SectionCard.Section>
    </SectionCard.Root>
  );
}

/** Your own sessions: any signed-in user may list them and end the others. */
function MySessions() {
  const { t } = useTranslation(['sessions', 'common']);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['sessions', 'mine'], queryFn: listMySessions, retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const endOne = useMutation({
    mutationFn: revokeMySession,
    onSuccess: refresh,
    onError: (error) => {
      notifyError(
        t('mine.signOut'),
        describeError(t, error, t('signInAgain'), t('mine.endForbidden')),
      );
    },
  });
  const endOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: (result) => {
      notifySuccess(
        t('endOthers.submit'),
        result.revoked === 0 ? t('notice.noOthers') : t('notice.others', { count: result.revoked }),
      );
      return refresh();
    },
    onError: (error) => {
      notifyError(
        t('endOthers.submit'),
        describeError(t, error, t('signInAgain'), t('mine.endForbidden')),
      );
    },
  });

  const sessions = list.data?.sessions ?? [];
  const hasOthers = sessions.some((session) => !session.current);

  return (
    <DataTableCard.Container>
      <DataTableCard.Title
        actions={
          <HeaderActions>
            <HeaderAction
              color="red"
              disabled={!hasOthers}
              icon={IconLogout}
              label={t('mine.endOthers')}
              loading={endOthers.isPending}
              onClick={() => {
                confirmAction({
                  title: t('endOthers.title'),
                  message: t('endOthers.warning'),
                  confirmLabel: t('endOthers.submit'),
                  cancelLabel: t('common:cancel'),
                  onConfirm: () => {
                    endOthers.mutate();
                  },
                });
              }}
            />
          </HeaderActions>
        }
        description={t('mine.description')}
        icon={<IconDevices size={24} />}
        title={t('mine.title')}
      />
      <DataTableCard.Content>
        <Box p="md">
          {list.isPending ? (
            <LoaderModal label={t('common:loading')} mih="200px" />
          ) : list.isError ? (
            <QueryErrorCard
              message={describeError(t, list.error, t('signInAgain'))}
              onRetry={() => void list.refetch()}
              title={t('mine.title')}
            />
          ) : sessions.length === 0 ? (
            <EmptyPageLayout icon={<IconDevices size="3rem" />} title={t('mine.empty')} />
          ) : (
            <Stack gap="xs">
              {sessions.map((session) => (
                <MySessionCard
                  ending={endOne.isPending && endOne.variables === session.id}
                  key={session.id}
                  onEnd={() => {
                    endOne.mutate(session.id);
                  }}
                  session={session}
                />
              ))}
              <Text c="dimmed" mt="xs" size="xs">
                {t('mine.currentNote')}
              </Text>
            </Stack>
          )}
        </Box>
      </DataTableCard.Content>
    </DataTableCard.Container>
  );
}

/** The sessions of every user (`sessions:read`). Ending them needs `sessions:revoke` and a fresh code. */
function AllSessions({ currentUserId, canRevoke }: { currentUserId: string; canRevoke: boolean }) {
  const { t } = useTranslation(['sessions', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const formatTime = useTimeFirst();
  const [userId, setUserId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['sessions', 'all'],
    queryFn: () => listSessions({}),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const endOne = useMutation({
    mutationFn: (id: string) => step.run(() => revokeSession(id)),
    onSuccess: refresh,
    onError: (error) => {
      notifyError(t('all.end'), describeError(t, error, t('signInAgain'), t('all.endForbidden')));
    },
  });
  const endUser = useMutation({
    mutationFn: (target: Target) => step.run(() => revokeUserSessions(target.id)),
    onSuccess: (result, target) => {
      setUserId(null);
      notifySuccess(
        t('endUser.submit'),
        result.revoked === 0
          ? t('notice.noneForUser', { username: target.username })
          : t('notice.user', { count: result.revoked, username: target.username }),
      );
      return refresh();
    },
    onError: (error) => {
      notifyError(
        t('endUser.submit'),
        describeError(t, error, t('signInAgain'), t('all.endForbidden')),
      );
    },
  });

  const all = list.data?.sessions;
  // The users for the filter come from the sessions themselves: someone without a session has nothing to show.
  const users = useMemo(() => {
    const names = new Map<string, string>();
    for (const session of all ?? []) {
      names.set(session.userId, session.username);
    }
    return [...names]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);
  const selected = users.find((user) => user.value === userId);
  const selectedId = selected?.value;
  const shown = useMemo(
    () =>
      selectedId === undefined ? (all ?? []) : (all ?? []).filter((s) => s.userId === selectedId),
    [all, selectedId],
  );
  const canEndUser = canRevoke && selected !== undefined && selected.value !== currentUserId;

  const endOneMutate = endOne.mutate;
  const endingId = endOne.isPending ? endOne.variables : undefined;
  const columns = useMemo<MRT_ColumnDef<SessionSummary>[]>(
    () => [
      {
        accessorKey: 'username',
        header: t('columns.user'),
        size: 140,
        mantineTableBodyCellProps: { align: 'left' },
        Cell: ({ row }) => (
          <Text fw={500} size="sm" truncate="end">
            {row.original.username}
          </Text>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: t('columns.started'),
        size: 220,
        enableColumnFilter: false,
        mantineTableBodyCellProps: { align: 'center' },
        Cell: ({ row }) => (
          <Text ff="monospace" size="sm" title={row.original.createdAt}>
            {formatTime(row.original.createdAt)}
          </Text>
        ),
      },
      {
        accessorKey: 'lastSeenAt',
        header: t('columns.lastActive'),
        size: 220,
        enableColumnFilter: false,
        mantineTableBodyCellProps: { align: 'center' },
        Cell: ({ row }) => (
          <Text ff="monospace" size="sm" title={row.original.lastSeenAt}>
            {formatTime(row.original.lastSeenAt)}
          </Text>
        ),
      },
      {
        accessorKey: 'ip',
        header: t('columns.address'),
        size: 130,
        Cell: ({ row }) => (
          <Text ff="monospace" size="sm">
            {row.original.ip ?? '–'}
          </Text>
        ),
      },
      {
        accessorKey: 'userAgent',
        header: t('columns.browser'),
        size: 230,
        Cell: ({ row }) => (
          <Text size="sm" title={row.original.userAgent ?? ''} truncate="end">
            {row.original.userAgent ?? '–'}
          </Text>
        ),
      },
      {
        id: 'state',
        header: t('columns.state'),
        size: 200,
        enableColumnFilter: false,
        enableSorting: false,
        mantineTableBodyCellProps: { align: 'center' },
        Cell: ({ row }) => <SessionBadges nowrap session={row.original} />,
      },
    ],
    [t, formatTime],
  );

  const tableState = useMrtTableState('sessions-all-v1');
  const localization = useTableLocalization(selected ? t('all.emptyFiltered') : t('all.empty'));
  const table = useMantineReactTable<SessionSummary>({
    ...panelTableOptions<SessionSummary>(),
    columns,
    data: shown,
    localization,
    ...tableState.handlers,
    state: {
      ...tableState.state,
      isLoading: list.isPending,
      showAlertBanner: false,
      showProgressBars: list.isFetching,
    },
    getRowId: (session) => session.id,
    enableRowActions: canRevoke,
    positionActionsColumn: 'last',
    displayColumnDefOptions: { 'mrt-row-actions': { size: 72 } },
    renderRowActions: ({ row }) =>
      row.original.current ? null : (
        <Tooltip label={t('all.end')} withArrow>
          <ActionIcon
            aria-label={t('all.endAria', {
              username: row.original.username,
              when: formatTime(row.original.createdAt),
            })}
            color="red"
            loading={endingId === row.original.id}
            onClick={() => {
              endOneMutate(row.original.id);
            }}
            size="md"
            variant="outline"
          >
            <IconLogout size={18} />
          </ActionIcon>
        </Tooltip>
      ),
  });

  return (
    <DataTableCard.Container>
      <DataTableCard.Title
        actions={
          <HeaderActions>
            <HeaderActionGroup>
              <FilterPopover
                active={selected !== undefined}
                grouped
                label={t('all.userFilterLabel')}
              >
                <Select
                  aria-label={t('all.userFilterLabel')}
                  clearable
                  comboboxProps={{ withinPortal: false }}
                  data={users}
                  onChange={setUserId}
                  placeholder={t('all.userFilterPlaceholder')}
                  searchable
                  value={selected?.value ?? null}
                />
              </FilterPopover>
              <HeaderAction
                color="gray"
                disabled={selected === undefined}
                grouped
                icon={IconFilterOff}
                label={t('all.clearFilter')}
                onClick={() => {
                  setUserId(null);
                  table.resetColumnFilters(true);
                }}
              />
              <HeaderAction
                color="gray"
                grouped
                icon={IconRestore}
                label={t('common:resetTable')}
                onClick={() => {
                  setUserId(null);
                  tableState.reset();
                  table.resetColumnFilters(true);
                }}
              />
            </HeaderActionGroup>
            {canEndUser ? (
              <HeaderAction
                color="red"
                icon={IconLogout}
                label={t('all.endUser')}
                loading={endUser.isPending}
                onClick={() => {
                  confirmAction({
                    title: t('endUser.title', { username: selected.label }),
                    message: t('endUser.warning', { username: selected.label }),
                    confirmLabel: t('endUser.submit'),
                    cancelLabel: t('common:cancel'),
                    onConfirm: () => {
                      endUser.mutate({ id: selected.value, username: selected.label });
                    },
                  });
                }}
              />
            ) : null}
          </HeaderActions>
        }
        description={
          selected ? t('all.filteredBy', { username: selected.label }) : t('all.description')
        }
        icon={<IconUsersGroup size={24} />}
        title={t('all.title')}
      />
      <DataTableCard.Content>
        {list.isError ? (
          <Box p="md">
            <QueryErrorCard
              message={describeError(t, list.error, t('signInAgain'), t('all.loadFailed'))}
              onRetry={() => void list.refetch()}
              title={t('all.title')}
            />
          </Box>
        ) : (
          <MantineReactTable table={table} />
        )}
      </DataTableCard.Content>
    </DataTableCard.Container>
  );
}

/**
 * The signed-in sessions. Everyone sees and can end their own; seeing everyone's needs `sessions:read`,
 * and ending theirs needs `sessions:revoke` and a fresh confirmation with a code.
 */
export function SessionsPage({
  currentUserId,
  permissions,
}: {
  currentUserId: string;
  permissions: readonly Permission[];
}) {
  const { t } = useTranslation(['sessions', 'common']);
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['sessions'] }) > 0;

  return (
    <>
      <PageHeader
        actions={
          <HeaderActions>
            <HeaderAction
              icon={IconRefresh}
              label={t('common:refresh')}
              loading={fetching}
              onClick={() => void queryClient.invalidateQueries({ queryKey: ['sessions'] })}
            />
          </HeaderActions>
        }
        description={t('header.description')}
        icon={<IconDevices size={24} />}
        title={t('header.title')}
      />

      <Stack gap="md">
        <MySessions />
        {permissions.includes('sessions:read') ? (
          <AllSessions
            canRevoke={permissions.includes('sessions:revoke')}
            currentUserId={currentUserId}
          />
        ) : null}
      </Stack>
    </>
  );
}
