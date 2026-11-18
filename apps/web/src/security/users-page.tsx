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
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';

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

import { createUser, listUsers, resetCredentials, updateUser } from '../api.js';
import { invitationLink } from '../auth/invitation.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';

const PAGE_SIZE = 100;

const STATE: Record<UserView['state'], { kind: StatusKind; label: string }> = {
  active: { kind: 'ok', label: 'Active' },
  invited: { kind: 'info', label: 'Invited' },
  disabled: { kind: 'wait', label: 'Disabled' },
};

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const roleOptions = USER_ROLES.map((value) => ({ value, label: value }));
const statusOptions = USER_STATUSES.map((value) => ({
  value,
  label: value === 'active' ? 'Active' : 'Disabled',
}));

const asRole = (value: string | null): UserRole | null =>
  USER_ROLES.find((known) => known === value) ?? null;
const asStatus = (value: string | null): UserStatus | null =>
  USER_STATUSES.find((known) => known === value) ?? null;

function ErrorNote({ error, fallback }: { error: unknown; fallback: string }) {
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
      {describeError(error, 'Sign in again to continue.', fallback)}
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
  const link = invitationLink(invitation.token);
  return (
    <Stack gap="md">
      <Text fz="sm">
        {invitation.purpose === 'reset'
          ? `The password and authenticator of ${user} are gone and every session of theirs has ended.`
          : `${user} has an account but no password yet.`}{' '}
        Give them this link. It is shown once, works once, and expires{' '}
        {when.format(new Date(invitation.expiresAt))}.
      </Text>
      <Stack gap={4}>
        <Text c="dimmed" fz="xs">
          Link
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
              {copied ? 'Copied' : 'Copy the link'}
            </Button>
          )}
        </CopyButton>
        <Button onClick={onClose}>Done</Button>
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
      title={mutation.data ? 'Invitation' : 'Invite a user'}
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
              description="Lower-case letters, digits, dot, dash or underscore. 2 to 32 characters."
              error={
                touched &&
                username.length > 0 &&
                !CreateUserRequestSchema.shape.username.safeParse(username).success
                  ? 'This login name is not allowed.'
                  : undefined
              }
              label="Login name"
              onChange={(e) => {
                setUsername(e.currentTarget.value);
              }}
              required
              value={username}
            />
            <Select
              allowDeselect={false}
              data={roleOptions}
              description="What they may do. See the Roles page."
              label="Role"
              onChange={(value) => {
                setRole(asRole(value) ?? 'observer');
              }}
              value={role}
            />
            <TextInput
              autoComplete="off"
              label="Display name"
              onChange={(e) => {
                setDisplayName(e.currentTarget.value);
              }}
              value={displayName}
            />
            <TextInput
              autoComplete="off"
              error={
                touched && email.trim() && !check.success
                  ? 'This is not an e-mail address.'
                  : undefined
              }
              label="E-mail address"
              onChange={(e) => {
                setEmail(e.currentTarget.value);
              }}
              value={email}
            />
            <ErrorNote error={mutation.error} fallback="Your role may not invite users." />
            <Group justify="flex-end">
              <Button onClick={close} variant="default">
                Cancel
              </Button>
              <Button
                leftSection={<IconUserPlus size={16} />}
                loading={mutation.isPending}
                type="submit"
              >
                Create and invite
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
  return (
    <Modal
      centered
      onClose={onClose}
      opened={user !== undefined}
      title={`Change ${user?.username ?? ''}`}
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
          description={self ? 'You cannot change your own role.' : undefined}
          disabled={self}
          label="Role"
          onChange={(value) => {
            setRole(asRole(value) ?? user.role);
          }}
          value={role}
        />
        <Select
          allowDeselect={false}
          data={statusOptions}
          description={
            self
              ? 'You cannot disable yourself.'
              : 'A disabled user is signed out at once and cannot sign in.'
          }
          disabled={self}
          label="Status"
          onChange={(value) => {
            setStatus(asStatus(value) ?? 'active');
          }}
          value={status}
        />
        <TextInput
          label="Display name"
          onChange={(e) => {
            setDisplayName(e.currentTarget.value);
          }}
          value={displayName}
        />
        <TextInput
          label="E-mail address"
          onChange={(e) => {
            setEmail(e.currentTarget.value);
          }}
          value={email}
        />
        <ErrorNote error={mutation.error} fallback="Your role may not change users." />
        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">
            Cancel
          </Button>
          <Button loading={mutation.isPending} type="submit">
            Save
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
      title={mutation.data ? 'Invitation' : `Reset the credentials of ${user?.username ?? ''}`}
    >
      {mutation.data ? (
        <InvitationNotice
          invitation={mutation.data.invitation}
          onClose={close}
          user={mutation.data.user.username}
        />
      ) : (
        <Stack gap="md">
          <Text fz="sm">
            This deletes their password, authenticator and recovery codes and signs them out
            everywhere, now. They cannot sign in until they accept the new invitation you will get.
          </Text>
          <ErrorNote error={mutation.error} fallback="Your role may not reset credentials." />
          <Group justify="flex-end">
            <Button onClick={close} variant="default">
              Cancel
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
              Reset credentials
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/** The users of the instance. Reading needs `users:read`; inviting, changing and resetting need `users:write`. */
export function UsersPage({
  permissions,
  currentUserId,
}: {
  permissions: readonly Permission[];
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
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
              Refresh
            </Button>
            {canWrite ? (
              <Button
                leftSection={<IconUserPlus size={16} />}
                onClick={() => {
                  setInviting(true);
                }}
              >
                Invite a user
              </Button>
            ) : null}
          </>
        }
        description="Who can sign in to this instance, and what they may do"
        icon={<IconUsers size={22} />}
        title="Users"
      />

      <Card padding={0}>
        {list.isPending ? (
          <Stack gap="xs" p="md">
            <Skeleton h={28} />
            <Skeleton h={28} />
          </Stack>
        ) : list.isError ? (
          <Alert color="red" m="md" variant="light">
            {describeError(
              list.error,
              'Sign in again to continue.',
              'Your role may not see the users.',
            )}
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={680}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th pl="md">Login name</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>State</Table.Th>
                  <Table.Th>Last sign-in</Table.Th>
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
                        {user.id === currentUserId ? <Badge size="xs">you</Badge> : null}
                      </Group>
                      {user.displayName ? (
                        <Text c="dimmed" fz="xs">
                          {user.displayName}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Badge color="gray" variant="light">
                        {user.role}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <StatusText kind={STATE[user.state].kind}>
                        {STATE[user.state].label}
                      </StatusText>
                      {user.invitationExpiresAt ? (
                        <Text c="dimmed" fz="xs">
                          invitation until {when.format(new Date(user.invitationExpiresAt))}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td c="dimmed" fz="sm">
                      {user.lastLoginAt ? when.format(new Date(user.lastLoginAt)) : 'never'}
                    </Table.Td>
                    <Table.Td pr="md">
                      {canWrite ? (
                        <Menu position="bottom-end" shadow="md" withinPortal>
                          <Menu.Target>
                            <ActionIcon
                              aria-label={`Actions for ${user.username}`}
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
                              Change
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              disabled={user.id === currentUserId}
                              leftSection={<IconKeyOff size={16} />}
                              onClick={() => {
                                setResetting(user);
                              }}
                            >
                              Reset credentials
                            </Menu.Item>
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
              Load more
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
    </>
  );
}
