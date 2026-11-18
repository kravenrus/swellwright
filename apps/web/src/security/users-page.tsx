import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconDots,
  IconKeyOff,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CreateUserRequestSchema,
  type Invitation,
  type Permission,
  USER_ROLES,
  USER_STATUSES,
  type UserRole,
  type UserStatus,
  type UserView,
} from '@swellwright/contracts';
import { PageHeader, StatusText, type StatusKind } from '@swellwright/ui';

import { createUser, deleteUser, listUsers, resetCredentials, updateUser } from '../api.js';
import { invitationLink } from '../auth/invitation.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useDateTime } from '../format.js';

const PAGE_SIZE = 100;

const STATE_KIND: Record<UserView['state'], StatusKind> = {
  active: 'ok',
  invited: 'info',
  disabled: 'wait',
};

/** The roles for a select, named in the language of the console. */
function useRoleOptions() {
  const { t } = useTranslation('roles');
  return USER_ROLES.map((value) => ({ value, label: t(`names.${value}`) }));
}

function useStatusOptions() {
  const { t } = useTranslation('users');
  return USER_STATUSES.map((value) => ({ value, label: t(`states.${value}`) }));
}

const asRole = (value: string | null): UserRole | null =>
  USER_ROLES.find((known) => known === value) ?? null;
const asStatus = (value: string | null): UserStatus | null =>
  USER_STATUSES.find((known) => known === value) ?? null;

/** `fallback` is what a refusal for lack of permission says, already translated. */
function ErrorNote({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useTranslation('users');
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
      {describeError(t, error, t('signInAgain'), fallback)}
    </Alert>
  );
}

/** The invitation, shown once: the link to hand over, and the token for typing it in. */
function InvitationNotice({
  user,
  invitation,
  onClose,
}: {
  user: string;
  invitation: Invitation;
  onClose: () => void;
}) {
  const { t } = useTranslation(['users', 'common']);
  const formatDate = useDateTime('short');
  const link = invitationLink(invitation.token);
  const values = { user, expires: formatDate(invitation.expiresAt) };
  return (
    <Stack gap="md">
      <Text fz="sm">
        {invitation.purpose === 'reset'
          ? t('invitation.introReset', values)
          : t('invitation.introNew', values)}
      </Text>
      <Stack gap={4}>
        <Text c="dimmed" fz="xs">
          {t('invitation.link')}
        </Text>
        <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {link}
        </Code>
      </Stack>
      <Group justify="space-between">
        <CopyButton value={link}>
          {({ copied, copy }) => (
            <Button
              leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              onClick={copy}
              variant="default"
            >
              {copied ? t('common:copied') : t('invitation.copyLink')}
            </Button>
          )}
        </CopyButton>
        <Button onClick={onClose}>{t('invitation.done')}</Button>
      </Group>
    </Stack>
  );
}

function InviteDialog({
  opened,
  onClose,
  onDone,
}: {
  opened: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('observer');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const { t } = useTranslation(['users', 'common']);
  const roleOptions = useRoleOptions();
  const step = useStepUp();
  const request = {
    username,
    role,
    ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    ...(email.trim() ? { email: email.trim() } : {}),
  };
  const check = CreateUserRequestSchema.safeParse(request);
  const mutation = useMutation({
    mutationFn: () => step.run(() => createUser(request)),
    onSuccess: onDone,
  });

  const close = () => {
    mutation.reset();
    setUsername('');
    setDisplayName('');
    setEmail('');
    setRole('observer');
    setTouched(false);
    onClose();
  };
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (check.success) {
      mutation.mutate();
    }
  };

  return (
    <Modal
      centered
      onClose={close}
      opened={opened}
      title={mutation.data ? t('invitation.title') : t('invite.title')}
    >
      {mutation.data ? (
        <InvitationNotice
          invitation={mutation.data.invitation}
          onClose={close}
          user={mutation.data.user.username}
        />
      ) : (
        <form onSubmit={submit}>
          <Stack gap="md">
            <TextInput
              autoComplete="off"
              data-autofocus
              description={t('invite.loginNameDescription')}
              error={
                touched &&
                username.length > 0 &&
                !CreateUserRequestSchema.shape.username.safeParse(username).success
                  ? t('invite.loginNameError')
                  : undefined
              }
              label={t('fields.loginName')}
              onChange={(e) => {
                setUsername(e.currentTarget.value);
              }}
              required
              value={username}
            />
            <Select
              allowDeselect={false}
              data={roleOptions}
              description={t('invite.roleDescription')}
              label={t('fields.role')}
              onChange={(value) => {
                setRole(asRole(value) ?? 'observer');
              }}
              value={role}
            />
            <TextInput
              autoComplete="off"
              label={t('fields.displayName')}
              onChange={(e) => {
                setDisplayName(e.currentTarget.value);
              }}
              value={displayName}
            />
            <TextInput
              autoComplete="off"
              error={touched && email.trim() && !check.success ? t('invite.emailError') : undefined}
              label={t('fields.email')}
              onChange={(e) => {
                setEmail(e.currentTarget.value);
              }}
              value={email}
            />
            <ErrorNote error={mutation.error} fallback={t('invite.forbidden')} />
            <Group justify="flex-end">
              <Button onClick={close} variant="default">
                {t('common:cancel')}
              </Button>
              <Button
                leftSection={<IconUserPlus size={16} />}
                loading={mutation.isPending}
                type="submit"
              >
                {t('invite.submit')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}

function EditDialog({
  user,
  self,
  onClose,
  onDone,
}: {
  user: UserView | undefined;
  self: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('users');
  return (
    <Modal
      centered
      onClose={onClose}
      opened={user !== undefined}
      title={t('edit.title', { username: user?.username ?? '' })}
    >
      {user ? (
        <EditForm key={user.id} onClose={onClose} onDone={onDone} self={self} user={user} />
      ) : null}
    </Modal>
  );
}

function EditForm({
  user,
  self,
  onClose,
  onDone,
}: {
  user: UserView;
  self: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(
    user.state === 'disabled' ? 'disabled' : 'active',
  );
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [email, setEmail] = useState(user.email ?? '');

  const { t } = useTranslation(['users', 'common']);
  const roleOptions = useRoleOptions();
  const statusOptions = useStatusOptions();
  const step = useStepUp();
  const mutation = useMutation({
    mutationFn: () =>
      step.run(() =>
        updateUser(user.id, {
          role,
          status,
          displayName: displayName.trim() || null,
          email: email.trim() || null,
        }),
      ),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <Select
          allowDeselect={false}
          data={roleOptions}
          description={self ? t('edit.roleSelf') : undefined}
          disabled={self}
          label={t('fields.role')}
          onChange={(value) => {
            setRole(asRole(value) ?? user.role);
          }}
          value={role}
        />
        <Select
          allowDeselect={false}
          data={statusOptions}
          description={self ? t('edit.statusSelf') : t('edit.statusHint')}
          disabled={self}
          label={t('fields.status')}
          onChange={(value) => {
            setStatus(asStatus(value) ?? 'active');
          }}
          value={status}
        />
        <TextInput
          label={t('fields.displayName')}
          onChange={(e) => {
            setDisplayName(e.currentTarget.value);
          }}
          value={displayName}
        />
        <TextInput
          label={t('fields.email')}
          onChange={(e) => {
            setEmail(e.currentTarget.value);
          }}
          value={email}
        />
        <ErrorNote error={mutation.error} fallback={t('edit.forbidden')} />
        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">
            {t('common:cancel')}
          </Button>
          <Button loading={mutation.isPending} type="submit">
            {t('common:save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function ResetDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserView | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['users', 'common']);
  const step = useStepUp();
  const mutation = useMutation({
    mutationFn: (id: string) => step.run(() => resetCredentials(id)),
    onSuccess: onDone,
  });
  const close = () => {
    mutation.reset();
    onClose();
  };
  return (
    <Modal
      centered
      onClose={close}
      opened={user !== undefined}
      title={
        mutation.data ? t('invitation.title') : t('reset.title', { username: user?.username ?? '' })
      }
    >
      {mutation.data ? (
        <InvitationNotice
          invitation={mutation.data.invitation}
          onClose={close}
          user={mutation.data.user.username}
        />
      ) : (
        <Stack gap="md">
          <Text fz="sm">{t('reset.warning')}</Text>
          <ErrorNote error={mutation.error} fallback={t('reset.forbidden')} />
          <Group justify="flex-end">
            <Button onClick={close} variant="default">
              {t('common:cancel')}
            </Button>
            <Button
              color="red"
              leftSection={<IconKeyOff size={16} />}
              loading={mutation.isPending}
              onClick={() => {
                if (user) {
                  mutation.mutate(user.id);
                }
              }}
            >
              {t('reset.submit')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/** Deleting a disabled account for good. The warning is plain because nothing brings the account back. */
function DeleteDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserView | undefined;
  onClose: () => void;
  onDone: (username: string) => void;
}) {
  const { t } = useTranslation(['users', 'common']);
  const step = useStepUp();
  const mutation = useMutation({
    mutationFn: (target: UserView) => step.run(() => deleteUser(target.id)),
    onSuccess: (_result, target) => {
      onDone(target.username);
      onClose();
    },
  });
  const close = () => {
    mutation.reset();
    onClose();
  };
  const username = user?.username ?? '';
  return (
    <Modal
      centered
      onClose={close}
      opened={user !== undefined}
      title={t('delete.title', { username })}
    >
      <Stack gap="md">
        <Text fw={600} fz="sm">
          {t('delete.irreversible')}
        </Text>
        <Text fz="sm">{t('delete.warning', { username })}</Text>
        <ErrorNote error={mutation.error} fallback={t('delete.forbidden')} />
        <Group justify="flex-end">
          <Button onClick={close} variant="default">
            {t('common:cancel')}
          </Button>
          <Button
            color="red"
            leftSection={<IconTrash size={16} />}
            loading={mutation.isPending}
            onClick={() => {
              if (user) {
                mutation.mutate(user);
              }
            }}
          >
            {t('delete.submit')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** What the page says after an account was deleted. Only the name is kept, so the text follows the language. */
function DeletedNotice({ username, onClose }: { username: string; onClose: () => void }) {
  const { t } = useTranslation(['users', 'common']);
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
      {t('delete.done', { username })}
    </Alert>
  );
}

/**
 * The users of the instance. Reading needs `users:read`; inviting, changing, resetting and deleting need
 * `users:write`.
 */
export function UsersPage({
  permissions,
  currentUserId,
}: {
  permissions: readonly Permission[];
  currentUserId: string;
}) {
  const { t } = useTranslation(['users', 'common', 'roles']);
  const formatDate = useDateTime('short');
  const queryClient = useQueryClient();
  const canWrite = permissions.includes('users:write');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<UserView | undefined>(undefined);
  const [resetting, setResetting] = useState<UserView | undefined>(undefined);
  const [deleting, setDeleting] = useState<UserView | undefined>(undefined);
  const [deleted, setDeleted] = useState<string | undefined>(undefined);

  const list = useInfiniteQuery({
    queryKey: ['users'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listUsers({ limit: PAGE_SIZE, ...(pageParam === undefined ? {} : { cursor: pageParam }) }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const users = list.data?.pages.flatMap((p) => p.users) ?? [];

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button
              leftSection={<IconRefresh size={16} />}
              loading={list.isRefetching && !list.isFetchingNextPage}
              onClick={() => void list.refetch()}
              variant="default"
            >
              {t('common:refresh')}
            </Button>
            {canWrite ? (
              <Button
                leftSection={<IconUserPlus size={16} />}
                onClick={() => {
                  setInviting(true);
                }}
              >
                {t('header.invite')}
              </Button>
            ) : null}
          </>
        }
        description={t('header.description')}
        icon={<IconUsers size={22} />}
        title={t('header.title')}
      />

      {deleted !== undefined ? (
        <DeletedNotice
          onClose={() => {
            setDeleted(undefined);
          }}
          username={deleted}
        />
      ) : null}

      <Card padding={0}>
        {list.isPending ? (
          <Stack gap="xs" p="md">
            <Skeleton h={28} />
            <Skeleton h={28} />
          </Stack>
        ) : list.isError ? (
          <Alert color="red" m="md" variant="light">
            {describeError(t, list.error, t('signInAgain'), t('table.loadFailed'))}
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={680}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th pl="md">{t('fields.loginName')}</Table.Th>
                  <Table.Th>{t('fields.role')}</Table.Th>
                  <Table.Th>{t('table.state')}</Table.Th>
                  <Table.Th>{t('table.lastSignIn')}</Table.Th>
                  <Table.Th pr="md" w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td pl="md">
                      <Group gap={6} wrap="nowrap">
                        <Text fw={500} fz="sm">
                          {user.username}
                        </Text>
                        {user.id === currentUserId ? (
                          <Badge size="xs">{t('table.you')}</Badge>
                        ) : null}
                      </Group>
                      {user.displayName ? (
                        <Text c="dimmed" fz="xs">
                          {user.displayName}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Badge color="gray" variant="light">
                        {t(`roles:names.${user.role}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <StatusText kind={STATE_KIND[user.state]}>
                        {t(`states.${user.state}`)}
                      </StatusText>
                      {user.invitationExpiresAt ? (
                        <Text c="dimmed" fz="xs">
                          {t('table.invitationUntil', {
                            when: formatDate(user.invitationExpiresAt),
                          })}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td c="dimmed" fz="sm">
                      {user.lastLoginAt ? formatDate(user.lastLoginAt) : t('common:never')}
                    </Table.Td>
                    <Table.Td pr="md">
                      {canWrite ? (
                        <Menu position="bottom-end" shadow="md" withinPortal>
                          <Menu.Target>
                            <ActionIcon
                              aria-label={t('table.actionsFor', { username: user.username })}
                              color="gray"
                              variant="subtle"
                            >
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconPencil size={16} />}
                              onClick={() => {
                                setEditing(user);
                              }}
                            >
                              {t('menu.change')}
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              disabled={user.id === currentUserId}
                              leftSection={<IconKeyOff size={16} />}
                              onClick={() => {
                                setResetting(user);
                              }}
                            >
                              {t('menu.resetCredentials')}
                            </Menu.Item>
                            {user.state === 'disabled' && user.id !== currentUserId ? (
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={16} />}
                                onClick={() => {
                                  setDeleting(user);
                                }}
                              >
                                {t('menu.deleteUser')}
                              </Menu.Item>
                            ) : null}
                          </Menu.Dropdown>
                        </Menu>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {list.hasNextPage ? (
          <Group justify="center" p="md">
            <Button
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
              variant="default"
            >
              {t('table.loadMore')}
            </Button>
          </Group>
        ) : null}
      </Card>

      <InviteDialog
        onClose={() => {
          setInviting(false);
        }}
        onDone={() => void refresh()}
        opened={inviting}
      />
      <EditDialog
        onClose={() => {
          setEditing(undefined);
        }}
        onDone={() => void refresh()}
        self={editing?.id === currentUserId}
        user={editing}
      />
      <ResetDialog
        onClose={() => {
          setResetting(undefined);
        }}
        onDone={() => void refresh()}
        user={resetting}
      />
      <DeleteDialog
        onClose={() => {
          setDeleting(undefined);
        }}
        onDone={(username) => {
          setDeleted(username);
          void refresh();
        }}
        user={deleting}
      />
    </>
  );
}
