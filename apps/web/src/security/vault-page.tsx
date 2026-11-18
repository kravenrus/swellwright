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
import { type SyntheticEvent, useEffect, useState } from 'react';

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

const HIDE_AFTER_SECONDS = 30;
const SOON_MS = 30 * 24 * 3_600_000;

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dayOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const TYPE_LABEL: Record<SecretType, string> = {
  panel_token: 'Panel token',
  ssh_key: 'SSH key',
  ssh_password: 'SSH password',
  ssh_ca: 'SSH CA',
  dns_oauth: 'DNS OAuth',
  provider_token: 'Provider token',
  telegram: 'Telegram',
  generic: 'Generic',
};
const typeOptions = SECRET_TYPES.map((value) => ({ value, label: TYPE_LABEL[value] }));
const asType = (value: string | null): SecretType | null =>
  SECRET_TYPES.find((known) => known === value) ?? null;

function ErrorNote({
  error,
  fallback,
  unauthorized = 'Sign in again to continue.',
}: {
  error: unknown;
  /** What a refusal for lack of permission says. */
  fallback: string;
  /** What a 401 says: on most calls the session ended, when unsealing it is a wrong passphrase. */
  unauthorized?: string;
}) {
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
      {describeError(error, unauthorized, fallback)}
    </Alert>
  );
}

/** Length is what counts (docs/en/design/05-security.md): a bar for how far the passphrase is from comfortable. */
function Strength({ length }: { length: number }) {
  const percent = Math.min(100, Math.round((length / 24) * 100));
  const color = length < VAULT_PASSPHRASE_MIN_LENGTH ? 'red' : length < 24 ? 'yellow' : 'teal';
  return (
    <Stack gap={4}>
      <Progress color={color} size="xs" value={percent} />
      <Text c="dimmed" fz="xs">
        {length < VAULT_PASSPHRASE_MIN_LENGTH
          ? `At least ${String(VAULT_PASSPHRASE_MIN_LENGTH)} characters. Words in a row are fine.`
          : length < 24
            ? 'Acceptable. A longer phrase is better.'
            : 'Long enough.'}
      </Text>
    </Stack>
  );
}

function SetupVault({ onDone }: { onDone: () => void }) {
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
            title="Save the recovery key now"
            variant="light"
          >
            <Text fz="sm">
              It opens the vault if you lose the passphrase, and nothing else can. It is shown once
              and kept nowhere on this server. Write it down or put it in a password manager, away
              from this machine.
            </Text>
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
                {copied ? 'Copied' : 'Copy the key'}
              </Button>
            )}
          </CopyButton>
          <Checkbox
            checked={saved}
            label="I have stored the recovery key outside this server"
            onChange={(e) => {
              setSaved(e.currentTarget.checked);
            }}
          />
          <Group justify="flex-end">
            <Button disabled={!saved} onClick={onDone}>
              Open the vault
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
          <Text fw={600}>Set up the vault</Text>
          <Text c="dimmed" fz="sm">
            Choose a passphrase. It protects every secret Swellwright keeps. The vault starts sealed
            after every restart, and you open it with this passphrase. There is no way to recover it
            except the recovery key you get next.
          </Text>
          <PasswordInput
            autoComplete="new-password"
            data-autofocus
            label="Passphrase"
            onChange={(e) => {
              setPassphrase(e.currentTarget.value);
            }}
            required
            value={passphrase}
          />
          <Strength length={passphrase.length} />
          <PasswordInput
            autoComplete="new-password"
            error={
              repeat.length > 0 && repeat !== passphrase ? 'The passphrases differ.' : undefined
            }
            label="Repeat the passphrase"
            onChange={(e) => {
              setRepeat(e.currentTarget.value);
            }}
            required
            value={repeat}
          />
          <ErrorNote error={mutation.error} fallback="Your role may not set the vault up." />
          <Group justify="flex-end">
            <Button
              leftSection={<IconLock size={16} />}
              loading={mutation.isPending}
              disabled={!valid}
              type="submit"
            >
              Create the vault
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}

function Unseal({ onDone }: { onDone: () => void }) {
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
      <Alert
        color="yellow"
        icon={<IconLock size={18} />}
        title="The vault is sealed"
        variant="light"
      >
        <Text fz="sm">
          Runs that use a secret, and anything scheduled, wait until the vault is unsealed. The list
          below shows names and dates only.
        </Text>
      </Alert>
      <Card padding="lg">
        <form onSubmit={submit}>
          <Stack gap="md">
            {recovery ? (
              <TextInput
                autoComplete="off"
                data-autofocus
                description="Thirteen groups of four, like ABCD-EFGH-…"
                label="Recovery key"
                onChange={(e) => {
                  setText(e.currentTarget.value);
                }}
                value={text}
              />
            ) : (
              <PasswordInput
                autoComplete="off"
                data-autofocus
                label="Vault passphrase"
                onChange={(e) => {
                  setText(e.currentTarget.value);
                }}
                value={text}
              />
            )}
            <ErrorNote
              error={mutation.error}
              fallback="Your role may not unseal the vault."
              unauthorized={
                recovery
                  ? 'That recovery key is not right.'
                  : 'That passphrase is not right. Ten wrong attempts in a quarter of an hour lock unsealing for everyone.'
              }
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
                {recovery
                  ? 'Use the passphrase instead'
                  : 'Lost the passphrase? Use the recovery key'}
              </Anchor>
              <Button
                leftSection={<IconLockOpen size={16} />}
                loading={mutation.isPending}
                type="submit"
              >
                Unseal
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
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
              <Text c="dimmed" fz="sm">
                Hidden in {Math.max(left, 0)} s. This was recorded in the audit log.
              </Text>
            </Group>
          </>
        ) : mutation.error ? (
          <ErrorNote error={mutation.error} fallback="Your role may not reveal secrets." />
        ) : (
          <Skeleton h={60} />
        )}
        <Group justify="flex-end">
          <Button onClick={onClose}>Close</Button>
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
          label="Name"
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          required
          value={name}
        />
        <Select
          allowDeselect={false}
          data={typeOptions}
          description={secret ? 'The kind cannot change.' : undefined}
          disabled={secret !== undefined}
          label="Kind"
          onChange={(v) => {
            setType(asType(v) ?? 'generic');
          }}
          value={type}
        />
        <Textarea
          autoComplete="off"
          autosize
          description={
            secret
              ? 'Leave empty to keep the current value. A new one makes a new version.'
              : 'Write-only: it can be revealed later, never listed.'
          }
          label={secret ? 'New value' : 'Value'}
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
          label="Description"
          onChange={(e) => {
            setDescription(e.currentTarget.value);
          }}
          value={description}
        />
        <TextInput
          description="Optional. The console warns before it."
          label="Expires on"
          onChange={(e) => {
            setExpires(e.currentTarget.value);
          }}
          type="date"
          value={expires}
        />
        <ErrorNote error={mutation.error} fallback="Your role may not change secrets." />
        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">
            Cancel
          </Button>
          <Button loading={mutation.isPending} type="submit">
            {secret ? 'Save' : 'Store the secret'}
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
      title={`Delete ${secret?.name ?? ''}`}
    >
      <Stack gap="md">
        <Text fz="sm">
          The secret and its value are gone for good. Anything that still uses it will stop working.
        </Text>
        <ErrorNote error={mutation.error} fallback="Your role may not delete secrets." />
        <Group justify="flex-end">
          <Button onClick={close} variant="default">
            Cancel
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
            Delete
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
      <StatusBadge kind="ok">Unsealed</StatusBadge>
    ) : status.state === 'sealed' ? (
      <StatusBadge kind="warn">Sealed</StatusBadge>
    ) : (
      <StatusBadge kind="wait">Not set up</StatusBadge>
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
            Refresh
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
                Seal now
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  setAdding(true);
                }}
              >
                Add a secret
              </Button>
            </>
          ) : null}
        </>
      }
      badges={stateBadge}
      description="Secrets are encrypted before they reach the database, and values are write-only"
      icon={<IconKey size={22} />}
      title="Vault"
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
          {describeError(
            state.error,
            'Sign in again to continue.',
            'Your role may not see the vault.',
          )}
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
            The vault is not set up yet. An owner has to set it up.
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
          <ErrorNote error={seal.error} fallback="Your role may not seal the vault." />
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
            title="The vault is sealed"
            variant="light"
          >
            An owner has to unseal it before anything that uses a secret can run.
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
                Secrets
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
                Key version
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
                Set up
              </Text>
              <Text fw={600} fz="lg">
                {status.createdAt ? dayOnly.format(new Date(status.createdAt)) : '—'}
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
            {describeError(
              secrets.error,
              'Sign in again to continue.',
              'Your role may not see the secrets.',
            )}
          </Alert>
        ) : list.length === 0 ? (
          <Text c="dimmed" fz="sm" p="md">
            No secrets yet.{canManage && open ? ' Add the first one.' : ''}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th pl="md">Name</Table.Th>
                  <Table.Th>Kind</Table.Th>
                  <Table.Th>Version</Table.Th>
                  <Table.Th>Expires</Table.Th>
                  <Table.Th>Value changed</Table.Th>
                  <Table.Th pr="md" w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((secret) => {
                  const expiry = expiryState(secret);
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
                          {TYPE_LABEL[secret.type]}
                        </Badge>
                      </Table.Td>
                      <Table.Td c="dimmed" fz="sm">
                        v{secret.version}
                      </Table.Td>
                      <Table.Td fz="sm">
                        {expiry === 'none' ? (
                          <Text c="dimmed" component="span">
                            never
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
                            {secret.expiresAt ? dayOnly.format(new Date(secret.expiresAt)) : ''}
                            {expiry === 'expired'
                              ? ' (expired)'
                              : expiry === 'soon'
                                ? ' (soon)'
                                : ''}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td c="dimmed" fz="sm">
                        {when.format(new Date(secret.valueChangedAt))}
                      </Table.Td>
                      <Table.Td pr="md">
                        {canManage || canReveal ? (
                          <Menu position="bottom-end" shadow="md" withinPortal>
                            <Menu.Target>
                              <ActionIcon
                                aria-label={`Actions for ${secret.name}`}
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
                                  Reveal
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
                                    Change
                                  </Menu.Item>
                                  <Menu.Item
                                    color="red"
                                    leftSection={<IconTrash size={16} />}
                                    onClick={() => {
                                      setDeleting(secret);
                                    }}
                                  >
                                    Delete
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
        title="Add a secret"
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
        title={`Change ${editing?.name ?? ''}`}
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
