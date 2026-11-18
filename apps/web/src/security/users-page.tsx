import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@mantine/core';
import {
  IconDots,
  IconId,
  IconKeyOff,
  IconLink,
  IconMail,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUser,
  IconUserPlus,
  IconUserShield,
} from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type MouseEvent, type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PiEnvelopeSimpleDuotone,
  PiFloppyDiskDuotone,
  PiProhibitDuotone,
  PiPulseDuotone,
  PiUsersDuotone,
} from 'react-icons/pi';

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
import {
  Callout,
  CopyableCodeBlock,
  DataTableCard,
  ErrorMessageBlock,
  HeaderAction,
  HeaderActions,
  type ListTableColumn,
  ListTable,
  MetricCard,
  ModalFooter,
  OverlayHeader,
  type StatusKind,
  StatusText,
} from '@swellwright/ui';

import { createUser, deleteUser, listUsers, resetCredentials, updateUser } from '../api.js';
import { invitationLink } from '../auth/invitation.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useDateTime, useNumber } from '../format.js';
import { confirmAction, notifySuccess } from '../shell/feedback.js';
import { useIsMobile } from '../shell/use-is-mobile.js';
import { notifyFailure } from './notify-failure.js';
import { useLastDefined } from './use-last-defined.js';

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

/**
 * The invitation, shown once: the link to hand over. Its footer closes the dialog; the intro is the panel's amber
 * "shown once" note.
 */
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
      <Callout>
        {invitation.purpose === 'reset'
          ? t('invitation.introReset', values)
          : t('invitation.introNew', values)}
      </Callout>
      <CopyableCodeBlock
        copiedLabel={t('common:copied')}
        copyLabel={t('invitation.copyLink')}
        inputWrapperProps={{ label: t('invitation.link') }}
        value={link}
      />
      <ModalFooter>
        <Button color="teal" onClick={onClose} size="md" variant="light">
          {t('invitation.done')}
        </Button>
      </ModalFooter>
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
  const isMobile = useIsMobile();
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
    onError: (error) => {
      notifyFailure(t, t('invite.title'), error, t('signInAgain'), t('invite.forbidden'));
    },
  });

  // The form is cleared once the dialog has faded out, so it does not change while it closes. A request still on its
  // way when the dialog is closed is dropped at once.
  const close = () => {
    if (mutation.isPending) {
      mutation.reset();
    }
    onClose();
  };
  const reset = () => {
    mutation.reset();
    setUsername('');
    setDisplayName('');
    setEmail('');
    setRole('observer');
    setTouched(false);
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
      fullScreen={isMobile}
      onClose={close}
      onExitTransitionEnd={reset}
      opened={opened}
      title={
        mutation.data ? (
          <OverlayHeader icon={IconLink} iconColor="teal" title={t('invitation.title')} />
        ) : (
          <OverlayHeader icon={IconUserPlus} iconColor="teal" title={t('invite.title')} />
        )
      }
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
              leftSection={<IconUser size={16} />}
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
              leftSection={<IconUserShield size={16} />}
              onChange={(value) => {
                setRole(asRole(value) ?? 'observer');
              }}
              value={role}
            />
            <TextInput
              autoComplete="off"
              label={t('fields.displayName')}
              leftSection={<IconId size={16} />}
              onChange={(e) => {
                setDisplayName(e.currentTarget.value);
              }}
              value={displayName}
            />
            <TextInput
              autoComplete="off"
              error={touched && email.trim() && !check.success ? t('invite.emailError') : undefined}
              label={t('fields.email')}
              leftSection={<IconMail size={16} />}
              onChange={(e) => {
                setEmail(e.currentTarget.value);
              }}
              value={email}
            />
            <ModalFooter>
              <Button
                color="teal"
                leftSection={<IconUserPlus size={16} />}
                loading={mutation.isPending}
                size="md"
                type="submit"
                variant="soft"
              >
                {t('invite.submit')}
              </Button>
            </ModalFooter>
          </Stack>
        </form>
      )}
    </Modal>
  );
}

function EditDialog({
  user,
  currentUserId,
  onClose,
  onDone,
}: {
  user: UserView | undefined;
  currentUserId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('users');
  const isMobile = useIsMobile();
  const shown = useLastDefined(user);
  return (
    <Modal
      fullScreen={isMobile}
      onClose={onClose}
      opened={user !== undefined}
      title={
        <OverlayHeader
          icon={IconPencil}
          iconColor="teal"
          title={t('edit.title', { username: shown?.username ?? '' })}
        />
      }
    >
      {shown ? (
        <EditForm
          key={shown.id}
          onClose={onClose}
          onDone={onDone}
          self={shown.id === currentUserId}
          user={shown}
        />
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
      notifySuccess(t('toast.success'), t('edit.done', { username: user.username }));
      onDone();
      onClose();
    },
    onError: (error) => {
      notifyFailure(
        t,
        t('edit.title', { username: user.username }),
        error,
        t('signInAgain'),
        t('edit.forbidden'),
      );
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
          leftSection={<IconUserShield size={16} />}
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
          leftSection={<PiPulseDuotone size={16} />}
          onChange={(value) => {
            setStatus(asStatus(value) ?? 'active');
          }}
          value={status}
        />
        <TextInput
          label={t('fields.displayName')}
          leftSection={<IconId size={16} />}
          onChange={(e) => {
            setDisplayName(e.currentTarget.value);
          }}
          value={displayName}
        />
        <TextInput
          label={t('fields.email')}
          leftSection={<IconMail size={16} />}
          onChange={(e) => {
            setEmail(e.currentTarget.value);
          }}
          value={email}
        />
        <ModalFooter>
          <Button
            color="teal"
            leftSection={<PiFloppyDiskDuotone size={16} />}
            loading={mutation.isPending}
            size="md"
            type="submit"
            variant="soft"
          >
            {t('common:save')}
          </Button>
        </ModalFooter>
      </Stack>
    </form>
  );
}

/**
 * Resetting the credentials of a user. It stays a dialog of its own (not a confirmation) because, once done, it
 * shows the new invitation, which is shown only once.
 */
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
  const isMobile = useIsMobile();
  const step = useStepUp();
  const shown = useLastDefined(user);
  const username = shown?.username ?? '';
  const mutation = useMutation({
    mutationFn: (id: string) => step.run(() => resetCredentials(id)),
    onSuccess: onDone,
    onError: (error) => {
      notifyFailure(
        t,
        t('reset.title', { username }),
        error,
        t('signInAgain'),
        t('reset.forbidden'),
      );
    },
  });
  return (
    <Modal
      fullScreen={isMobile}
      onClose={onClose}
      onExitTransitionEnd={() => {
        mutation.reset();
      }}
      opened={user !== undefined}
      title={
        mutation.data ? (
          <OverlayHeader icon={IconLink} iconColor="teal" title={t('invitation.title')} />
        ) : (
          <OverlayHeader icon={IconKeyOff} iconColor="red" title={t('reset.title', { username })} />
        )
      }
    >
      {mutation.data ? (
        <InvitationNotice
          invitation={mutation.data.invitation}
          onClose={onClose}
          user={mutation.data.user.username}
        />
      ) : (
        <Stack gap="md">
          <Text fz="sm">{t('reset.warning')}</Text>
          <ModalFooter>
            <Button
              color="red"
              leftSection={<IconKeyOff size={16} />}
              loading={mutation.isPending}
              onClick={() => {
                if (shown) {
                  mutation.mutate(shown.id);
                }
              }}
              size="md"
              variant="soft"
            >
              {t('reset.submit')}
            </Button>
          </ModalFooter>
        </Stack>
      )}
    </Modal>
  );
}

/** Keeps a click on the kebab or its menu from also opening the row. */
const stopRowClick = (event: MouseEvent) => {
  event.stopPropagation();
};

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
  const formatNumber = useNumber();
  const queryClient = useQueryClient();
  const step = useStepUp();
  const canWrite = permissions.includes('users:write');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<UserView | undefined>(undefined);
  const [resetting, setResetting] = useState<UserView | undefined>(undefined);

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

  // Deleting goes through the panel's confirmation dialog; the work (and a code prompt, if one is due) follows it.
  const remove = useMutation({
    mutationFn: (target: UserView) => step.run(() => deleteUser(target.id)),
    onSuccess: (_result, target) => {
      notifySuccess(t('toast.success'), t('delete.done', { username: target.username }));
      void refresh();
    },
    onError: (error, target) => {
      notifyFailure(
        t,
        t('delete.title', { username: target.username }),
        error,
        t('signInAgain'),
        t('delete.forbidden'),
      );
    },
  });
  const askDelete = (user: UserView) => {
    confirmAction({
      title: t('delete.title', { username: user.username }),
      message: (
        <Stack gap="xs">
          <Text fw={600} size="sm">
            {t('delete.irreversible')}
          </Text>
          <Text size="sm">{t('delete.warning', { username: user.username })}</Text>
        </Stack>
      ),
      confirmLabel: t('delete.submit'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => {
        remove.mutate(user);
      },
    });
  };

  // The API pages the list, so the counts cover what has been loaded; a trailing plus says there is more.
  const more = list.hasNextPage;
  const count = (state?: UserView['state']): string =>
    list.isError
      ? '–'
      : `${formatNumber(state === undefined ? users.length : users.filter((u) => u.state === state).length)}${
          more ? '+' : ''
        }`;
  const metrics = [
    { id: 'total', icon: PiUsersDuotone, color: 'blue', title: t('metrics.total'), value: count() },
    {
      id: 'active',
      icon: PiPulseDuotone,
      color: 'teal',
      title: t('states.active'),
      value: count('active'),
    },
    {
      id: 'invited',
      icon: PiEnvelopeSimpleDuotone,
      color: 'blue',
      title: t('states.invited'),
      value: count('invited'),
    },
    {
      id: 'disabled',
      icon: PiProhibitDuotone,
      color: 'gray',
      title: t('states.disabled'),
      value: count('disabled'),
    },
  ];

  const columns: ListTableColumn<UserView>[] = [
    {
      accessor: 'username',
      title: t('fields.loginName'),
      render: (user) => (
        <Group gap="xs" wrap="nowrap">
          <Text fw={500} size="sm">
            {user.username}
          </Text>
          {user.id === currentUserId ? (
            <Badge color="cyan" size="lg" variant="soft">
              {t('table.you')}
            </Badge>
          ) : null}
        </Group>
      ),
    },
    { accessor: 'displayName', title: t('fields.displayName') },
    {
      accessor: 'role',
      title: t('fields.role'),
      render: (user) => (
        <Badge color="gray" size="lg" variant="soft">
          {t(`roles:names.${user.role}`)}
        </Badge>
      ),
    },
    {
      accessor: 'state',
      title: t('table.state'),
      render: (user) => (
        <Group gap="xs" wrap="nowrap">
          <StatusText kind={STATE_KIND[user.state]}>{t(`states.${user.state}`)}</StatusText>
          {user.invitationExpiresAt ? (
            <Text c="dimmed" size="xs">
              {t('table.invitationUntil', { when: formatDate(user.invitationExpiresAt) })}
            </Text>
          ) : null}
        </Group>
      ),
    },
    {
      accessor: 'lastLoginAt',
      title: t('table.lastSignIn'),
      render: (user) =>
        user.lastLoginAt ? (
          <Text ff="monospace" size="sm">
            {formatDate(user.lastLoginAt)}
          </Text>
        ) : (
          <Text c="dimmed" size="sm">
            {t('common:never')}
          </Text>
        ),
    },
    {
      accessor: 'actions',
      hidden: !canWrite,
      pinned: 'right',
      textAlign: 'right',
      width: 64,
      title: (
        <Group c="dimmed" gap={4} justify="flex-end" pr={4} wrap="nowrap">
          <IconPencil aria-hidden size={18} />
          <VisuallyHidden>{t('table.actions')}</VisuallyHidden>
        </Group>
      ),
      render: (user) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Menu position="bottom-end" trigger="click-hover" width={220}>
            <Menu.Target>
              <ActionIcon
                aria-label={t('table.actionsFor', { username: user.username })}
                color="gray"
                onClick={stopRowClick}
                size="md"
                variant="subtle"
              >
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={stopRowClick}>
              <Menu.Item
                leftSection={<IconPencil size={16} />}
                onClick={() => {
                  setEditing(user);
                }}
              >
                {t('menu.change')}
              </Menu.Item>

              <Menu.Divider />
              <Menu.Label>{t('menu.dangerZone')}</Menu.Label>
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
                    askDelete(user);
                  }}
                >
                  {t('menu.deleteUser')}
                </Menu.Item>
              ) : null}
            </Menu.Dropdown>
          </Menu>
        </Group>
      ),
    },
  ];

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, xs: 2, xl: 4 }} spacing="xs">
        {metrics.map(({ id, icon, color, title, value }) => (
          <MetricCard
            icon={icon}
            iconColor={color}
            isLoading={list.isPending}
            key={id}
            title={title}
            value={value}
            {...(more && id === 'total' ? { subtitle: t('metrics.loadedSoFar') } : {})}
          />
        ))}
      </SimpleGrid>

      <DataTableCard.Container>
        <DataTableCard.Title
          actions={
            <HeaderActions>
              <HeaderAction
                icon={IconRefresh}
                label={t('common:refresh')}
                loading={list.isRefetching && !list.isFetchingNextPage}
                onClick={() => void list.refetch()}
              />
              {canWrite ? (
                <HeaderAction
                  color="teal"
                  icon={IconUserPlus}
                  label={t('header.invite')}
                  onClick={() => {
                    setInviting(true);
                  }}
                />
              ) : null}
            </HeaderActions>
          }
          description={t('header.description')}
          icon={<PiUsersDuotone size={24} />}
          title={t('header.title')}
        />
        <DataTableCard.Content>
          {list.isError ? (
            <Box p="md">
              <ErrorMessageBlock
                copiedLabel={t('common:copied')}
                copyLabel={t('common:copy')}
                message={describeError(t, list.error, t('signInAgain'), t('table.loadFailed'))}
              />
            </Box>
          ) : (
            <ListTable
              aria-label={t('header.title')}
              borderRadius={0}
              columns={columns}
              emptyText={t('table.empty')}
              fetching={list.isFetching}
              loadingLabel={t('common:loading')}
              records={users}
              withTableBorder={false}
              {...(canWrite
                ? {
                    onRowClick: (user: UserView) => {
                      setEditing(user);
                    },
                  }
                : {})}
            />
          )}
        </DataTableCard.Content>
      </DataTableCard.Container>

      {list.hasNextPage ? (
        <Group gap="xs" justify="flex-end">
          <Button
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
            size="sm"
            variant="default"
          >
            {t('table.loadMore')}
          </Button>
        </Group>
      ) : null}

      <InviteDialog
        onClose={() => {
          setInviting(false);
        }}
        onDone={() => void refresh()}
        opened={inviting}
      />
      <EditDialog
        currentUserId={currentUserId}
        onClose={() => {
          setEditing(undefined);
        }}
        onDone={() => void refresh()}
        user={editing}
      />
      <ResetDialog
        onClose={() => {
          setResetting(undefined);
        }}
        onDone={() => void refresh()}
        user={resetting}
      />
    </Stack>
  );
}
