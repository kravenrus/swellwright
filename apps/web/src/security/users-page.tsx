// The invite and change dialogs are adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only):
// src/shared/_modals/users/create-user-modal/create-user.modal.tsx, .../view-user-modal/view-user.modal.content.tsx and
// src/shared/ui/forms/users/forms-components/{user-indentity-creation-card,user-identification-card,
// contact-information-card,access-settings-card}.tsx. Changes: the fields are the ones a console user has (login name,
// role, status, display name, e-mail address), the cards enter with the panel's stagger, and the danger zone of the
// footer menu holds the credential reset and the deletion.
import {
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  px,
} from '@mantine/core';
import {
  IconFilterOff,
  IconKeyOff,
  IconLink,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { type ReactNode, type SyntheticEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiIdentification } from 'react-icons/hi';
import {
  PiEnvelopeDuotone,
  PiEnvelopeSimpleDuotone,
  PiFloppyDiskDuotone,
  PiIdentificationCardDuotone,
  PiProhibitDuotone,
  PiPulseDuotone,
  PiUserDuotone,
  PiUsersDuotone,
} from 'react-icons/pi';
import { TbCalendar, TbDots, TbMail, TbShield, TbUser, TbWifi } from 'react-icons/tb';

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
  HeaderAction,
  HeaderActionGroup,
  HeaderActions,
  MantineReactTable,
  type MRT_ColumnDef,
  MetricCard,
  ModalFooter,
  OverlayHeader,
  panelTableOptions,
  SectionCard,
  type StatusKind,
  StatusText,
  useMantineReactTable,
  useMrtTableState,
} from '@swellwright/ui';

import { createUser, deleteUser, listUsers, resetCredentials, updateUser } from '../api.js';
import { invitationLink } from '../auth/invitation.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useNumber } from '../format.js';
import { confirmAction, notifySuccess } from '../shell/feedback.js';
import { useIsMobile } from '../shell/use-is-mobile.js';
import { useTableLocalization } from '../tables.js';
import { notifyFailure } from './notify-failure.js';
import { useTimeFirst } from './time-first.js';
import { useLastDefined } from './use-last-defined.js';

const PAGE_SIZE = 100;

const STATE_KIND: Record<UserView['state'], StatusKind> = {
  active: 'ok',
  invited: 'info',
  disabled: 'wait',
};

/** The colour of the icon of the identification card (the panel colours it by status). */
const STATE_COLOR: Record<UserView['state'], string> = {
  active: 'teal',
  invited: 'blue',
  disabled: 'gray',
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
  const formatDate = useTimeFirst();
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

const MotionStack = motion.create(Stack);

/** The panel's user dialogs bring their cards in one after the other (`create-user.modal.tsx`). */
const CARD_COLUMN = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const CARD = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function Card({ children }: { children: ReactNode }) {
  return <motion.div variants={CARD}>{children}</motion.div>;
}

/**
 * The cards of a user dialog: two columns on a wide screen, one stack on a narrow one, as the panel lays out its
 * create and edit forms (`create-user.modal.tsx`, `view-user.modal.content.tsx`).
 */
function CardColumns({
  left,
  right,
  isMobile,
}: {
  left: ReactNode;
  right: ReactNode;
  isMobile: boolean;
}) {
  if (isMobile) {
    return (
      <MotionStack animate="visible" gap="md" initial="hidden" variants={CARD_COLUMN}>
        {left}
        {right}
      </MotionStack>
    );
  }
  return (
    <Group align="flex-start" gap="md" grow={false} wrap="wrap">
      <MotionStack
        animate="visible"
        gap="md"
        initial="hidden"
        style={{ flex: '1 1 450px' }}
        variants={CARD_COLUMN}
      >
        {left}
      </MotionStack>
      <MotionStack
        animate="visible"
        gap="md"
        initial="hidden"
        style={{ flex: '1 1 450px' }}
        variants={CARD_COLUMN}
      >
        {right}
      </MotionStack>
    </Group>
  );
}

/** The card with the login name of a new user (the panel's `UserIdentityCreationCard`). */
function IdentityCard({ children }: { children: ReactNode }) {
  const { t } = useTranslation('users');
  return (
    <Card>
      <SectionCard.Root>
        <SectionCard.Section>
          <OverlayHeader
            icon={HiIdentification}
            iconColor="blue"
            iconSize={20}
            title={t('cards.identity')}
            titleOrder={5}
          />
        </SectionCard.Section>
        <SectionCard.Section>{children}</SectionCard.Section>
      </SectionCard.Root>
    </Card>
  );
}

/** The display name and the e-mail address (the panel's `ContactInformationCard`). */
function ContactCard({
  displayName,
  email,
  emailError,
  onDisplayName,
  onEmail,
}: {
  displayName: string;
  email: string;
  emailError?: string | undefined;
  onDisplayName: (value: string) => void;
  onEmail: (value: string) => void;
}) {
  const { t } = useTranslation('users');
  return (
    <Card>
      <SectionCard.Root>
        <SectionCard.Section>
          <OverlayHeader
            icon={TbMail}
            iconColor="teal"
            iconSize={20}
            title={t('cards.contact')}
            titleOrder={5}
          />
        </SectionCard.Section>
        <SectionCard.Section>
          <Stack gap="md">
            <TextInput
              autoComplete="off"
              label={t('fields.displayName')}
              leftSection={<PiIdentificationCardDuotone size="16px" />}
              onChange={(e) => {
                onDisplayName(e.currentTarget.value);
              }}
              placeholder={t('fields.optional')}
              styles={{ label: { fontWeight: 500 } }}
              value={displayName}
            />
            <TextInput
              autoComplete="off"
              error={emailError}
              label={t('fields.email')}
              leftSection={<PiEnvelopeDuotone size="16px" />}
              onChange={(e) => {
                onEmail(e.currentTarget.value);
              }}
              placeholder={t('fields.optional')}
              styles={{ label: { fontWeight: 500 } }}
              value={email}
            />
          </Stack>
        </SectionCard.Section>
      </SectionCard.Root>
    </Card>
  );
}

/** The role, and for an existing user the status (the panel's `AccessSettingsCard`). */
function AccessCard({ children }: { children: ReactNode }) {
  const { t } = useTranslation('users');
  return (
    <Card>
      <SectionCard.Root>
        <SectionCard.Section>
          <OverlayHeader
            icon={TbShield}
            iconColor="indigo"
            iconSize={20}
            title={t('cards.access')}
            titleOrder={5}
          />
        </SectionCard.Section>
        <SectionCard.Section>
          <Stack gap="md">{children}</Stack>
        </SectionCard.Section>
      </SectionCard.Root>
    </Card>
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
      size={mutation.data ? 'md' : '1000px'}
      title={
        mutation.data ? (
          <OverlayHeader icon={IconLink} iconColor="teal" title={t('invitation.title')} />
        ) : (
          <OverlayHeader icon={IconUser} iconColor="teal" title={t('invite.title')} />
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
          <CardColumns
            isMobile={isMobile}
            left={
              <>
                <IdentityCard>
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
                    leftSection={<PiUserDuotone size="16px" />}
                    onChange={(e) => {
                      setUsername(e.currentTarget.value);
                    }}
                    required
                    value={username}
                  />
                </IdentityCard>
                <ContactCard
                  displayName={displayName}
                  email={email}
                  emailError={
                    touched && email.trim() && !check.success ? t('invite.emailError') : undefined
                  }
                  onDisplayName={setDisplayName}
                  onEmail={setEmail}
                />
              </>
            }
            right={
              <AccessCard>
                <Select
                  allowDeselect={false}
                  data={roleOptions}
                  description={t('invite.roleDescription')}
                  label={t('fields.role')}
                  leftSection={<TbShield size="16px" />}
                  onChange={(value) => {
                    setRole(asRole(value) ?? 'observer');
                  }}
                  value={role}
                />
              </AccessCard>
            }
          />
          <ModalFooter>
            <Button
              color="teal"
              leftSection={<PiFloppyDiskDuotone size="16px" />}
              loading={mutation.isPending}
              size="md"
              type="submit"
              variant="light"
            >
              {t('invite.submit')}
            </Button>
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
}

/** A small tinted tile of the identification card: the panel's coloured `Paper` with an icon and a value. */
function FactTile({
  border,
  background,
  tooltip,
  children,
}: {
  border: string;
  background: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <Paper bd={`1px solid ${border}`} bg={background} p="xs" radius="md">
      <Tooltip label={tooltip}>
        <Group gap="xs" justify="center" wrap="nowrap">
          {children}
        </Group>
      </Tooltip>
    </Paper>
  );
}

/**
 * Who the user is and when they were last seen, read-only: the panel's `UserIdentificationCard` (the id with the name
 * under it, the status, tinted tiles with the dates).
 */
function IdentificationCard({ user }: { user: UserView }) {
  const { t } = useTranslation(['users', 'common']);
  const formatTime = useTimeFirst();
  return (
    <Card>
      <SectionCard.Root>
        <SectionCard.Section>
          <Group align="center" justify="space-between" wrap="nowrap">
            <OverlayHeader
              icon={TbUser}
              iconColor={STATE_COLOR[user.state]}
              iconSize={20}
              subtitle={user.username}
              title={user.id}
              titleOrder={5}
              truncateTitle
              withCopy
            />
            <Box style={{ flexShrink: 0 }}>
              <StatusText kind={STATE_KIND[user.state]}>{t(`states.${user.state}`)}</StatusText>
            </Box>
          </Group>
        </SectionCard.Section>
        <SectionCard.Section>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
            <FactTile
              background="rgba(99, 102, 241, 0.08)"
              border="rgba(99, 102, 241, 0.2)"
              tooltip={t('identification.created')}
            >
              <TbCalendar color="var(--mantine-color-indigo-5)" size={18} />
              <Text c="indigo.5" fw={600} size="sm">
                {formatTime(user.createdAt)}
              </Text>
            </FactTile>
            <FactTile
              background="rgba(139, 92, 246, 0.08)"
              border="rgba(139, 92, 246, 0.2)"
              tooltip={t('identification.lastSignIn')}
            >
              <TbWifi color="var(--mantine-color-violet-4)" size={18} />
              <Text c="violet.4" fw={600} size="sm">
                {user.lastLoginAt ? formatTime(user.lastLoginAt) : t('common:never')}
              </Text>
            </FactTile>
            {user.invitationExpiresAt ? (
              <FactTile
                background="rgba(251, 191, 36, 0.10)"
                border="rgba(251, 191, 36, 0.2)"
                tooltip={t('identification.invitation')}
              >
                <IconLink color="var(--mantine-color-yellow-4)" size={18} />
                <Text c="yellow.4" fw={600} size="sm">
                  {formatTime(user.invitationExpiresAt)}
                </Text>
              </FactTile>
            ) : null}
          </SimpleGrid>
        </SectionCard.Section>
      </SectionCard.Root>
    </Card>
  );
}

function EditDialog({
  user,
  currentUserId,
  onClose,
  onDone,
  onReset,
  onDelete,
}: {
  user: UserView | undefined;
  currentUserId: string;
  onClose: () => void;
  onDone: () => void;
  onReset: (user: UserView) => void;
  onDelete: (user: UserView) => void;
}) {
  const isMobile = useIsMobile();
  const shown = useLastDefined(user);
  return (
    <Modal
      fullScreen={isMobile}
      onClose={onClose}
      opened={user !== undefined}
      size="1000px"
      title={<OverlayHeader icon={IconUser} iconColor="cyan" title={shown?.username ?? ''} />}
    >
      {shown ? (
        <EditForm
          key={shown.id}
          onClose={onClose}
          onDelete={onDelete}
          onDone={onDone}
          onReset={onReset}
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
  onReset,
  onDelete,
}: {
  user: UserView;
  self: boolean;
  onClose: () => void;
  onDone: () => void;
  onReset: (user: UserView) => void;
  onDelete: (user: UserView) => void;
}) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(
    user.state === 'disabled' ? 'disabled' : 'active',
  );
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [email, setEmail] = useState(user.email ?? '');

  const { t } = useTranslation(['users', 'common']);
  const isMobile = useIsMobile();
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
      <CardColumns
        isMobile={isMobile}
        left={
          <>
            <IdentificationCard user={user} />
            <ContactCard
              displayName={displayName}
              email={email}
              onDisplayName={setDisplayName}
              onEmail={setEmail}
            />
          </>
        }
        right={
          <AccessCard>
            <Select
              allowDeselect={false}
              data={roleOptions}
              description={self ? t('edit.roleSelf') : undefined}
              disabled={self}
              label={t('fields.role')}
              leftSection={<TbShield size="16px" />}
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
              leftSection={<PiPulseDuotone size="16px" />}
              onChange={(value) => {
                setStatus(asStatus(value) ?? 'active');
              }}
              value={status}
            />
          </AccessCard>
        }
      />
      <ModalFooter>
        <Menu keepMounted position="top-end" shadow="md">
          <Menu.Target>
            <Button color="gray" leftSection={<TbDots size={px('1.2rem')} />} size="md">
              {t('edit.moreActions')}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t('menu.dangerZone')}</Menu.Label>
            <Menu.Item
              color="red"
              disabled={self}
              leftSection={<IconKeyOff size={16} />}
              onClick={() => {
                onReset(user);
              }}
            >
              {t('menu.resetCredentials')}
            </Menu.Item>
            {user.state === 'disabled' && !self ? (
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => {
                  onDelete(user);
                }}
              >
                {t('menu.deleteUser')}
              </Menu.Item>
            ) : null}
          </Menu.Dropdown>
        </Menu>
        <Button
          color="teal"
          leftSection={<PiFloppyDiskDuotone size="16px" />}
          loading={mutation.isPending}
          size="md"
          type="submit"
          variant="soft"
        >
          {t('common:save')}
        </Button>
      </ModalFooter>
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
  const formatDate = useTimeFirst();
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
  const users = useMemo(() => list.data?.pages.flatMap((p) => p.users) ?? [], [list.data]);

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
  const removeUser = remove.mutate;
  const askDelete = useCallback(
    (user: UserView) => {
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
          removeUser(user);
        },
      });
    },
    [removeUser, t],
  );

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

  const roleOptions = useRoleOptions();
  const stateOptions = (Object.keys(STATE_KIND) as UserView['state'][]).map((value) => ({
    value,
    label: t(`states.${value}`),
  }));

  const columns = useMemo<MRT_ColumnDef<UserView>[]>(
    () => [
      {
        accessorKey: 'username',
        header: t('fields.loginName'),
        size: 220,
        minSize: 150,
        mantineTableBodyCellProps: { align: 'left' },
        columnFilterModeOptions: ['contains', 'equals', 'startsWith', 'endsWith'],
        enableColumnFilterModes: true,
        Cell: ({ row }) => (
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} size="sm">
              {row.original.username}
            </Text>
            {row.original.id === currentUserId ? (
              <Badge color="cyan" size="lg" variant="soft">
                {t('table.you')}
              </Badge>
            ) : null}
          </Group>
        ),
      },
      {
        accessorKey: 'displayName',
        header: t('fields.displayName'),
        size: 200,
        enableColumnFilterModes: false,
        Cell: ({ row }) => {
          const name = row.original.displayName;
          return name === null || name === '' ? '–' : name;
        },
      },
      {
        accessorKey: 'role',
        header: t('fields.role'),
        size: 170,
        filterVariant: 'select',
        mantineFilterSelectProps: { data: roleOptions },
        mantineTableBodyCellProps: { align: 'center' },
        enableColumnFilterModes: false,
        Cell: ({ row }) => (
          <Badge color="gray" size="lg" variant="soft">
            {t(`roles:names.${row.original.role}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'state',
        header: t('table.state'),
        size: 260,
        filterVariant: 'select',
        mantineFilterSelectProps: { data: stateOptions },
        mantineTableBodyCellProps: { align: 'center' },
        enableColumnFilterModes: false,
        Cell: ({ row }) => (
          <Stack align="center" gap={2}>
            <StatusText kind={STATE_KIND[row.original.state]}>
              {t(`states.${row.original.state}`)}
            </StatusText>
            {row.original.invitationExpiresAt ? (
              <Text c="dimmed" size="xs">
                {t('table.invitationUntil', { when: formatDate(row.original.invitationExpiresAt) })}
              </Text>
            ) : null}
          </Stack>
        ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: t('table.lastSignIn'),
        size: 250,
        enableColumnFilter: false,
        enableColumnFilterModes: false,
        mantineTableBodyCellProps: { align: 'center' },
        Cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <Text ff="monospace" size="sm">
              {formatDate(row.original.lastLoginAt)}
            </Text>
          ) : (
            <Text c="dimmed" size="sm">
              {t('common:never')}
            </Text>
          ),
      },
    ],
    // `roleOptions` and `stateOptions` follow `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, currentUserId, formatDate],
  );

  const tableState = useMrtTableState('users-v2');
  const localization = useTableLocalization(t('table.empty'));
  const table = useMantineReactTable<UserView>({
    ...panelTableOptions<UserView>(),
    enableColumnFilterModes: true,
    columns,
    data: users,
    localization,
    ...tableState.handlers,
    state: {
      ...tableState.state,
      isLoading: list.isPending,
      showAlertBanner: list.isError,
      showProgressBars: list.isFetching,
    },
    // The panel's failure state of a table: a red banner above the (empty) table.
    ...(list.isError
      ? {
          mantineToolbarAlertBannerProps: {
            color: 'red',
            children: describeError(t, list.error, t('signInAgain'), t('table.loadFailed')),
          },
        }
      : {}),
    getRowId: (user) => user.id,
    mantineTableBodyRowProps: ({ row }) =>
      canWrite
        ? {
            onClick: () => {
              setEditing(row.original);
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter' && event.target === event.currentTarget) {
                setEditing(row.original);
              }
            },
            tabIndex: 0,
            style: { cursor: 'pointer' },
          }
        : {},
  });

  const clearFilters = () => {
    table.resetColumnFilters(true);
  };
  const resetTable = () => {
    tableState.reset();
    table.resetColumnFilters(true);
  };

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, xs: 2, xl: 4 }} spacing="xs">
        {metrics.map(({ id, icon, color, title, value }, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 0 }}
            key={id}
            transition={{ duration: 0.2, delay: index * 0.07, ease: 'easeIn' }}
          >
            <MetricCard
              icon={icon}
              iconColor={color}
              isLoading={list.isPending}
              title={title}
              value={value}
              {...(more && id === 'total' ? { subtitle: t('metrics.loadedSoFar') } : {})}
            />
          </motion.div>
        ))}
      </SimpleGrid>

      <DataTableCard.Container>
        <DataTableCard.Title
          actions={
            <HeaderActions>
              <HeaderActionGroup>
                <HeaderAction
                  color="gray"
                  grouped
                  icon={IconFilterOff}
                  label={t('common:clearFilters')}
                  loading={list.isPending}
                  onClick={clearFilters}
                />
                <HeaderAction
                  color="gray"
                  grouped
                  icon={IconRestore}
                  label={t('common:resetTable')}
                  loading={list.isPending}
                  onClick={resetTable}
                />
              </HeaderActionGroup>
              <HeaderActionGroup>
                <HeaderAction
                  grouped
                  icon={IconRefresh}
                  label={t('common:refresh')}
                  loading={list.isPending || (list.isRefetching && !list.isFetchingNextPage)}
                  onClick={() => void list.refetch()}
                />
                {canWrite ? (
                  <HeaderAction
                    color="teal"
                    grouped
                    icon={IconPlus}
                    label={t('header.invite')}
                    onClick={() => {
                      setInviting(true);
                    }}
                  />
                ) : null}
              </HeaderActionGroup>
            </HeaderActions>
          }
          icon={<PiUsersDuotone size={24} />}
          title={t('header.title')}
        />
        <DataTableCard.Content>
          <MantineReactTable table={table} />
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
        onDelete={(user) => {
          setEditing(undefined);
          askDelete(user);
        }}
        onDone={() => void refresh()}
        onReset={(user) => {
          setEditing(undefined);
          setResetting(user);
        }}
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
