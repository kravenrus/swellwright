import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  PasswordInput,
  Progress,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconDots,
  IconEye,
  IconKey,
  IconLock,
  IconLockOpen,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CreateSecretRequestSchema,
  type Permission,
  SECRET_TYPES,
  type SecretType,
  type SecretView,
  VAULT_PASSPHRASE_MIN_LENGTH,
  type VaultInitialized,
  type VaultStatus,
} from '@swellwright/contracts';
import { PageHeader, StatusBadge } from '@swellwright/ui';

import {
  createSecret,
  deleteSecret,
  getVaultStatus,
  initializeVault,
  listSecrets,
  revealSecret,
  sealVault,
  unsealVault,
  updateSecret,
} from '../api.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useDateTime } from '../format.js';

const HIDE_AFTER_SECONDS = 30;
const SOON_MS = 30 * 24 * 3_600_000;

/** A date without the time (`12 Nov 2026`), in the language of the console. An expiry is a day, not a moment. */
function useDay(): (value: string | number | Date) => string {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
    return (value) => format.format(new Date(value));
  }, [language]);
}

/** The kinds of secret for a select, named in the language of the console. */
function useTypeOptions() {
  const { t } = useTranslation('vault');
  return SECRET_TYPES.map((value) => ({ value, label: t(`types.${value}`) }));
}

const asType = (value: string | null): SecretType | null =>
  SECRET_TYPES.find((known) => known === value) ?? null;

function ErrorNote({
  error,
  fallback,
  unauthorized,
}: {
  error: unknown;
  /** What a refusal for lack of permission says, already translated. */
  fallback: string;
  /** What a 401 says, already translated: on most calls the session ended, when unsealing it is a wrong passphrase. */
  unauthorized?: string;
}) {
  const { t } = useTranslation('vault');
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
      {describeError(t, error, unauthorized ?? t('signInAgain'), fallback)}
    </Alert>
  );
}

/** Length is what counts (docs/en/design/05-security.md): a bar for how far the passphrase is from comfortable. */
function Strength({ length }: { length: number }) {
  const { t } = useTranslation('vault');
  const percent = Math.min(100, Math.round((length / 24) * 100));
  const color = length < VAULT_PASSPHRASE_MIN_LENGTH ? 'red' : length < 24 ? 'yellow' : 'teal';
  return (
    <Stack gap={4}>
      <Progress color={color} size="xs" value={percent} />
      <Text c="dimmed" fz="xs">
        {length < VAULT_PASSPHRASE_MIN_LENGTH
          ? t('strength.tooShort', { count: VAULT_PASSPHRASE_MIN_LENGTH })
          : length < 24
            ? t('strength.acceptable')
            : t('strength.long')}
      </Text>
    </Stack>
  );
}

function SetupVault({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(['vault', 'common']);
  const step = useStepUp();
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: () => step.run(() => initializeVault({ passphrase })),
    onSuccess: () => {
      setPassphrase('');
      setRepeat('');
    },
  });
  const created: VaultInitialized | undefined = mutation.data;
  const valid = passphrase.length >= VAULT_PASSPHRASE_MIN_LENGTH && passphrase === repeat;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (valid) {
      mutation.mutate();
    }
  };

  if (created) {
    return (
      <Card padding="lg">
        <Stack gap="md">
          <Alert
            color="yellow"
            icon={<IconKey size={18} />}
            title={t('recoveryKey.title')}
            variant="light"
          >
            <Text fz="sm">{t('recoveryKey.warning')}</Text>
          </Alert>
          <Code block style={{ fontSize: 'var(--mantine-font-size-md)', wordBreak: 'break-all' }}>
            {created.recoveryKey}
          </Code>
          <CopyButton value={created.recoveryKey}>
            {({ copied, copy }) => (
              <Button
                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                onClick={copy}
                variant="default"
              >
                {copied ? t('common:copied') : t('recoveryKey.copy')}
              </Button>
            )}
          </CopyButton>
          <Checkbox
            checked={saved}
            label={t('recoveryKey.storedLabel')}
            onChange={(e) => {
              setSaved(e.currentTarget.checked);
            }}
          />
          <Group justify="flex-end">
            <Button disabled={!saved} onClick={onDone}>
              {t('recoveryKey.open')}
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text fw={600}>{t('setup.title')}</Text>
          <Text c="dimmed" fz="sm">
            {t('setup.intro')}
          </Text>
          <PasswordInput
            autoComplete="new-password"
            data-autofocus
            label={t('setup.passphraseLabel')}
            onChange={(e) => {
              setPassphrase(e.currentTarget.value);
            }}
            required
            value={passphrase}
          />
          <Strength length={passphrase.length} />
          <PasswordInput
            autoComplete="new-password"
            error={repeat.length > 0 && repeat !== passphrase ? t('setup.mismatch') : undefined}
            label={t('setup.repeatLabel')}
            onChange={(e) => {
              setRepeat(e.currentTarget.value);
            }}
            required
            value={repeat}
          />
          <ErrorNote error={mutation.error} fallback={t('setup.forbidden')} />
          <Group justify="flex-end">
            <Button
              leftSection={<IconLock size={16} />}
              loading={mutation.isPending}
              disabled={!valid}
              type="submit"
            >
              {t('setup.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}

function Unseal({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('vault');
  const step = useStepUp();
  const [recovery, setRecovery] = useState(false);
  const [text, setText] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      step.run(() => unsealVault(recovery ? { recoveryKey: text } : { passphrase: text })),
    onSuccess: () => {
      setText('');
      onDone();
    },
    onError: () => {
      setText('');
    },
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (text.length > 0) {
      mutation.mutate();
    }
  };

  return (
    <Stack gap="md">
      <Alert color="yellow" icon={<IconLock size={18} />} title={t('sealed.title')} variant="light">
        <Text fz="sm">{t('unseal.notice')}</Text>
      </Alert>
      <Card padding="lg">
        <form onSubmit={submit}>
          <Stack gap="md">
            {recovery ? (
              <TextInput
                autoComplete="off"
                data-autofocus
                description={t('unseal.recoveryKeyDescription')}
                label={t('unseal.recoveryKeyLabel')}
                onChange={(e) => {
                  setText(e.currentTarget.value);
                }}
                value={text}
              />
            ) : (
              <PasswordInput
                autoComplete="off"
                data-autofocus
                label={t('unseal.passphraseLabel')}
                onChange={(e) => {
                  setText(e.currentTarget.value);
                }}
                value={text}
              />
            )}
            <ErrorNote
              error={mutation.error}
              fallback={t('unseal.forbidden')}
              unauthorized={recovery ? t('unseal.wrongRecoveryKey') : t('unseal.wrongPassphrase')}
            />
            <Group justify="space-between">
              <Anchor
                component="button"
                fz="sm"
                onClick={() => {
                  setRecovery(!recovery);
                  setText('');
                  mutation.reset();
                }}
                type="button"
              >
                {recovery ? t('unseal.usePassphrase') : t('unseal.useRecoveryKey')}
              </Anchor>
              <Button
                leftSection={<IconLockOpen size={16} />}
                loading={mutation.isPending}
                type="submit"
              >
                {t('unseal.submit')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}

/** The value, for a short while. It is cleared when the dialog closes or the time is up. */
function RevealDialog({
  secret,
  onClose,
}: {
  secret: SecretView | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation(['vault', 'common']);
  const step = useStepUp();
  // The moment the value is hidden again, counted from when it arrived.
  const [deadline, setDeadline] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const mutation = useMutation({
    mutationFn: (id: string) => step.run(() => revealSecret(id)),
    onSuccess: () => {
      setNow(Date.now());
      setDeadline(Date.now() + HIDE_AFTER_SECONDS * 1000);
    },
  });
  const { mutate, reset, data } = mutation;

  useEffect(() => {
    if (secret) {
      mutate(secret.id);
    }
    return () => {
      reset();
      setDeadline(undefined);
    };
  }, [secret, mutate, reset]);

  useEffect(() => {
    if (deadline === undefined) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (Date.now() >= deadline) {
        onClose();
      }
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [deadline, onClose]);
  const left = deadline === undefined ? HIDE_AFTER_SECONDS : Math.ceil((deadline - now) / 1000);

  return (
    <Modal centered onClose={onClose} opened={secret !== undefined} title={secret?.name ?? ''}>
      <Stack gap="md">
        {data ? (
          <>
            <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
              {data.value}
            </Code>
            <Group justify="space-between">
              <CopyButton value={data.value}>
                {({ copied, copy }) => (
                  <Button
                    leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    onClick={copy}
                    variant="default"
                  >
                    {copied ? t('common:copied') : t('common:copy')}
                  </Button>
                )}
              </CopyButton>
              <Text c="dimmed" fz="sm">
                {t('reveal.hiddenIn', { count: Math.max(left, 0) })}
              </Text>
            </Group>
          </>
        ) : mutation.error ? (
          <ErrorNote error={mutation.error} fallback={t('reveal.forbidden')} />
        ) : (
          <Skeleton h={60} />
        )}
        <Group justify="flex-end">
          <Button onClick={onClose}>{t('common:close')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function SecretForm({
  secret,
  onClose,
  onDone,
}: {
  secret: SecretView | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['vault', 'common']);
  const typeOptions = useTypeOptions();
  const step = useStepUp();
  const [name, setName] = useState(secret?.name ?? '');
  const [type, setType] = useState<SecretType>(secret?.type ?? 'generic');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState(secret?.description ?? '');
  const [expires, setExpires] = useState(secret?.expiresAt?.slice(0, 10) ?? '');
  const expiresAt = expires ? new Date(`${expires}T00:00:00.000Z`).toISOString() : undefined;

  const mutation = useMutation({
    mutationFn: () =>
      step.run(() =>
        secret
          ? updateSecret(secret.id, {
              name: name.trim(),
              description: description.trim() || null,
              expiresAt: expiresAt ?? null,
              ...(value.length > 0 ? { value } : {}),
            })
          : createSecret({
              name: name.trim(),
              type,
              value,
              ...(description.trim() ? { description: description.trim() } : {}),
              ...(expiresAt ? { expiresAt } : {}),
            }),
      ),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const check = CreateSecretRequestSchema.safeParse({
    name: name.trim(),
    type,
    value: value || 'x',
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (check.success && (secret || value.length > 0)) {
      mutation.mutate();
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <TextInput
          autoComplete="off"
          data-autofocus
          label={t('form.name')}
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          required
          value={name}
        />
        <Select
          allowDeselect={false}
          data={typeOptions}
          description={secret ? t('form.kindLocked') : undefined}
          disabled={secret !== undefined}
          label={t('form.kind')}
          onChange={(v) => {
            setType(asType(v) ?? 'generic');
          }}
          value={type}
        />
        <Textarea
          autoComplete="off"
          autosize
          description={secret ? t('form.valueHintEdit') : t('form.valueHintCreate')}
          label={secret ? t('form.newValue') : t('form.value')}
          maxRows={8}
          minRows={3}
          onChange={(e) => {
            setValue(e.currentTarget.value);
          }}
          required={secret === undefined}
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
          value={value}
        />
        <TextInput
          label={t('form.description')}
          onChange={(e) => {
            setDescription(e.currentTarget.value);
          }}
          value={description}
        />
        <TextInput
          description={t('form.expiresHint')}
          label={t('form.expiresOn')}
          onChange={(e) => {
            setExpires(e.currentTarget.value);
          }}
          type="date"
          value={expires}
        />
        <ErrorNote error={mutation.error} fallback={t('form.forbidden')} />
        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">
            {t('common:cancel')}
          </Button>
          <Button loading={mutation.isPending} type="submit">
            {secret ? t('common:save') : t('form.submitCreate')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function DeleteDialog({
  secret,
  onClose,
  onDone,
}: {
  secret: SecretView | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['vault', 'common']);
  const step = useStepUp();
  const mutation = useMutation({
    mutationFn: (id: string) => step.run(() => deleteSecret(id)),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const close = () => {
    mutation.reset();
    onClose();
  };
  return (
    <Modal
      centered
      onClose={close}
      opened={secret !== undefined}
      title={t('delete.title', { name: secret?.name ?? '' })}
    >
      <Stack gap="md">
        <Text fz="sm">{t('delete.warning')}</Text>
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
              if (secret) {
                mutation.mutate(secret.id);
              }
            }}
          >
            {t('common:delete')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function expiryState(secret: SecretView): 'none' | 'ok' | 'soon' | 'expired' {
  if (!secret.expiresAt) {
    return 'none';
  }
  const left = Date.parse(secret.expiresAt) - Date.now();
  return left <= 0 ? 'expired' : left < SOON_MS ? 'soon' : 'ok';
}

/** The vault: set it up, unseal it, keep secrets. Values are write-only except through a recorded reveal. */
export function VaultPage({ permissions }: { permissions: readonly Permission[] }) {
  const { t } = useTranslation(['vault', 'common']);
  const formatDay = useDay();
  const formatTime = useDateTime('short');
  const queryClient = useQueryClient();
  const canManage = permissions.includes('vault:manage');
  const canReveal = permissions.includes('vault:reveal');
  const step = useStepUp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SecretView | undefined>(undefined);
  const [revealing, setRevealing] = useState<SecretView | undefined>(undefined);
  const [deleting, setDeleting] = useState<SecretView | undefined>(undefined);

  const state = useQuery({ queryKey: ['vault', 'status'], queryFn: getVaultStatus, retry: false });
  const secrets = useQuery({ queryKey: ['vault', 'secrets'], queryFn: listSecrets, retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['vault'] });
  const seal = useMutation({
    mutationFn: () => step.run(() => sealVault()),
    onSuccess: refresh,
  });

  const status: VaultStatus | undefined = state.data;
  const open = status?.state === 'unsealed';

  const stateBadge =
    status === undefined ? undefined : status.state === 'unsealed' ? (
      <StatusBadge kind="ok">{t('states.unsealed')}</StatusBadge>
    ) : status.state === 'sealed' ? (
      <StatusBadge kind="warn">{t('states.sealed')}</StatusBadge>
    ) : (
      <StatusBadge kind="wait">{t('states.uninitialized')}</StatusBadge>
    );

  const header = (
    <PageHeader
      actions={
        <>
          <Button
            leftSection={<IconRefresh size={16} />}
            loading={state.isRefetching || secrets.isRefetching}
            onClick={() => void refresh()}
            variant="default"
          >
            {t('common:refresh')}
          </Button>
          {canManage && open ? (
            <>
              <Button
                leftSection={<IconLock size={16} />}
                loading={seal.isPending}
                onClick={() => {
                  seal.mutate();
                }}
                variant="default"
              >
                {t('header.sealNow')}
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  setAdding(true);
                }}
              >
                {t('header.addSecret')}
              </Button>
            </>
          ) : null}
        </>
      }
      badges={stateBadge}
      description={t('header.description')}
      icon={<IconKey size={22} />}
      title={t('header.title')}
    />
  );

  if (state.isPending) {
    return (
      <>
        {header}
        <Skeleton h={120} />
      </>
    );
  }
  if (state.isError || !status) {
    return (
      <>
        {header}
        <Alert color="red" variant="light">
          {describeError(t, state.error, t('signInAgain'), t('list.statusFailed'))}
        </Alert>
      </>
    );
  }
  if (status.state === 'uninitialized') {
    return (
      <>
        {header}
        {canManage ? (
          <SetupVault
            onDone={() => {
              void refresh();
            }}
          />
        ) : (
          <Alert color="gray" variant="light">
            {t('setup.ownerNeeded')}
          </Alert>
        )}
      </>
    );
  }

  const list = secrets.data?.secrets ?? [];
  return (
    <>
      {header}
      {seal.error ? (
        <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
          <ErrorNote error={seal.error} fallback={t('seal.forbidden')} />
        </div>
      ) : null}
      {status.state === 'sealed' ? (
        canManage ? (
          <Unseal
            onDone={() => {
              void refresh();
            }}
          />
        ) : (
          <Alert
            color="yellow"
            icon={<IconLock size={18} />}
            title={t('sealed.title')}
            variant="light"
          >
            {t('sealed.ownerNeeded')}
          </Alert>
        )
      ) : null}

      <SimpleGrid
        cols={{ base: 1, sm: 3 }}
        mb="md"
        mt={status.state === 'sealed' ? 'md' : 0}
        spacing="md"
      >
        <Card padding="md">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size={40} variant="soft">
              <IconKey size={20} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text c="dimmed" fw={500} fz="sm">
                {t('summary.secrets')}
              </Text>
              <Text fw={600} fz="lg">
                {status.secretCount}
              </Text>
            </Stack>
          </Group>
        </Card>
        <Card padding="md">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size={40} variant="soft">
              <IconLock size={20} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text c="dimmed" fw={500} fz="sm">
                {t('summary.keyVersion')}
              </Text>
              <Text fw={600} fz="lg">
                {status.kekVersion ?? '—'}
              </Text>
            </Stack>
          </Group>
        </Card>
        <Card padding="md">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size={40} variant="soft">
              <IconLockOpen size={20} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text c="dimmed" fw={500} fz="sm">
                {t('summary.setUp')}
              </Text>
              <Text fw={600} fz="lg">
                {status.createdAt ? formatDay(status.createdAt) : '—'}
              </Text>
            </Stack>
          </Group>
        </Card>
      </SimpleGrid>

      <Card padding={0}>
        {secrets.isPending ? (
          <Stack gap="xs" p="md">
            <Skeleton h={28} />
            <Skeleton h={28} />
          </Stack>
        ) : secrets.isError ? (
          <Alert color="red" m="md" variant="light">
            {describeError(t, secrets.error, t('signInAgain'), t('list.loadFailed'))}
          </Alert>
        ) : list.length === 0 ? (
          <Text c="dimmed" fz="sm" p="md">
            {canManage && open ? t('list.emptyCanAdd') : t('list.empty')}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th pl="md">{t('list.name')}</Table.Th>
                  <Table.Th>{t('list.kind')}</Table.Th>
                  <Table.Th>{t('list.version')}</Table.Th>
                  <Table.Th>{t('list.expires')}</Table.Th>
                  <Table.Th>{t('list.valueChanged')}</Table.Th>
                  <Table.Th pr="md" w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((secret) => {
                  const expiry = expiryState(secret);
                  const expiresDay = secret.expiresAt ? formatDay(secret.expiresAt) : '';
                  return (
                    <Table.Tr key={secret.id}>
                      <Table.Td pl="md">
                        <Text fw={500} fz="sm">
                          {secret.name}
                        </Text>
                        {secret.description ? (
                          <Text c="dimmed" fz="xs">
                            {secret.description}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        <Badge color="gray" variant="light">
                          {t(`types.${secret.type}`)}
                        </Badge>
                      </Table.Td>
                      <Table.Td c="dimmed" fz="sm">
                        v{secret.version}
                      </Table.Td>
                      <Table.Td fz="sm">
                        {expiry === 'none' ? (
                          <Text c="dimmed" component="span">
                            {t('common:never')}
                          </Text>
                        ) : (
                          <Text
                            {...(expiry === 'expired'
                              ? { c: 'red' }
                              : expiry === 'soon'
                                ? { c: 'yellow' }
                                : {})}
                            component="span"
                          >
                            {expiry === 'expired'
                              ? t('list.expired', { date: expiresDay })
                              : expiry === 'soon'
                                ? t('list.soon', { date: expiresDay })
                                : expiresDay}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td c="dimmed" fz="sm">
                        {formatTime(secret.valueChangedAt)}
                      </Table.Td>
                      <Table.Td pr="md">
                        {canManage || canReveal ? (
                          <Menu position="bottom-end" shadow="md" withinPortal>
                            <Menu.Target>
                              <ActionIcon
                                aria-label={t('list.actionsFor', { name: secret.name })}
                                color="gray"
                                variant="subtle"
                              >
                                <IconDots size={18} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {canReveal ? (
                                <Menu.Item
                                  disabled={!open}
                                  leftSection={<IconEye size={16} />}
                                  onClick={() => {
                                    setRevealing(secret);
                                  }}
                                >
                                  {t('menu.reveal')}
                                </Menu.Item>
                              ) : null}
                              {canManage ? (
                                <>
                                  <Menu.Item
                                    leftSection={<IconPencil size={16} />}
                                    onClick={() => {
                                      setEditing(secret);
                                    }}
                                  >
                                    {t('menu.change')}
                                  </Menu.Item>
                                  <Menu.Item
                                    color="red"
                                    leftSection={<IconTrash size={16} />}
                                    onClick={() => {
                                      setDeleting(secret);
                                    }}
                                  >
                                    {t('common:delete')}
                                  </Menu.Item>
                                </>
                              ) : null}
                            </Menu.Dropdown>
                          </Menu>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Modal
        centered
        onClose={() => {
          setAdding(false);
        }}
        opened={adding}
        title={t('form.addTitle')}
      >
        {adding ? (
          <SecretForm
            onClose={() => {
              setAdding(false);
            }}
            onDone={() => void refresh()}
            secret={undefined}
          />
        ) : null}
      </Modal>
      <Modal
        centered
        onClose={() => {
          setEditing(undefined);
        }}
        opened={editing !== undefined}
        title={t('form.editTitle', { name: editing?.name ?? '' })}
      >
        {editing ? (
          <SecretForm
            key={editing.id}
            onClose={() => {
              setEditing(undefined);
            }}
            onDone={() => void refresh()}
            secret={editing}
          />
        ) : null}
      </Modal>
      <RevealDialog
        onClose={() => {
          setRevealing(undefined);
        }}
        secret={revealing}
      />
      <DeleteDialog
        onClose={() => {
          setDeleting(undefined);
        }}
        onDone={() => void refresh()}
        secret={deleting}
      />
    </>
  );
}
