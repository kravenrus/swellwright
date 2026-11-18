import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconDevices,
  IconLogout,
  IconRefresh,
} from '@tabler/icons-react';
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Permission, SessionSummary } from '@swellwright/contracts';
import { PageHeader } from '@swellwright/ui';

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
import { useDateTime } from '../format.js';

/** What the page says after sessions were ended. Kept as data so the text follows a change of language. */
type Notice =
  | { readonly kind: 'others'; readonly count: number }
  | { readonly kind: 'user'; readonly count: number; readonly username: string };

/** A user the administrator is about to sign out everywhere. */
interface Target {
  readonly id: string;
  readonly username: string;
}

/** `fallback` is what a refusal for lack of permission says, already translated. */
function ErrorNote({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useTranslation('sessions');
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
      {describeError(t, error, t('signInAgain'), fallback)}
    </Alert>
  );
}

function NoticeAlert({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const { t } = useTranslation(['sessions', 'common']);
  const text =
    notice.kind === 'others'
      ? notice.count === 0
        ? t('notice.noOthers')
        : t('notice.others', { count: notice.count })
      : notice.count === 0
        ? t('notice.noneForUser', { username: notice.username })
        : t('notice.user', { count: notice.count, username: notice.username });
  return (
    <Alert
      closeButtonLabel={t('common:close')}
      color="teal"
      icon={<IconCheck size={16} />}
      mb="md"
      onClose={onClose}
      role="status"
      variant="light"
      withCloseButton
    >
      {text}
    </Alert>
  );
}

function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Group align="flex-end" gap="sm" justify="space-between" wrap="wrap">
      <Stack gap={0}>
        <Title order={5}>{title}</Title>
        <Text c="dimmed" fz="sm">
          {description}
        </Text>
      </Stack>
      {actions ? (
        <Group gap="sm" justify="flex-end" wrap="wrap">
          {actions}
        </Group>
      ) : null}
    </Group>
  );
}

const FIRST_COLUMN = { pl: 'md' } as const;

/**
 * The sessions as a table. The session in use has no end action: ending it is signing out, and the server
 * refuses it. `onEnd` is left out when the viewer may not end any.
 */
function SessionsTable({
  sessions,
  kind,
  onEnd,
  pendingId,
}: {
  sessions: readonly SessionSummary[];
  kind: 'mine' | 'all';
  onEnd: ((session: SessionSummary) => void) | undefined;
  pendingId: string | undefined;
}) {
  const { t } = useTranslation('sessions');
  const formatDate = useDateTime('short');
  const showUser = kind === 'all';
  const dash = (
    <Text c="dimmed" component="span">
      —
    </Text>
  );
  return (
    <Table.ScrollContainer minWidth={showUser ? 900 : 780}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            {showUser ? <Table.Th {...FIRST_COLUMN}>{t('columns.user')}</Table.Th> : null}
            <Table.Th {...(showUser ? {} : FIRST_COLUMN)}>{t('columns.started')}</Table.Th>
            <Table.Th>{t('columns.lastActive')}</Table.Th>
            <Table.Th>{t('columns.address')}</Table.Th>
            <Table.Th>{t('columns.browser')}</Table.Th>
            <Table.Th>{t('columns.state')}</Table.Th>
            {onEnd ? <Table.Th pr="md" /> : null}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sessions.map((session) => {
            const when = formatDate(session.createdAt);
            return (
              <Table.Tr key={session.id}>
                {showUser ? (
                  <Table.Td {...FIRST_COLUMN}>
                    <Text fw={500} fz="sm">
                      {session.username}
                    </Text>
                  </Table.Td>
                ) : null}
                <Table.Td
                  {...(showUser ? {} : FIRST_COLUMN)}
                  style={{ whiteSpace: 'nowrap' }}
                  title={session.createdAt}
                >
                  {when}
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }} title={session.lastSeenAt}>
                  {formatDate(session.lastSeenAt)}
                </Table.Td>
                <Table.Td ff="monospace" fz="sm">
                  {session.ip ?? dash}
                </Table.Td>
                <Table.Td>
                  {session.userAgent ? (
                    <Text fz="sm" maw={260} title={session.userAgent} truncate="end">
                      {session.userAgent}
                    </Text>
                  ) : (
                    dash
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="wrap">
                    {session.current ? <Badge size="sm">{t('badges.current')}</Badge> : null}
                    {session.elevated ? (
                      <Badge
                        color="teal"
                        size="sm"
                        title={t('badges.elevatedHint')}
                        variant="light"
                      >
                        {t('badges.elevated')}
                      </Badge>
                    ) : null}
                  </Group>
                </Table.Td>
                {onEnd ? (
                  <Table.Td pr="md" style={{ textAlign: 'right' }}>
                    {session.current ? null : (
                      <Button
                        aria-label={
                          showUser
                            ? t('all.endAria', { username: session.username, when })
                            : t('mine.signOutAria', { when })
                        }
                        leftSection={<IconLogout size={14} />}
                        loading={pendingId === session.id}
                        onClick={() => {
                          onEnd(session);
                        }}
                        size="xs"
                        variant="default"
                      >
                        {showUser ? t('all.end') : t('mine.signOut')}
                      </Button>
                    )}
                  </Table.Td>
                ) : null}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Your own sessions: any signed-in user may list them and end the others. */
function MySessions({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const { t } = useTranslation(['sessions', 'common']);
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const list = useQuery({ queryKey: ['sessions', 'mine'], queryFn: listMySessions, retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const endOne = useMutation({ mutationFn: revokeMySession, onSuccess: refresh });
  const endOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: (result) => {
      setConfirming(false);
      onNotice({ kind: 'others', count: result.revoked });
      return refresh();
    },
  });

  const sessions = list.data?.sessions ?? [];
  const hasOthers = sessions.some((session) => !session.current);
  const closeConfirm = () => {
    endOthers.reset();
    setConfirming(false);
  };

  return (
    <Stack gap="sm">
      <SectionHeader
        actions={
          <Button
            color="red"
            disabled={!hasOthers}
            leftSection={<IconLogout size={16} />}
            onClick={() => {
              setConfirming(true);
            }}
            variant="light"
          >
            {t('mine.endOthers')}
          </Button>
        }
        description={t('mine.description')}
        title={t('mine.title')}
      />
      <ErrorNote error={endOne.error} fallback={t('mine.endForbidden')} />
      <Card padding={0}>
        {list.isPending ? (
          <Stack gap="xs" p="md">
            <Skeleton h={28} />
            <Skeleton h={28} />
          </Stack>
        ) : list.isError ? (
          <Alert color="red" m="md" variant="light">
            {describeError(t, list.error, t('signInAgain'))}
          </Alert>
        ) : sessions.length === 0 ? (
          <Text c="dimmed" fz="sm" p="md">
            {t('mine.empty')}
          </Text>
        ) : (
          <>
            <SessionsTable
              kind="mine"
              onEnd={(session) => {
                endOne.mutate(session.id);
              }}
              pendingId={endOne.isPending ? endOne.variables : undefined}
              sessions={sessions}
            />
            <Text c="dimmed" fz="xs" p="md">
              {t('mine.currentNote')}
            </Text>
          </>
        )}
      </Card>

      <Modal centered onClose={closeConfirm} opened={confirming} title={t('endOthers.title')}>
        <Stack gap="md">
          <Text fz="sm">{t('endOthers.warning')}</Text>
          <ErrorNote error={endOthers.error} fallback={t('mine.endForbidden')} />
          <Group justify="flex-end">
            <Button onClick={closeConfirm} variant="default">
              {t('common:cancel')}
            </Button>
            <Button
              color="red"
              leftSection={<IconLogout size={16} />}
              loading={endOthers.isPending}
              onClick={() => {
                endOthers.mutate();
              }}
            >
              {t('endOthers.submit')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

/** The sessions of every user (`sessions:read`). Ending them needs `sessions:revoke` and a fresh code. */
function AllSessions({
  currentUserId,
  canRevoke,
  onNotice,
}: {
  currentUserId: string;
  canRevoke: boolean;
  onNotice: (notice: Notice) => void;
}) {
  const { t } = useTranslation(['sessions', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const [userId, setUserId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Target | undefined>(undefined);
  const list = useQuery({
    queryKey: ['sessions', 'all'],
    queryFn: () => listSessions({}),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const endOne = useMutation({
    mutationFn: (id: string) => step.run(() => revokeSession(id)),
    onSuccess: refresh,
  });
  const endUser = useMutation({
    mutationFn: (target: Target) => step.run(() => revokeUserSessions(target.id)),
    onSuccess: (result, target) => {
      setConfirming(undefined);
      setUserId(null);
      onNotice({ kind: 'user', count: result.revoked, username: target.username });
      return refresh();
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
  const shown = selected ? (all ?? []).filter((s) => s.userId === selected.value) : (all ?? []);
  const canEndUser = canRevoke && selected !== undefined && selected.value !== currentUserId;
  const closeConfirm = () => {
    endUser.reset();
    setConfirming(undefined);
  };

  return (
    <Stack gap="sm">
      <SectionHeader description={t('all.description')} title={t('all.title')} />
      <ErrorNote error={endOne.error} fallback={t('all.endForbidden')} />
      <Card padding={0}>
        <Group gap="sm" justify="space-between" p="md">
          <Select
            aria-label={t('all.userFilterLabel')}
            clearable
            data={users}
            onChange={setUserId}
            placeholder={t('all.userFilterPlaceholder')}
            searchable
            value={selected?.value ?? null}
            w={240}
          />
          {canEndUser ? (
            <Button
              color="red"
              leftSection={<IconLogout size={16} />}
              onClick={() => {
                setConfirming({ id: selected.value, username: selected.label });
              }}
              variant="light"
            >
              {t('all.endUser')}
            </Button>
          ) : null}
        </Group>

        {list.isPending ? (
          <Stack gap="xs" p="md" pt={0}>
            <Skeleton h={28} />
            <Skeleton h={28} />
          </Stack>
        ) : list.isError ? (
          <Alert color="red" m="md" mt={0} variant="light">
            {describeError(t, list.error, t('signInAgain'), t('all.loadFailed'))}
          </Alert>
        ) : shown.length === 0 ? (
          <Text c="dimmed" fz="sm" p="md" pt={0}>
            {selected ? t('all.emptyFiltered') : t('all.empty')}
          </Text>
        ) : (
          <SessionsTable
            kind="all"
            onEnd={
              canRevoke
                ? (session) => {
                    endOne.mutate(session.id);
                  }
                : undefined
            }
            pendingId={endOne.isPending ? endOne.variables : undefined}
            sessions={shown}
          />
        )}
      </Card>

      <Modal
        centered
        onClose={closeConfirm}
        opened={confirming !== undefined}
        title={t('endUser.title', { username: confirming?.username ?? '' })}
      >
        <Stack gap="md">
          <Text fz="sm">{t('endUser.warning', { username: confirming?.username ?? '' })}</Text>
          <ErrorNote error={endUser.error} fallback={t('all.endForbidden')} />
          <Group justify="flex-end">
            <Button onClick={closeConfirm} variant="default">
              {t('common:cancel')}
            </Button>
            <Button
              color="red"
              leftSection={<IconLogout size={16} />}
              loading={endUser.isPending}
              onClick={() => {
                if (confirming) {
                  endUser.mutate(confirming);
                }
              }}
            >
              {t('endUser.submit')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
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
  const [notice, setNotice] = useState<Notice | undefined>(undefined);

  return (
    <>
      <PageHeader
        actions={
          <Button
            leftSection={<IconRefresh size={16} />}
            loading={fetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['sessions'] })}
            variant="default"
          >
            {t('common:refresh')}
          </Button>
        }
        description={t('header.description')}
        icon={<IconDevices size={22} />}
        title={t('header.title')}
      />

      {notice ? (
        <NoticeAlert
          notice={notice}
          onClose={() => {
            setNotice(undefined);
          }}
        />
      ) : null}

      <Stack gap="xl">
        <MySessions onNotice={setNotice} />
        {permissions.includes('sessions:read') ? (
          <AllSessions
            canRevoke={permissions.includes('sessions:revoke')}
            currentUserId={currentUserId}
            onNotice={setNotice}
          />
        ) : null}
      </Stack>
    </>
  );
}
