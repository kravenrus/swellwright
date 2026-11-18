import {
  Alert,
  Button,
  Card,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconApiApp,
  IconBan,
  IconCheck,
  IconCopy,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react';
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, type SyntheticEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type CreatedToken,
  type CreateTokenInput,
  CreateTokenRequestSchema,
  PERMISSION_INFO,
  type Permission,
  permissionsOf,
  TOKEN_DEFAULT_DAYS,
  TOKEN_GRANTABLE_PERMISSIONS,
  TOKEN_MAX_ACTIVE,
  TOKEN_MAX_DAYS,
  type TokenState,
  type TokenView,
  type UserRole,
} from '@swellwright/contracts';
import { PageHeader, type StatusKind, StatusText } from '@swellwright/ui';

import { createToken, listMyTokens, listTokens, revokeMyToken, revokeToken } from '../api.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useDateTime } from '../format.js';
import { useCatalogText } from './roles-page.js';

/** Matches the limit in `CreateTokenRequestSchema`; the whole request is checked against that schema as well. */
const NAME_MAX = 64;

const STATE_KIND: Record<TokenState, StatusKind> = {
  active: 'ok',
  expired: 'warn',
  revoked: 'wait',
};

type ResourceOf<P extends Permission> = P extends `${infer R}:${string}` ? R : never;
/** The part of a permission before the colon: `servers` for `servers:read`. */
type Resource = ResourceOf<Permission>;

/**
 * The resource of each permission, for the groups of the checklist. Typed against both sides: a permission added
 * to the contracts without a group here fails the build, and so does a resource without a text in `tokens`.
 */
const RESOURCE_OF = {
  'servers:read': 'servers',
  'servers:write': 'servers',
  'panel:read': 'panel',
  'panel:write': 'panel',
  'runs:read': 'runs',
  'runs:execute': 'runs',
  'vault:read': 'vault',
  'vault:manage': 'vault',
  'vault:reveal': 'vault',
  'terminal:use': 'terminal',
  'users:read': 'users',
  'users:write': 'users',
  'roles:read': 'roles',
  'audit:read': 'audit',
  'audit:verify': 'audit',
  'audit:export': 'audit',
  'sessions:read': 'sessions',
  'sessions:revoke': 'sessions',
  'tokens:create': 'tokens',
  'tokens:read': 'tokens',
  'tokens:revoke': 'tokens',
  'plugins:read': 'plugins',
  'plugins:manage': 'plugins',
} as const satisfies { readonly [P in Permission]: ResourceOf<P> };

interface PermissionGroup {
  readonly resource: Resource;
  readonly permissions: readonly Permission[];
}

/** The permissions in the order they are listed, grouped under their resource. */
function groupByResource(permissions: readonly Permission[]): PermissionGroup[] {
  const groups = new Map<Resource, Permission[]>();
  for (const permission of permissions) {
    const resource = RESOURCE_OF[permission];
    groups.set(resource, [...(groups.get(resource) ?? []), permission]);
  }
  return [...groups].map(([resource, list]) => ({ resource, permissions: list }));
}

/** The array behind `ipAllowlist` and one entry of it: the same checks as the server makes. */
const ADDRESS_LIST = CreateTokenRequestSchema.shape.ipAllowlist.unwrap();

/** One address or range per line, or separated by commas; empty lines and repeats are dropped. */
function parseAddresses(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/u).filter((part) => part.length > 0))];
}

/** `fallback` is what a refusal for lack of permission says, already translated. */
function ErrorNote({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useTranslation('tokens');
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
      {describeError(t, error, t('signInAgain'), fallback)}
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
 * The tokens as a table. A token has no end action unless it is active and the viewer may revoke it:
 * `onRevoke` is left out when the viewer may not revoke any of these.
 */
function TokensTable({
  tokens,
  kind,
  onRevoke,
}: {
  tokens: readonly TokenView[];
  kind: 'mine' | 'all';
  onRevoke: ((token: TokenView) => void) | undefined;
}) {
  const { t } = useTranslation('tokens');
  const formatDate = useDateTime('short');
  const showUser = kind === 'all';
  return (
    <Table.ScrollContainer minWidth={showUser ? 1120 : 1000}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            {showUser ? <Table.Th {...FIRST_COLUMN}>{t('columns.user')}</Table.Th> : null}
            <Table.Th {...(showUser ? {} : FIRST_COLUMN)}>{t('columns.name')}</Table.Th>
            <Table.Th>{t('columns.permissions')}</Table.Th>
            <Table.Th>{t('columns.addresses')}</Table.Th>
            <Table.Th>{t('columns.created')}</Table.Th>
            <Table.Th>{t('columns.expires')}</Table.Th>
            <Table.Th>{t('columns.lastUsed')}</Table.Th>
            <Table.Th>{t('columns.state')}</Table.Th>
            {onRevoke ? <Table.Th pr="md" /> : null}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tokens.map((token) => (
            <Table.Tr key={token.id}>
              {showUser ? (
                <Table.Td {...FIRST_COLUMN}>
                  <Text fw={500} fz="sm">
                    {token.username}
                  </Text>
                </Table.Td>
              ) : null}
              <Table.Td {...(showUser ? {} : FIRST_COLUMN)}>
                <Text fw={500} fz="sm">
                  {token.name}
                </Text>
                <Text c="dimmed" ff="monospace" fz="xs">
                  {token.prefix}…
                </Text>
              </Table.Td>
              <Table.Td>
                <Text fz="sm" style={{ whiteSpace: 'nowrap' }} title={token.permissions.join('\n')}>
                  {t('table.permissionCount', { count: token.permissions.length })}
                </Text>
              </Table.Td>
              <Table.Td>
                {token.ipAllowlist.length > 0 ? (
                  <Text
                    ff="monospace"
                    fz="sm"
                    maw={200}
                    title={token.ipAllowlist.join('\n')}
                    truncate="end"
                  >
                    {token.ipAllowlist.join(', ')}
                  </Text>
                ) : (
                  <Text c="dimmed" fz="sm">
                    {t('table.anywhere')}
                  </Text>
                )}
              </Table.Td>
              <Table.Td style={{ whiteSpace: 'nowrap' }} title={token.createdAt}>
                {formatDate(token.createdAt)}
              </Table.Td>
              <Table.Td style={{ whiteSpace: 'nowrap' }} title={token.expiresAt}>
                {formatDate(token.expiresAt)}
              </Table.Td>
              <Table.Td>
                {token.lastUsedAt ? (
                  <>
                    <Text fz="sm" style={{ whiteSpace: 'nowrap' }} title={token.lastUsedAt}>
                      {formatDate(token.lastUsedAt)}
                    </Text>
                    {token.lastUsedIp ? (
                      <Text c="dimmed" ff="monospace" fz="xs">
                        {token.lastUsedIp}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text c="dimmed" fz="sm">
                    {t('table.neverUsed')}
                  </Text>
                )}
              </Table.Td>
              <Table.Td
                title={
                  token.revokedAt
                    ? t('table.revokedOn', { when: formatDate(token.revokedAt) })
                    : undefined
                }
              >
                <StatusText kind={STATE_KIND[token.state]}>{t(`states.${token.state}`)}</StatusText>
              </Table.Td>
              {onRevoke ? (
                <Table.Td pr="md" style={{ textAlign: 'right' }}>
                  {token.state === 'active' ? (
                    <Button
                      aria-label={
                        showUser
                          ? t('table.revokeAriaOther', {
                              name: token.name,
                              username: token.username,
                            })
                          : t('table.revokeAria', { name: token.name })
                      }
                      leftSection={<IconBan size={14} />}
                      onClick={() => {
                        onRevoke(token);
                      }}
                      size="xs"
                      variant="default"
                    >
                      {t('table.revoke')}
                    </Button>
                  ) : null}
                </Table.Td>
              ) : null}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Asks before a token is revoked: it cannot be undone. `other` is set when the token is somebody else's. */
function RevokeDialog({
  token,
  other,
  loading,
  error,
  fallback,
  onClose,
  onConfirm,
}: {
  token: TokenView | undefined;
  other: boolean;
  loading: boolean;
  error: unknown;
  fallback: string;
  onClose: () => void;
  onConfirm: (token: TokenView) => void;
}) {
  const { t } = useTranslation(['tokens', 'common']);
  return (
    <Modal
      centered
      onClose={onClose}
      opened={token !== undefined}
      title={t('revoke.title', { name: token?.name ?? '' })}
    >
      <Stack gap="md">
        <Text fz="sm">
          {other
            ? t('revoke.warningOther', { username: token?.username ?? '' })
            : t('revoke.warning')}
        </Text>
        <ErrorNote error={error} fallback={fallback} />
        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">
            {t('common:cancel')}
          </Button>
          <Button
            color="red"
            leftSection={<IconBan size={16} />}
            loading={loading}
            onClick={() => {
              if (token) {
                onConfirm(token);
              }
            }}
          >
            {t('revoke.submit')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * The new token, shown once. Only its hash is kept, so the person has to say they saved it before the
 * dialog can be closed, like the recovery codes.
 */
function CreatedNotice({ created, onClose }: { created: CreatedToken; onClose: () => void }) {
  const { t } = useTranslation(['tokens', 'common']);
  const formatDate = useDateTime('short');
  const [saved, setSaved] = useState(false);
  const example = `curl -H "Authorization: Bearer ${created.token}" ${window.location.origin}/api/v1/auth/me`;
  return (
    <Stack gap="md">
      <Text fz="sm">
        {t('created.intro', {
          name: created.view.name,
          when: formatDate(created.view.expiresAt),
        })}
      </Text>
      <Alert
        color="yellow"
        icon={<IconAlertTriangle size={18} />}
        title={t('created.warningTitle')}
        variant="light"
      >
        <Text fz="sm">{t('created.warning')}</Text>
      </Alert>
      <Stack gap="xs">
        <TextInput
          label={t('created.valueLabel')}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          readOnly
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
          value={created.token}
        />
        <Group>
          <CopyButton value={created.token}>
            {({ copied, copy }) => (
              <Button
                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                onClick={copy}
                variant="default"
              >
                {copied ? t('common:copied') : t('created.copy')}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Stack>
      <Stack gap="xs">
        <Stack gap={0}>
          <Text fw={500} fz="sm">
            {t('created.exampleLabel')}
          </Text>
          <Text c="dimmed" fz="xs">
            {t('created.exampleHint')}
          </Text>
        </Stack>
        <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {example}
        </Code>
        <Group>
          <CopyButton value={example}>
            {({ copied, copy }) => (
              <Button
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                onClick={copy}
                size="xs"
                variant="default"
              >
                {copied ? t('common:copied') : t('created.copyExample')}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Stack>
      <Checkbox
        checked={saved}
        label={t('created.saved')}
        onChange={(e) => {
          setSaved(e.currentTarget.checked);
        }}
      />
      <Group justify="flex-end">
        <Button disabled={!saved} onClick={onClose}>
          {t('common:close')}
        </Button>
      </Group>
    </Stack>
  );
}

/** The form for a new token, and, once it is made, the one time its value is shown. */
function CreateDialog({
  opened,
  role,
  onClose,
}: {
  opened: boolean;
  role: UserRole;
  onClose: () => void;
}) {
  const { t } = useTranslation(['tokens', 'common']);
  const text = useCatalogText();
  const queryClient = useQueryClient();
  const step = useStepUp();
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | string>(TOKEN_DEFAULT_DAYS);
  const [addresses, setAddresses] = useState('');
  const [picked, setPicked] = useState<Permission[]>([]);
  const [touched, setTouched] = useState(false);

  // What a token may carry: what the role has, minus what needs a fresh code (a token has none to give).
  const available = useMemo(
    () =>
      TOKEN_GRANTABLE_PERMISSIONS.filter((permission) => permissionsOf(role).includes(permission)),
    [role],
  );
  const groups = useMemo(() => groupByResource(available), [available]);

  const list = parseAddresses(addresses);
  const invalid = list.filter((entry) => !ADDRESS_LIST.element.safeParse(entry).success);
  const addressError =
    invalid.length > 0
      ? t('create.addressesInvalid', { list: invalid.join(', ') })
      : ADDRESS_LIST.safeParse(list).success
        ? undefined
        : t('create.addressesTooMany');
  const daysNumber = typeof days === 'number' ? days : Number.NaN;
  const check = CreateTokenRequestSchema.safeParse({
    name,
    permissions: picked,
    expiresInDays: daysNumber,
    ipAllowlist: list,
  });
  const nameOk = CreateTokenRequestSchema.shape.name.safeParse(name).success;
  const daysOk = CreateTokenRequestSchema.shape.expiresInDays.safeParse(daysNumber).success;

  // The value of the token stays out of the cache once the dialog is closed (`gcTime: 0`).
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (request: CreateTokenInput) => step.run(() => createToken(request)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
  const created = mutation.data;

  const close = () => {
    mutation.reset();
    setName('');
    setDays(TOKEN_DEFAULT_DAYS);
    setAddresses('');
    setPicked([]);
    setTouched(false);
    onClose();
  };
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (check.success) {
      mutation.mutate(check.data);
    }
  };

  return (
    <Modal
      centered
      closeOnClickOutside={created === undefined}
      closeOnEscape={created === undefined}
      onClose={close}
      opened={opened}
      size="lg"
      title={created ? t('created.title') : t('create.title')}
      withCloseButton={created === undefined}
    >
      {created ? (
        <CreatedNotice created={created} onClose={close} />
      ) : (
        <form onSubmit={submit}>
          <Stack gap="md">
            <TextInput
              autoComplete="off"
              data-autofocus
              description={t('create.nameDescription')}
              error={touched && !nameOk ? t('create.nameError', { max: NAME_MAX }) : undefined}
              label={t('create.nameLabel')}
              onChange={(e) => {
                setName(e.currentTarget.value);
              }}
              required
              value={name}
            />
            <NumberInput
              allowDecimal={false}
              allowNegative={false}
              description={t('create.expiresDescription', { max: TOKEN_MAX_DAYS })}
              error={
                touched && !daysOk ? t('create.expiresError', { max: TOKEN_MAX_DAYS }) : undefined
              }
              label={t('create.expiresLabel')}
              max={TOKEN_MAX_DAYS}
              min={1}
              onChange={setDays}
              required
              value={days}
            />
            <Textarea
              autoComplete="off"
              autosize
              description={t('create.addressesDescription')}
              error={touched ? addressError : undefined}
              label={t('create.addressesLabel')}
              maxRows={6}
              minRows={2}
              onChange={(e) => {
                setAddresses(e.currentTarget.value);
              }}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
              value={addresses}
            />
            {available.length === 0 ? (
              <Text c="dimmed" fz="sm">
                {t('create.permissionsEmpty')}
              </Text>
            ) : (
              <Checkbox.Group
                description={t('create.permissionsDescription')}
                error={touched && picked.length === 0 ? t('create.permissionsError') : undefined}
                label={t('create.permissionsLabel')}
                onChange={(values) => {
                  setPicked(available.filter((permission) => values.includes(permission)));
                }}
                value={picked}
              >
                <Stack gap="sm" mt="xs">
                  {groups.map((group) => (
                    <Stack gap={6} key={group.resource}>
                      <Text fw={600} fz="sm">
                        {t(`resources.${group.resource}`)}
                      </Text>
                      {group.permissions.map((permission) => (
                        <Checkbox
                          description={text.permissionDescription(
                            permission,
                            PERMISSION_INFO[permission],
                          )}
                          key={permission}
                          label={
                            <Text component="span" ff="monospace" fz="sm">
                              {permission}
                            </Text>
                          }
                          value={permission}
                        />
                      ))}
                    </Stack>
                  ))}
                </Stack>
              </Checkbox.Group>
            )}
            <ErrorNote error={mutation.error} fallback={t('create.forbidden')} />
            <Group justify="flex-end">
              <Button onClick={close} variant="default">
                {t('common:cancel')}
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                loading={mutation.isPending}
                type="submit"
              >
                {t('create.submit')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}

/** Your own tokens: any signed-in user may list and revoke them, and with `tokens:create` make more. */
function MyTokens({ role, canCreate }: { role: UserRole; canCreate: boolean }) {
  const { t } = useTranslation(['tokens', 'common']);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<TokenView | undefined>(undefined);
  const list = useQuery({ queryKey: ['tokens', 'mine'], queryFn: listMyTokens, retry: false });
  const revoke = useMutation({
    mutationFn: (token: TokenView) => revokeMyToken(token.id),
    onSuccess: () => {
      setConfirming(undefined);
      return queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
  });

  const tokens = list.data?.tokens ?? [];
  const closeConfirm = () => {
    revoke.reset();
    setConfirming(undefined);
  };

  return (
    <Stack gap="sm">
      <SectionHeader
        actions={
          canCreate ? (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t('mine.create')}
            </Button>
          ) : undefined
        }
        description={t('mine.description', { max: TOKEN_MAX_ACTIVE })}
        title={t('mine.title')}
      />
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
        ) : tokens.length === 0 ? (
          <Stack gap={2} p="md">
            <Text c="dimmed" fz="sm">
              {t('mine.empty')}
            </Text>
            {canCreate ? (
              <Text c="dimmed" fz="sm">
                {t('mine.emptyHint')}
              </Text>
            ) : null}
          </Stack>
        ) : (
          <>
            <TokensTable kind="mine" onRevoke={setConfirming} tokens={tokens} />
            <Text c="dimmed" fz="xs" p="md">
              {t('mine.valueNote')}
            </Text>
          </>
        )}
      </Card>

      <CreateDialog
        onClose={() => {
          setCreating(false);
        }}
        opened={creating}
        role={role}
      />
      <RevokeDialog
        error={revoke.error}
        fallback={t('mine.revokeForbidden')}
        loading={revoke.isPending}
        onClose={closeConfirm}
        onConfirm={(token) => {
          revoke.mutate(token);
        }}
        other={false}
        token={confirming}
      />
    </Stack>
  );
}

/** The tokens of every user (`tokens:read`). Revoking them needs `tokens:revoke` and a fresh code. */
function AllTokens({ canRevoke }: { canRevoke: boolean }) {
  const { t } = useTranslation(['tokens', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const [userId, setUserId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TokenView | undefined>(undefined);
  const list = useQuery({
    queryKey: ['tokens', 'all'],
    queryFn: () => listTokens({}),
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: (token: TokenView) => step.run(() => revokeToken(token.id)),
    onSuccess: () => {
      setConfirming(undefined);
      return queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
  });

  const all = list.data?.tokens;
  // The users for the filter come from the tokens themselves: someone without a token has nothing to show.
  const users = useMemo(() => {
    const names = new Map<string, string>();
    for (const token of all ?? []) {
      names.set(token.userId, token.username);
    }
    return [...names]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);
  const selected = users.find((user) => user.value === userId);
  const shown = selected
    ? (all ?? []).filter((token) => token.userId === selected.value)
    : (all ?? []);
  const closeConfirm = () => {
    revoke.reset();
    setConfirming(undefined);
  };

  return (
    <Stack gap="sm">
      <SectionHeader description={t('all.description')} title={t('all.title')} />
      <Card padding={0}>
        <Group gap="sm" p="md">
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
          <TokensTable kind="all" onRevoke={canRevoke ? setConfirming : undefined} tokens={shown} />
        )}
      </Card>

      <RevokeDialog
        error={revoke.error}
        fallback={t('all.revokeForbidden')}
        loading={revoke.isPending}
        onClose={closeConfirm}
        onConfirm={(token) => {
          revoke.mutate(token);
        }}
        other
        token={confirming}
      />
    </Stack>
  );
}

/**
 * The API tokens. Everyone sees and can revoke their own, and with `tokens:create` makes more; seeing everyone's
 * needs `tokens:read`, and revoking theirs needs `tokens:revoke` and a fresh confirmation with a code.
 */
export function TokensPage({
  role,
  permissions,
}: {
  role: UserRole;
  permissions: readonly Permission[];
}) {
  const { t } = useTranslation(['tokens', 'common']);
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['tokens'] }) > 0;

  return (
    <>
      <PageHeader
        actions={
          <Button
            leftSection={<IconRefresh size={16} />}
            loading={fetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['tokens'] })}
            variant="default"
          >
            {t('common:refresh')}
          </Button>
        }
        description={t('header.description')}
        icon={<IconApiApp size={22} />}
        title={t('header.title')}
      />

      <Stack gap="xl">
        <MyTokens canCreate={permissions.includes('tokens:create')} role={role} />
        {permissions.includes('tokens:read') ? (
          <AllTokens canRevoke={permissions.includes('tokens:revoke')} />
        ) : null}
      </Stack>
    </>
  );
}
