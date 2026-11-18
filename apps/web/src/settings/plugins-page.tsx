import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  List,
  Modal,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  VisuallyHidden,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconEye,
  IconInfoCircle,
  IconMinus,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconPuzzle,
  IconRefresh,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type {
  Permission,
  PluginPermissionChange,
  PluginPermissionsView,
  PluginStatus,
  PluginTrust,
  PluginView,
} from '@swellwright/contracts';
import { PageHeader } from '@swellwright/ui';

import { ApiRequestError, disablePlugin, enablePlugin, listPlugins } from '../api.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useDateTime } from '../format.js';

/** Shown where a plugin has no value (a plugin that is gone has no version). */
const DASH = '—';
/** How much of the digest is shown in the open; the whole of it is in the tooltip and on the clipboard. */
const DIGEST_SHORT = 12;

/** Colour and style of the status badge. Never colour alone: the word is always there too. */
const STATUS_BADGE = {
  enabled: { color: 'teal', variant: 'light' },
  disabled: { color: 'gray', variant: 'light' },
  not_enabled: { color: 'gray', variant: 'outline' },
  changed: { color: 'orange', variant: 'light' },
  unavailable: { color: 'red', variant: 'light' },
  missing: { color: 'red', variant: 'light' },
} as const satisfies Record<PluginStatus, { color: string; variant: 'light' | 'outline' }>;

/** The statuses from which a plugin can be (re)enabled: usable, and not running now. */
const ENABLEABLE: readonly PluginStatus[] = ['not_enabled', 'disabled', 'changed'];

/** What the page says after a plugin was enabled or disabled. Kept as data so the text follows the language. */
interface Notice {
  readonly kind: 'enabled' | 'disabled';
  readonly name: string;
}

const displayName = (plugin: PluginView): string => plugin.name ?? plugin.id;

/** `fallback` is what a refusal for lack of permission says, already translated. */
function ErrorNote({ error, fallback }: { error: unknown; fallback: string }) {
  const { t } = useTranslation('plugins');
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
  const { t } = useTranslation(['plugins', 'common']);
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
      {t(`notice.${notice.kind}`, { name: notice.name })}
    </Alert>
  );
}

function PluginStatusBadge({ status }: { status: PluginStatus }) {
  const { t } = useTranslation('plugins');
  const { color, variant } = STATUS_BADGE[status];
  return (
    <Badge
      color={color}
      leftSection={status === 'changed' ? <IconAlertTriangle aria-hidden size={13} /> : undefined}
      variant={variant}
    >
      {t(`statuses.${status}`)}
    </Badge>
  );
}

function TrustBadge({ trust }: { trust: PluginTrust | null }) {
  const { t } = useTranslation('plugins');
  if (trust === null) {
    return (
      <Text c="dimmed" fz="sm">
        {DASH}
      </Text>
    );
  }
  return (
    <Badge
      color={trust === 'official' ? 'cyan' : 'yellow'}
      maw="none"
      styles={{ root: { width: 'max-content' }, label: { overflow: 'visible' } }}
      title={t(`trustHint.${trust}`)}
      variant="light"
    >
      {t(`trust.${trust}`)}
    </Badge>
  );
}

/** The extension kinds a plugin provides, a declarative one marked as such. */
function KindBadges({ provides }: { provides: PluginView['provides'] }) {
  const { t } = useTranslation('plugins');
  if (provides.length === 0) {
    return (
      <Text c="dimmed" fz="sm">
        {DASH}
      </Text>
    );
  }
  return (
    <Group gap={4} wrap="wrap">
      {provides.map((item, index) => (
        <Badge
          color="gray"
          key={`${item.kind}:${item.mode}:${String(index)}`}
          size="sm"
          title={
            item.mode === 'declarative' ? t('provides.declarativeHint') : t('provides.codeHint')
          }
          tt="none"
          variant="outline"
        >
          {item.mode === 'declarative' ? t('provides.declarative', { kind: item.kind }) : item.kind}
        </Badge>
      ))}
    </Group>
  );
}

/** The start of the digest, with the whole of it on hover and a button that copies it. */
function Digest({ digest }: { digest: string }) {
  const { t } = useTranslation('common');
  return (
    <Group gap={4} wrap="nowrap">
      <Code title={digest}>{digest.slice(0, DIGEST_SHORT)}…</Code>
      <CopyButton value={digest}>
        {({ copied, copy }) => (
          <ActionIcon
            aria-label={copied ? t('copied') : t('copy')}
            color="gray"
            onClick={copy}
            size="sm"
            variant="subtle"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        )}
      </CopyButton>
    </Group>
  );
}

/** A label and its value, side by side. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group align="baseline" gap="md" wrap="nowrap">
      <Text c="dimmed" fz="sm" style={{ flexShrink: 0 }} w={120}>
        {label}
      </Text>
      <div style={{ minWidth: 0 }}>{children}</div>
    </Group>
  );
}

function ValueList({ values }: { values: readonly string[] }) {
  const { t } = useTranslation('plugins');
  if (values.length === 0) {
    return (
      <Text c="dimmed" fz="sm">
        {t('asks.none')}
      </Text>
    );
  }
  return (
    <Stack gap={2}>
      {values.map((value) => (
        <Text ff="monospace" fz="sm" key={value} style={{ wordBreak: 'break-all' }}>
          {value}
        </Text>
      ))}
    </Stack>
  );
}

/** What a plugin asks for, as plain lists. Anything not listed is denied. */
function AsksSection({
  title,
  permissions,
}: {
  title: string;
  permissions: PluginPermissionsView;
}) {
  const { t } = useTranslation('plugins');
  const nothing =
    !permissions.ssh &&
    permissions.network.length === 0 &&
    permissions.secrets.length === 0 &&
    permissions.panel.length === 0;
  return (
    <Stack gap="xs">
      <Text fw={600} fz="sm">
        {title}
      </Text>
      {nothing ? (
        <Text fz="sm">{t('asks.nothing')}</Text>
      ) : (
        <Stack gap="xs">
          <Field label={t('asks.network')}>
            <ValueList values={permissions.network} />
          </Field>
          <Field label={t('asks.secrets')}>
            <ValueList values={permissions.secrets} />
          </Field>
          <Field label={t('asks.panel')}>
            <ValueList values={permissions.panel} />
          </Field>
          <Field label={t('asks.ssh')}>
            {permissions.ssh ? (
              <Text c="orange.4" fw={600} fz="sm">
                {t('asks.sshYes')}
              </Text>
            ) : (
              <Text c="dimmed" fz="sm">
                {t('asks.sshNo')}
              </Text>
            )}
          </Field>
        </Stack>
      )}
      <Text c="dimmed" fz="xs">
        {t('asks.note')}
      </Text>
    </Stack>
  );
}

/** One line of a permission change: what was added or removed, with the sign spelled out for a screen reader. */
function ChangeLine({
  kind,
  label,
  value,
}: {
  kind: 'added' | 'removed';
  label: string;
  value: string | undefined;
}) {
  const { t } = useTranslation('plugins');
  const Sign = kind === 'added' ? IconPlus : IconMinus;
  return (
    <Group align="flex-start" gap={6} wrap="nowrap">
      <Sign
        aria-hidden
        color={`var(--mantine-color-${kind === 'added' ? 'teal' : 'red'}-4)`}
        size={14}
        style={{ flexShrink: 0, marginTop: 4 }}
      />
      <VisuallyHidden>{t(`changed.${kind}`)}</VisuallyHidden>
      <Text fz="sm" style={{ wordBreak: 'break-all' }}>
        {value === undefined ? (
          label
        ) : (
          <>
            <Text c="dimmed" component="span" fz="sm">
              {label}:{' '}
            </Text>
            <Text component="span" ff="monospace" fz="sm">
              {value}
            </Text>
          </>
        )}
      </Text>
    </Group>
  );
}

/** The difference between what was approved and what the files ask for now. */
function ChangeSection({ change }: { change: PluginPermissionChange }) {
  const { t } = useTranslation('plugins');
  const groups = [
    { label: t('asks.network'), list: change.network },
    { label: t('asks.secrets'), list: change.secrets },
    { label: t('asks.panel'), list: change.panel },
  ];
  const differs =
    change.ssh !== 'unchanged' ||
    groups.some(({ list }) => list.added.length > 0 || list.removed.length > 0);
  return (
    <Stack gap={6}>
      <Text fw={600} fz="sm">
        {t('changed.permissionsTitle')}
      </Text>
      {change.widens ? (
        <Text c="red.4" fw={600} fz="sm">
          {t('changed.widens')}
        </Text>
      ) : null}
      {differs ? (
        <Stack gap={2}>
          {groups.flatMap(({ label, list }) => [
            ...list.added.map((value) => (
              <ChangeLine
                key={`${label}:added:${value}`}
                kind="added"
                label={label}
                value={value}
              />
            )),
            ...list.removed.map((value) => (
              <ChangeLine
                key={`${label}:removed:${value}`}
                kind="removed"
                label={label}
                value={value}
              />
            )),
          ])}
          {change.ssh === 'granted' ? (
            <ChangeLine kind="added" label={t('changed.ssh')} value={undefined} />
          ) : null}
          {change.ssh === 'revoked' ? (
            <ChangeLine kind="removed" label={t('changed.ssh')} value={undefined} />
          ) : null}
        </Stack>
      ) : (
        <Text c="dimmed" fz="sm">
          {t('changed.same')}
        </Text>
      )}
    </Stack>
  );
}

/** The problems discovery found, as the plugin or the server worded them (English data). */
function ProblemList({ problems }: { problems: readonly string[] }) {
  if (problems.length === 0) {
    return null;
  }
  return (
    <List fz="sm" mt={6} size="sm" spacing={2}>
      {problems.map((problem) => (
        <List.Item key={problem}>{problem}</List.Item>
      ))}
    </List>
  );
}

/** The blocks that say how the plugin stands, for the statuses that need more than a badge. */
function StatusBlocks({ plugin }: { plugin: PluginView }) {
  const { t } = useTranslation('plugins');
  const formatDate = useDateTime('short');
  const { approval } = plugin;
  const approvedLine = approval
    ? t('approval.line', {
        when: formatDate(approval.approvedAt),
        who: approval.approvedBy,
        version: approval.version,
      })
    : undefined;

  if (plugin.status === 'unavailable') {
    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={16} />}
        title={t('unavailable.title')}
        variant="light"
      >
        <Text fz="sm">
          {plugin.discovery === 'incompatible'
            ? t('unavailable.incompatible')
            : t('unavailable.invalid')}
        </Text>
        <ProblemList problems={plugin.problems} />
      </Alert>
    );
  }
  if (plugin.status === 'missing') {
    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={16} />}
        title={t('missing.title')}
        variant="light"
      >
        <Text fz="sm">{t('missing.body')}</Text>
        {approvedLine ? (
          <Text c="dimmed" fz="xs" mt={6}>
            {approvedLine}
          </Text>
        ) : null}
      </Alert>
    );
  }
  if (plugin.status === 'changed') {
    return (
      <Alert
        color="orange"
        icon={<IconAlertTriangle size={16} />}
        title={t('changed.title')}
        variant="light"
      >
        <Stack gap="sm">
          <Text fz="sm">{t('changed.body')}</Text>
          {approvedLine ? (
            <Text c="dimmed" fz="xs">
              {approvedLine}
            </Text>
          ) : null}
          {plugin.change ? <ChangeSection change={plugin.change} /> : null}
        </Stack>
      </Alert>
    );
  }
  return approvedLine ? (
    <Text c="dimmed" fz="xs">
      {approvedLine}
    </Text>
  ) : null;
}

/** What is inside the review dialog. Keyed by the plugin, so a mutation's state never carries over. */
function ReviewBody({
  plugin,
  canManage,
  onClose,
  onDone,
}: {
  plugin: PluginView;
  canManage: boolean;
  onClose: () => void;
  onDone: (notice: Notice) => void;
}) {
  const { t } = useTranslation(['plugins', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const { digest } = plugin;
  const canEnable =
    canManage &&
    ENABLEABLE.includes(plugin.status) &&
    plugin.discovery === 'available' &&
    digest !== null;
  const enable = useMutation({
    mutationFn: (shown: string) => step.run(() => enablePlugin(plugin.id, shown)),
    onSuccess: (enabled) => {
      onDone({ kind: 'enabled', name: displayName(enabled) });
    },
    onError: (error) => {
      // 409: the files changed since the list was loaded. The list is stale now; the dialog keeps what was shown.
      if (error instanceof ApiRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['plugins'] });
      }
    },
  });
  // What the plugin was approved for stands in for what its files ask for, when the files are gone.
  const approvedPermissions =
    plugin.permissions === null ? (plugin.approval?.permissions ?? null) : null;

  return (
    <Stack gap="md">
      <Group gap="xs">
        <PluginStatusBadge status={plugin.status} />
        <TrustBadge trust={plugin.trust} />
      </Group>

      {plugin.description ? <Text fz="sm">{plugin.description}</Text> : null}

      <StatusBlocks plugin={plugin} />

      <Stack gap="xs">
        <Field label={t('detail.fields.id')}>
          <Text ff="monospace" fz="sm">
            {plugin.id}
          </Text>
        </Field>
        {plugin.version ? (
          <Field label={t('detail.fields.version')}>
            <Text fz="sm">{plugin.version}</Text>
          </Field>
        ) : null}
        {plugin.license ? (
          <Field label={t('detail.fields.license')}>
            <Text fz="sm">{plugin.license}</Text>
          </Field>
        ) : null}
        {plugin.provides.length > 0 ? (
          <Field label={t('detail.provides')}>
            <KindBadges provides={plugin.provides} />
          </Field>
        ) : null}
        {digest !== null ? (
          <Field label={t('detail.fields.digest')}>
            <Stack gap={2}>
              <Digest digest={digest} />
              <Text c="dimmed" fz="xs">
                {t('detail.digestHint')}
              </Text>
            </Stack>
          </Field>
        ) : null}
      </Stack>

      {plugin.permissions ? (
        <AsksSection permissions={plugin.permissions} title={t('asks.title')} />
      ) : null}
      {approvedPermissions ? (
        <AsksSection permissions={approvedPermissions} title={t('asks.approvedTitle')} />
      ) : null}

      {plugin.trust === 'local' ? (
        <Alert
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
          title={t('local.title')}
          variant="light"
        >
          <Text fz="sm">{t('local.body')}</Text>
        </Alert>
      ) : null}
      {plugin.signed ? (
        <Alert color="gray" icon={<IconInfoCircle size={16} />} variant="light">
          <Text fz="sm">{t('signed')}</Text>
        </Alert>
      ) : null}

      {canEnable ? (
        <Text c="dimmed" fz="xs">
          {t('enable.note')}
        </Text>
      ) : null}
      <ErrorNote error={enable.error} fallback={t('manageForbidden')} />
      <Group justify="flex-end">
        <Button onClick={onClose} variant="default">
          {canEnable ? t('common:cancel') : t('common:close')}
        </Button>
        {canEnable ? (
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            loading={enable.isPending}
            onClick={() => {
              enable.mutate(digest);
            }}
          >
            {t('enable.confirm')}
          </Button>
        ) : null}
      </Group>
    </Stack>
  );
}

/** The detail dialog. It is also where a plugin is enabled: the person confirms what they were just shown. */
function ReviewDialog({
  plugin,
  canManage,
  onClose,
  onDone,
}: {
  plugin: PluginView | undefined;
  canManage: boolean;
  onClose: () => void;
  onDone: (notice: Notice) => void;
}) {
  return (
    <Modal
      centered
      onClose={onClose}
      opened={plugin !== undefined}
      size="lg"
      title={plugin ? displayName(plugin) : ''}
    >
      {plugin ? (
        <ReviewBody
          canManage={canManage}
          key={plugin.id}
          onClose={onClose}
          onDone={onDone}
          plugin={plugin}
        />
      ) : null}
    </Modal>
  );
}

function DisableBody({
  plugin,
  onClose,
  onDone,
}: {
  plugin: PluginView;
  onClose: () => void;
  onDone: (notice: Notice) => void;
}) {
  const { t } = useTranslation(['plugins', 'common']);
  const step = useStepUp();
  const mutation = useMutation({
    mutationFn: () => step.run(() => disablePlugin(plugin.id)),
    onSuccess: (disabled) => {
      onDone({ kind: 'disabled', name: displayName(disabled) });
    },
  });
  return (
    <Stack gap="md">
      <Text fz="sm">{t('disable.body')}</Text>
      <ErrorNote error={mutation.error} fallback={t('manageForbidden')} />
      <Group justify="flex-end">
        <Button onClick={onClose} variant="default">
          {t('common:cancel')}
        </Button>
        <Button
          color="red"
          leftSection={<IconPlayerPause size={16} />}
          loading={mutation.isPending}
          onClick={() => {
            mutation.mutate();
          }}
        >
          {t('disable.confirm')}
        </Button>
      </Group>
    </Stack>
  );
}

function DisableDialog({
  plugin,
  onClose,
  onDone,
}: {
  plugin: PluginView | undefined;
  onClose: () => void;
  onDone: (notice: Notice) => void;
}) {
  const { t } = useTranslation('plugins');
  return (
    <Modal
      centered
      onClose={onClose}
      opened={plugin !== undefined}
      title={t('disable.title', { name: plugin ? displayName(plugin) : '' })}
    >
      {plugin ? (
        <DisableBody key={plugin.id} onClose={onClose} onDone={onDone} plugin={plugin} />
      ) : null}
    </Modal>
  );
}

/** The plugins as a table, scrolling sideways on a narrow screen like the other pages. */
function PluginsTable({
  plugins,
  canManage,
  onReview,
  onDisable,
}: {
  plugins: readonly PluginView[];
  canManage: boolean;
  onReview: (plugin: PluginView) => void;
  onDisable: (plugin: PluginView) => void;
}) {
  const { t } = useTranslation('plugins');
  return (
    <Table.ScrollContainer minWidth={960}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th pl="md">{t('columns.plugin')}</Table.Th>
            <Table.Th>{t('columns.version')}</Table.Th>
            <Table.Th>{t('columns.trust')}</Table.Th>
            <Table.Th>{t('columns.status')}</Table.Th>
            <Table.Th>{t('columns.provides')}</Table.Th>
            <Table.Th pr="md" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {plugins.map((plugin) => {
            const name = displayName(plugin);
            const [problem] = plugin.problems;
            return (
              <Table.Tr key={plugin.id}>
                <Table.Td pl="md">
                  <Text fw={500} fz="sm">
                    {name}
                  </Text>
                  {plugin.name ? (
                    <Text c="dimmed" component="span" display="block" ff="monospace" fz="xs">
                      {plugin.id}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  <Text fz="sm">{plugin.version ?? DASH}</Text>
                </Table.Td>
                <Table.Td>
                  <TrustBadge trust={plugin.trust} />
                </Table.Td>
                <Table.Td>
                  <PluginStatusBadge status={plugin.status} />
                  {plugin.status === 'unavailable' && problem !== undefined ? (
                    <Text
                      c="dimmed"
                      fz="xs"
                      maw={240}
                      mt={4}
                      title={plugin.problems.join('\n')}
                      truncate="end"
                    >
                      {problem}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <KindBadges provides={plugin.provides} />
                </Table.Td>
                <Table.Td pr="md">
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    <Button
                      aria-label={t('actions.reviewAria', { name })}
                      leftSection={<IconEye size={14} />}
                      onClick={() => {
                        onReview(plugin);
                      }}
                      size="xs"
                      variant="default"
                    >
                      {t('actions.review')}
                    </Button>
                    {canManage && ENABLEABLE.includes(plugin.status) ? (
                      <Button
                        aria-label={t('actions.enableAria', { name })}
                        leftSection={<IconPlayerPlay size={14} />}
                        onClick={() => {
                          onReview(plugin);
                        }}
                        size="xs"
                      >
                        {t('actions.enable')}
                      </Button>
                    ) : null}
                    {canManage && plugin.status === 'enabled' ? (
                      <Button
                        aria-label={t('actions.disableAria', { name })}
                        color="red"
                        leftSection={<IconPlayerPause size={14} />}
                        onClick={() => {
                          onDisable(plugin);
                        }}
                        size="xs"
                      >
                        {t('actions.disable')}
                      </Button>
                    ) : null}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** The empty page: an icon, a title and what to do about it. */
function EmptyCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card padding="lg">
      <Group align="flex-start" gap="md" wrap="nowrap">
        <ThemeIcon size="xl" variant="soft">
          <IconPuzzle size={22} />
        </ThemeIcon>
        <Stack gap={4}>
          <Text fw={600}>{title}</Text>
          <Text c="dimmed" fz="sm">
            {children}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

/** How to point the server at its plugin directories: the two variables, in code spans. */
function NoDirectoriesText() {
  return <Trans components={{ code: <Code /> }} i18nKey="directories.none" ns="plugins" />;
}

/**
 * The plugins of the instance (Settings, Plugins). Reading needs `plugins:read`; enabling and disabling need
 * `plugins:manage` and a fresh confirmation with a code.
 */
export function PluginsPage({ permissions }: { permissions: readonly Permission[] }) {
  const { t } = useTranslation(['plugins', 'common']);
  const queryClient = useQueryClient();
  const canManage = permissions.includes('plugins:manage');
  const [reviewing, setReviewing] = useState<PluginView | undefined>(undefined);
  const [disabling, setDisabling] = useState<PluginView | undefined>(undefined);
  const [notice, setNotice] = useState<Notice | undefined>(undefined);

  const list = useQuery({ queryKey: ['plugins'], queryFn: listPlugins, retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plugins'] });
  const done = (result: Notice) => {
    setReviewing(undefined);
    setDisabling(undefined);
    setNotice(result);
    void refresh();
  };

  const plugins = list.data?.plugins ?? [];
  const configured = list.data
    ? list.data.directories.official || list.data.directories.local
    : true;

  return (
    <>
      <PageHeader
        actions={
          <Button
            leftSection={<IconRefresh size={16} />}
            loading={list.isRefetching}
            onClick={() => void list.refetch()}
            variant="default"
          >
            {t('common:refresh')}
          </Button>
        }
        description={t('header.description')}
        icon={<IconPuzzle size={22} />}
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

      {list.isPending ? (
        <Card padding={0}>
          <Stack gap="xs" p="md">
            <Skeleton h={28} />
            <Skeleton h={28} />
          </Stack>
        </Card>
      ) : list.isError ? (
        <Alert color="red" variant="light">
          {describeError(t, list.error, t('signInAgain'), t('loadFailed'))}
        </Alert>
      ) : (
        <>
          {!configured && plugins.length === 0 ? (
            <EmptyCard title={t('directories.noneTitle')}>
              <NoDirectoriesText />
            </EmptyCard>
          ) : null}
          {!configured && plugins.length > 0 ? (
            <Alert color="blue" icon={<IconInfoCircle size={16} />} mb="md" variant="light">
              <Text fz="sm">
                <NoDirectoriesText />
              </Text>
            </Alert>
          ) : null}
          {configured && plugins.length === 0 ? (
            <EmptyCard title={t('directories.emptyTitle')}>{t('directories.empty')}</EmptyCard>
          ) : null}
          {plugins.length > 0 ? (
            <Card padding={0}>
              <PluginsTable
                canManage={canManage}
                onDisable={setDisabling}
                onReview={setReviewing}
                plugins={plugins}
              />
              <Text c="dimmed" fz="xs" p="md">
                {t('table.summary', { count: plugins.length })}
              </Text>
            </Card>
          ) : null}
        </>
      )}

      <ReviewDialog
        canManage={canManage}
        onClose={() => {
          setReviewing(undefined);
        }}
        onDone={done}
        plugin={reviewing}
      />
      <DisableDialog
        onClose={() => {
          setDisabling(undefined);
        }}
        onDone={done}
        plugin={disabling}
      />
    </>
  );
}
