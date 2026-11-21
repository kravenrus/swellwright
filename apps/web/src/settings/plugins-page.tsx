import {
  Badge,
  Box,
  Button,
  Center,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import {
  IconActivity,
  IconAlertTriangle,
  IconBook,
  IconEye,
  IconGitCompare,
  IconInfoCircle,
  IconMinus,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconPuzzle,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PiCheck, PiCopy } from 'react-icons/pi';
import { TbTag } from 'react-icons/tb';

import type {
  Permission,
  PluginList,
  PluginPermissionChange,
  PluginPermissionsView,
  PluginRuntime,
  PluginStatus,
  PluginTrust,
  PluginView,
} from '@swellwright/contracts';
import {
  Callout,
  CopyableCodeBlock,
  CopyableDataListItem,
  EntityCard,
  ErrorMessageBlock,
  HeaderAction,
  HeaderActions,
  LoadingScreen,
  ModalFooter,
  OverlayHeader,
  PageHeader,
  SectionCard,
  StatusBadge,
  type StatusKind,
  TagFilterBar,
  filterByTag,
  tagColor,
} from '@swellwright/ui';

import { ApiRequestError, checkPlugin, disablePlugin, enablePlugin, listPlugins } from '../api.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useDateTime, useNumber } from '../format.js';
import { confirmAction, notifySuccess } from '../shell/feedback.js';
import { useIsMobile } from '../shell/use-is-mobile.js';
import { PluginSettings } from './plugin-settings.js';
import {
  DetailList,
  DetailRow,
  FailureCard,
  useCopyLabels,
  usePluginFailure,
} from './plugin-shared.js';
import { SidecarSection } from './plugin-sidecar.js';

/** Where the plugins are documented (the header's help action, as the panel's lime book). */
const PLUGINS_DOCS_URL = 'https://github.com/swellwright/swellwright/blob/main/docs/en/plugins.md';

/** The chip of each status: an icon and a word, never colour alone. */
const STATUS_KIND = {
  enabled: 'ok',
  disabled: 'wait',
  not_enabled: 'wait',
  changed: 'warn',
  unavailable: 'err',
  missing: 'err',
} as const satisfies Record<PluginStatus, StatusKind>;

/** The chip of the state of a plugin's process. */
const RUNTIME_KIND = {
  stopped: 'wait',
  running: 'run',
  failed: 'err',
} as const satisfies Record<PluginRuntime['state'], StatusKind>;

/** Colour of the trust badge: the project's own, this server's, and plugins by others. */
const TRUST_COLOR = {
  official: 'cyan',
  local: 'yellow',
  community: 'violet',
} as const satisfies Record<PluginTrust, string>;

/** The statuses from which a plugin can be (re)enabled: usable, and not running now. */
const ENABLEABLE: readonly PluginStatus[] = ['not_enabled', 'disabled', 'changed'];

/**
 * The filter tabs. The filter bar sorts its tags alphabetically, so each tag starts with its place in the strip; the
 * tab shows the translated name that follows the number.
 */
const FILTERS = ['enabled', 'attention', 'inactive', 'unavailable'] as const;
type Filter = (typeof FILTERS)[number];
const filterTag = (filter: Filter): string => `${String(FILTERS.indexOf(filter))}:${filter}`;
const filterOfTag = (tag: string): Filter =>
  FILTERS.find((filter) => filterTag(filter) === tag) ?? 'inactive';

/** The tabs a plugin shows under: enabled, needs a decision or a look, cannot be used, or simply not enabled. */
function filtersOf(plugin: PluginView): string[] {
  const tags: Filter[] = [];
  if (plugin.status === 'enabled') {
    tags.push('enabled');
  }
  if (
    plugin.status === 'changed' ||
    plugin.status === 'missing' ||
    (plugin.status === 'enabled' && plugin.runtime.state === 'failed')
  ) {
    tags.push('attention');
  }
  if (plugin.status === 'unavailable') {
    tags.push('unavailable');
  }
  if (plugin.status === 'not_enabled' || plugin.status === 'disabled') {
    tags.push('inactive');
  }
  return tags.map(filterTag);
}

/** What the page says after a plugin was enabled or disabled. Kept as data so the text follows the language. */
interface Notice {
  readonly kind: 'enabled' | 'disabled';
  readonly name: string;
}

const displayName = (plugin: PluginView): string => plugin.name ?? plugin.id;

/** The extension kinds a plugin provides, once each: the tags of its card, as the panel's cards show their tags. */
const kindsOf = (plugin: PluginView): string[] => [
  ...new Set(plugin.provides.map((item) => item.kind)),
];

/** The chips must not be squeezed or cut inside the card's single row. */
const CHIP_STYLES = {
  root: { flexShrink: 0, width: 'max-content' },
  label: { overflow: 'visible' },
};

function PluginStatusChip({ plugin }: { plugin: PluginView }) {
  const { t } = useTranslation('plugins');
  const problems = plugin.status === 'unavailable' ? plugin.problems : [];
  const chip = (
    <StatusBadge kind={STATUS_KIND[plugin.status]} maw="none" styles={CHIP_STYLES}>
      {t(`statuses.${plugin.status}`)}
    </StatusBadge>
  );
  return problems.length > 0 ? (
    <Tooltip label={problems.join('\n')} multiline w={280}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

/**
 * On a card, only the two states worth a second chip: the process is running, or it failed (the error is on hover).
 * A plugin that is stopped has nothing to add to its status.
 */
function RuntimeChip({ runtime }: { runtime: PluginRuntime }) {
  const { t } = useTranslation('plugins');
  if (runtime.state === 'stopped') {
    return null;
  }
  const chip = (
    <StatusBadge kind={RUNTIME_KIND[runtime.state]} maw="none" styles={CHIP_STYLES}>
      {t(`runtime.states.${runtime.state}`)}
    </StatusBadge>
  );
  return runtime.state === 'failed' && runtime.lastError ? (
    <Tooltip label={runtime.lastError} multiline w={280}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

function TrustBadge({ trust }: { trust: PluginTrust }) {
  const { t } = useTranslation('plugins');
  return (
    <Tooltip label={t(`trustHint.${trust}`)} multiline w={260}>
      <Badge color={TRUST_COLOR[trust]} maw="none" size="lg" styles={CHIP_STYLES} variant="soft">
        {t(`trust.${trust}`)}
      </Badge>
    </Tooltip>
  );
}

/** One plugin of the list: a card of the panel's kind, the whole card opens the review, its menu holds the actions. */
function PluginCard({
  plugin,
  canManage,
  onReview,
  onDisable,
}: {
  plugin: PluginView;
  canManage: boolean;
  onReview: (plugin: PluginView) => void;
  onDisable: (plugin: PluginView) => void;
}) {
  const { t } = useTranslation('plugins');
  const name = displayName(plugin);
  const enabled = plugin.status === 'enabled';
  return (
    <EntityCard.Root
      aria-label={t('actions.reviewAria', { name })}
      isActive={enabled}
      onClick={() => {
        onReview(plugin);
      }}
      wrap
    >
      <EntityCard.Header>
        <EntityCard.Icon highlight={enabled}>
          <IconPuzzle size={22} />
        </EntityCard.Icon>

        <EntityCard.Content
          badges={
            <>
              {plugin.version ? (
                <Text c="dimmed" fz="xs" style={{ flexShrink: 0 }}>
                  {plugin.version}
                </Text>
              ) : null}
              <PluginStatusChip plugin={plugin} />
              {enabled ? <RuntimeChip runtime={plugin.runtime} /> : null}
              {plugin.trust === null ? null : <TrustBadge trust={plugin.trust} />}
            </>
          }
          tags={kindsOf(plugin)}
          title={name}
        />
      </EntityCard.Header>

      <EntityCard.Actions>
        <EntityCard.Menu label={t('actions.menuAria', { name })}>
          <Menu.Item
            leftSection={<IconEye size={18} />}
            onClick={() => {
              onReview(plugin);
            }}
          >
            {t('actions.review')}
          </Menu.Item>

          {canManage && ENABLEABLE.includes(plugin.status) ? (
            <Menu.Item
              color="teal"
              leftSection={<IconPlayerPlay size={18} />}
              onClick={() => {
                onReview(plugin);
              }}
            >
              {t('actions.enable')}
            </Menu.Item>
          ) : null}

          <CopyButton timeout={2000} value={plugin.id}>
            {({ copied, copy }) => (
              <Menu.Item
                {...(copied ? { color: 'teal' } : {})}
                leftSection={copied ? <PiCheck size={18} /> : <PiCopy size={18} />}
                onClick={copy}
              >
                {t('actions.copyId')}
              </Menu.Item>
            )}
          </CopyButton>

          {plugin.digest === null ? null : (
            <CopyButton timeout={2000} value={plugin.digest}>
              {({ copied, copy }) => (
                <Menu.Item
                  {...(copied ? { color: 'teal' } : {})}
                  leftSection={copied ? <PiCheck size={18} /> : <PiCopy size={18} />}
                  onClick={copy}
                >
                  {t('actions.copyDigest')}
                </Menu.Item>
              )}
            </CopyButton>
          )}

          {canManage && enabled ? (
            <Menu.Item
              color="red"
              leftSection={<IconPlayerPause size={18} />}
              onClick={() => {
                onDisable(plugin);
              }}
            >
              {t('actions.disable')}
            </Menu.Item>
          ) : null}
        </EntityCard.Menu>
      </EntityCard.Actions>
    </EntityCard.Root>
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

/** What a plugin asks for, as rows of a card. Anything not listed is denied. */
function AsksSection({
  title,
  color,
  permissions,
}: {
  title: string;
  color: string;
  permissions: PluginPermissionsView;
}) {
  const { t } = useTranslation('plugins');
  const nothing =
    !permissions.ssh &&
    permissions.network.length === 0 &&
    permissions.secrets.length === 0 &&
    permissions.panel.length === 0;
  return (
    <SectionCard.Root>
      <SectionCard.Section>
        <OverlayHeader
          icon={IconShieldCheck}
          iconColor={color}
          iconSize={18}
          title={title}
          titleOrder={5}
        />
      </SectionCard.Section>
      <SectionCard.Section>
        <Stack gap="sm">
          {nothing ? (
            <Text fz="sm">{t('asks.nothing')}</Text>
          ) : (
            <DetailList>
              <DetailRow label={t('asks.network')}>
                <ValueList values={permissions.network} />
              </DetailRow>
              <DetailRow label={t('asks.secrets')}>
                <ValueList values={permissions.secrets} />
              </DetailRow>
              <DetailRow label={t('asks.panel')}>
                <ValueList values={permissions.panel} />
              </DetailRow>
              <DetailRow label={t('asks.ssh')}>
                {permissions.ssh ? (
                  <Text c="orange.4" fw={600} fz="sm">
                    {t('asks.sshYes')}
                  </Text>
                ) : (
                  <Text c="dimmed" fz="sm">
                    {t('asks.sshNo')}
                  </Text>
                )}
              </DetailRow>
            </DetailList>
          )}
          <Text c="dimmed" fz="xs">
            {t('asks.note')}
          </Text>
        </Stack>
      </SectionCard.Section>
    </SectionCard.Root>
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
    <SectionCard.Root>
      <SectionCard.Section>
        <OverlayHeader
          icon={IconGitCompare}
          iconColor="orange"
          iconSize={18}
          title={t('changed.permissionsTitle')}
          titleOrder={5}
        />
      </SectionCard.Section>
      <SectionCard.Section>
        <Stack gap={6}>
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
      </SectionCard.Section>
    </SectionCard.Root>
  );
}

/** When and by whom the plugin was approved, for the statuses that have an approval on record. */
function useApprovedLine(plugin: PluginView): string | undefined {
  const { t } = useTranslation('plugins');
  const formatDate = useDateTime('short');
  const { approval } = plugin;
  return approval
    ? t('approval.line', {
        when: formatDate(approval.approvedAt),
        who: approval.approvedBy,
        version: approval.version,
      })
    : undefined;
}

/** The notes that say how the plugin stands, for the statuses that need more than a chip: they come first. */
function StatusBlocks({ plugin }: { plugin: PluginView }) {
  const { t } = useTranslation(['plugins', 'common']);
  const labels = useCopyLabels();
  const approvedLine = useApprovedLine(plugin);

  if (plugin.status === 'unavailable') {
    return (
      <Callout color="red" title={t('unavailable.title')}>
        <Stack gap="xs">
          <Text c="gray.3" fz="sm">
            {plugin.discovery === 'incompatible'
              ? t('unavailable.incompatible')
              : t('unavailable.invalid')}
          </Text>
          {plugin.problems.length > 0 ? (
            <ErrorMessageBlock message={plugin.problems.join('\n')} {...labels} />
          ) : null}
        </Stack>
      </Callout>
    );
  }
  if (plugin.status === 'missing') {
    return (
      <Callout color="red" title={t('missing.title')}>
        <Stack gap={6}>
          <Text c="gray.3" fz="sm">
            {t('missing.body')}
          </Text>
          {approvedLine ? (
            <Text c="dimmed" fz="xs">
              {approvedLine}
            </Text>
          ) : null}
        </Stack>
      </Callout>
    );
  }
  if (plugin.status === 'changed') {
    return (
      <>
        <Callout color="orange" title={t('changed.title')}>
          <Stack gap={6}>
            <Text c="gray.3" fz="sm">
              {t('changed.body')}
            </Text>
            {approvedLine ? (
              <Text c="dimmed" fz="xs">
                {approvedLine}
              </Text>
            ) : null}
          </Stack>
        </Callout>
        {plugin.change ? <ChangeSection change={plugin.change} /> : null}
      </>
    );
  }
  return null;
}

/** The card with the facts of the plugin: its status, id, version, licence, trust, what it provides, its digest. */
function DetailsSection({ plugin }: { plugin: PluginView }) {
  const { t } = useTranslation(['plugins', 'common']);
  const labels = useCopyLabels();
  const approvedLine = useApprovedLine(plugin);
  const { digest } = plugin;
  // The callout of a changed or missing plugin already says when it was approved.
  const showApproved = plugin.status !== 'changed' && plugin.status !== 'missing';
  return (
    <SectionCard.Root>
      <SectionCard.Section>
        <OverlayHeader
          icon={IconInfoCircle}
          iconColor="blue"
          iconSize={18}
          title={t('detail.title')}
          titleOrder={5}
        />
      </SectionCard.Section>
      <SectionCard.Section>
        <Stack gap="sm">
          <Group gap="xs">
            <PluginStatusChip plugin={plugin} />
          </Group>

          {plugin.description ? <Text fz="sm">{plugin.description}</Text> : null}
          {showApproved && approvedLine ? (
            <Text c="dimmed" fz="xs">
              {approvedLine}
            </Text>
          ) : null}

          <DetailList>
            <CopyableDataListItem
              {...labels}
              label={t('detail.fields.id')}
              monospace
              value={plugin.id}
            />
            {plugin.version ? (
              <CopyableDataListItem
                {...labels}
                label={t('detail.fields.version')}
                value={plugin.version}
              />
            ) : null}
            {plugin.license ? (
              <CopyableDataListItem
                {...labels}
                label={t('detail.fields.license')}
                value={plugin.license}
              />
            ) : null}
            {plugin.trust === null ? null : (
              <DetailRow label={t('detail.fields.trust')}>
                <Stack align="flex-start" gap={4}>
                  <TrustBadge trust={plugin.trust} />
                  <Text c="dimmed" fz="xs">
                    {t(`trustHint.${plugin.trust}`)}
                  </Text>
                </Stack>
              </DetailRow>
            )}
            {plugin.provides.length > 0 ? (
              <DetailRow label={t('detail.provides')}>
                <Group gap={6} wrap="wrap">
                  {plugin.provides.map((item, index) => (
                    <Tooltip
                      key={`${item.kind}:${item.mode}:${String(index)}`}
                      label={
                        item.mode === 'declarative'
                          ? t('provides.declarativeHint')
                          : t('provides.codeHint')
                      }
                    >
                      <Badge
                        autoContrast
                        color={tagColor(item.kind)}
                        leftSection={<TbTag aria-hidden size={12} />}
                        px={6}
                        size="md"
                        variant="transparent"
                      >
                        {item.mode === 'declarative'
                          ? t('provides.declarative', { kind: item.kind })
                          : item.kind}
                      </Badge>
                    </Tooltip>
                  ))}
                </Group>
              </DetailRow>
            ) : null}
          </DetailList>

          {digest !== null ? (
            <CopyableCodeBlock
              {...labels}
              inputWrapperProps={{
                label: t('detail.fields.digest'),
                description: t('detail.digestHint'),
              }}
              size="small"
              value={digest}
            />
          ) : null}
        </Stack>
      </SectionCard.Section>
    </SectionCard.Root>
  );
}

/** What the plugin's process loaded: each extension kind and the methods it offers (names are data). */
function ModuleList({
  modules,
  declarative = false,
}: {
  modules: PluginRuntime['modules'];
  declarative?: boolean;
}) {
  const { t } = useTranslation('plugins');
  return (
    <Stack gap="xs">
      <Text c="dimmed" fz="sm">
        {t('runtime.modulesTitle')}
      </Text>
      {modules.map((module) => (
        <Stack gap={4} key={module.kind}>
          <Text ff="monospace" fw={500} fz="sm">
            {module.kind}
          </Text>
          <Text c="dimmed" fz="xs">
            {declarative ? t('runtime.operationsTitle') : t('runtime.methodsTitle')}
          </Text>
          {module.methods.length === 0 ? (
            <Text c="dimmed" fz="xs">
              {t('runtime.noMethods')}
            </Text>
          ) : (
            <Group gap={4} wrap="wrap">
              {module.methods.map((method) => (
                <Badge color="gray" ff="monospace" key={method} size="md" tt="none" variant="light">
                  {method}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * The state of the plugin's process, and the Check button that loads it. The process is restricted; the section says
 * so plainly, because an enabled plugin is code from somewhere. A plugin that is only data has no process.
 */
function RuntimeSection({ plugin, canManage }: { plugin: PluginView; canManage: boolean }) {
  const { t } = useTranslation(['plugins', 'common']);
  const formatDate = useDateTime('short');
  const formatNumber = useNumber();
  const queryClient = useQueryClient();
  const step = useStepUp();
  const fail = usePluginFailure();
  const labels = useCopyLabels();
  const { runtime } = plugin;
  const enabled = plugin.status === 'enabled';
  // The code runs in a container the administrator starts, not in a process of Swellwright's.
  const inContainer = plugin.sidecar !== null;
  // Only data (declarative): there is no code, so no process ever starts and there is nothing to check.
  const noCode =
    enabled &&
    runtime.state === 'stopped' &&
    plugin.provides.every((item) => item.mode === 'declarative');
  const check = useMutation({
    mutationFn: () => step.run(() => checkPlugin(plugin.id)),
    onSuccess: (checked) => {
      // The dialog follows the list, so the fresh runtime goes in at once; the refetch below settles the rest.
      queryClient.setQueryData<PluginList>(['plugins'], (list) =>
        list
          ? {
              ...list,
              plugins: list.plugins.map((item) => (item.id === checked.id ? checked : item)),
            }
          : list,
      );
    },
    onError: (error) => {
      fail(t('runtime.check.button'), error, t('runtime.check.forbidden'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  let checkNote: string = t('runtime.check.note');
  if (noCode) {
    checkNote = t('runtime.check.noteData');
  } else if (inContainer) {
    checkNote = t('runtime.check.noteSidecar');
  }
  const checkRow =
    canManage && (noCode || enabled) ? (
      <Stack gap="xs">
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          loading={check.isPending}
          onClick={() => {
            check.mutate();
          }}
          size="sm"
          variant="soft"
          w="fit-content"
        >
          {t('runtime.check.button')}
        </Button>
        <Text c="dimmed" fz="xs">
          {checkNote}
        </Text>
      </Stack>
    ) : null;

  return (
    <SectionCard.Root>
      <SectionCard.Section>
        <OverlayHeader
          icon={IconActivity}
          iconColor="cyan"
          iconSize={18}
          title={t('runtime.title')}
          titleOrder={5}
        />
      </SectionCard.Section>
      <SectionCard.Section>
        <Stack gap="sm">
          {noCode ? (
            <>
              <Text fz="sm">{t('runtime.noCode')}</Text>
              {runtime.modules.length > 0 ? (
                <ModuleList declarative modules={runtime.modules} />
              ) : null}
            </>
          ) : (
            <>
              <Group gap="xs">
                <StatusBadge kind={RUNTIME_KIND[runtime.state]}>
                  {t(`runtime.states.${runtime.state}`)}
                </StatusBadge>
              </Group>
              {runtime.state === 'stopped' ? (
                <Text c="dimmed" fz="sm">
                  {inContainer ? t('runtime.sidecarIdle') : t('runtime.idle')}
                </Text>
              ) : null}
              {runtime.state === 'running' ? (
                <DetailList>
                  {runtime.startedAt ? (
                    <DetailRow label={t('runtime.started')}>
                      {formatDate(runtime.startedAt)}
                    </DetailRow>
                  ) : null}
                  <DetailRow label={t('runtime.calls')}>{formatNumber(runtime.calls)}</DetailRow>
                </DetailList>
              ) : null}
              {runtime.state === 'failed' ? (
                <Callout color="red" title={t('runtime.failedTitle')}>
                  <ErrorMessageBlock
                    message={runtime.lastError ?? t('runtime.failedUnknown')}
                    {...labels}
                  />
                </Callout>
              ) : null}
              {runtime.modules.length > 0 ? <ModuleList modules={runtime.modules} /> : null}
              <Text c="dimmed" fz="xs">
                {inContainer ? t('runtime.restrictedContainer') : t('runtime.restricted')}
              </Text>
            </>
          )}
          {checkRow}
        </Stack>
      </SectionCard.Section>
    </SectionCard.Root>
  );
}

/**
 * What is inside the review dialog. Keyed by the plugin, so a mutation's state never carries over. `opened` is the
 * plugin as it was when the dialog opened; `live` is the same plugin in the list now. An enabled plugin cannot be
 * approved, so what is shown for it follows the list (a check changes its runtime, and may switch it off). Any other
 * plugin keeps what was shown when the dialog opened: an approval is of that, not of whatever the files became since.
 */
function ReviewBody({
  plugin: opened,
  live,
  canManage,
  canReadVault,
  onClose,
  onDone,
  onNestedChange,
}: {
  plugin: PluginView;
  live: PluginView | undefined;
  canManage: boolean;
  canReadVault: boolean;
  onClose: () => void;
  onDone: (notice: Notice) => void;
  onNestedChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['plugins', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const fail = usePluginFailure();
  const plugin = opened.status === 'enabled' && live !== undefined ? live : opened;
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
      fail(t('enable.confirm'), error, t('manageForbidden'));
    },
  });
  // What the plugin was approved for stands in for what its files ask for, when the files are gone.
  const approvedPermissions =
    plugin.permissions === null ? (plugin.approval?.permissions ?? null) : null;

  return (
    <>
      <Stack gap="md">
        <StatusBlocks plugin={plugin} />

        <DetailsSection plugin={plugin} />

        {plugin.permissions ? (
          <AsksSection color="cyan" permissions={plugin.permissions} title={t('asks.title')} />
        ) : null}
        {approvedPermissions ? (
          <AsksSection
            color="teal"
            permissions={approvedPermissions}
            title={t('asks.approvedTitle')}
          />
        ) : null}

        {plugin.hasConfig && plugin.discovery === 'available' ? (
          <PluginSettings canManage={canManage} canReadVault={canReadVault} plugin={plugin} />
        ) : null}

        {plugin.sidecar !== null ? (
          <SidecarSection canManage={canManage} onDialogChange={onNestedChange} plugin={plugin} />
        ) : null}

        {plugin.status === 'enabled' || plugin.runtime.state !== 'stopped' ? (
          <RuntimeSection canManage={canManage} plugin={plugin} />
        ) : null}

        {plugin.trust === 'local' ? (
          <Callout title={t('local.title')}>{t('local.body')}</Callout>
        ) : null}
        {plugin.signed ? (
          <Callout color="gray" icon={<IconInfoCircle size={20} />}>
            {t('signed')}
          </Callout>
        ) : null}

        {canEnable ? (
          <Callout color="cyan" icon={<IconInfoCircle size={20} />}>
            {t('enable.note')}
          </Callout>
        ) : null}
      </Stack>

      <ModalFooter>
        {canEnable ? (
          <Button
            color="teal"
            leftSection={<IconPlayerPlay size={16} />}
            loading={enable.isPending}
            onClick={() => {
              enable.mutate(digest);
            }}
            size="md"
            variant="soft"
          >
            {t('enable.confirm')}
          </Button>
        ) : (
          <Button color="teal" onClick={onClose} size="md" variant="light">
            {t('common:close')}
          </Button>
        )}
      </ModalFooter>
    </>
  );
}

/** The detail dialog. It is also where a plugin is enabled: the person confirms what they were just shown. */
function ReviewDialog({
  plugin,
  live,
  canManage,
  canReadVault,
  onClose,
  onDone,
}: {
  plugin: PluginView | undefined;
  live: PluginView | undefined;
  canManage: boolean;
  canReadVault: boolean;
  onClose: () => void;
  onDone: (notice: Notice) => void;
}) {
  // A dialog opened over this one (the compose fragment) takes the Escape key for itself.
  const [nestedOpen, setNestedOpen] = useState(false);
  const isMobile = useIsMobile();
  return (
    <Modal
      closeOnEscape={!nestedOpen}
      fullScreen={isMobile}
      onClose={onClose}
      opened={plugin !== undefined}
      size="lg"
      title={
        plugin ? (
          <OverlayHeader
            icon={IconPuzzle}
            iconColor="teal"
            subtitle={plugin.name ? plugin.id : undefined}
            title={displayName(plugin)}
          />
        ) : (
          ''
        )
      }
    >
      {plugin ? (
        <ReviewBody
          canManage={canManage}
          canReadVault={canReadVault}
          key={plugin.id}
          live={live}
          onClose={onClose}
          onDone={onDone}
          onNestedChange={setNestedOpen}
          plugin={plugin}
        />
      ) : null}
    </Modal>
  );
}

/** How to point the server at its plugin directories: the two variables, in code spans. */
function NoDirectoriesText() {
  return <Trans components={{ code: <Code /> }} i18nKey="directories.none" ns="plugins" />;
}

/**
 * The empty page, as the panel draws an empty plugin list: a warning that plugins are code, a large gray icon, what
 * is wrong, and (when no directory is set) how to point the server at one.
 */
function PluginsEmpty({ configured }: { configured: boolean }) {
  const { t } = useTranslation('plugins');
  return (
    <SectionCard.Root p="xl">
      <SectionCard.Section>
        <OverlayHeader
          icon={IconAlertTriangle}
          iconColor="orange"
          subtitle={t('empty.warning')}
          title={t('empty.warningTitle')}
        />
      </SectionCard.Section>
      <SectionCard.Section>
        <Center py="xl">
          <Stack align="center" gap="lg">
            <ThemeIcon aria-hidden color="gray" radius="xl" size={64} variant="soft">
              <IconPuzzle size={32} />
            </ThemeIcon>
            <Stack align="center" gap="xs">
              <Text fw={600} size="lg" ta="center">
                {configured ? t('directories.emptyTitle') : t('directories.noneTitle')}
              </Text>
              {configured ? (
                <Text c="dimmed" maw={400} size="sm" ta="center">
                  {t('directories.empty')}
                </Text>
              ) : null}
            </Stack>
            {configured ? null : (
              <Callout color="blue" icon={<IconInfoCircle size={20} />} maw={520}>
                <NoDirectoriesText />
              </Callout>
            )}
          </Stack>
        </Center>
      </SectionCard.Section>
    </SectionCard.Root>
  );
}

/**
 * The plugins of the instance (Settings, Plugins). Reading needs `plugins:read`; enabling and disabling need
 * `plugins:manage` and a fresh confirmation with a code.
 */
export function PluginsPage({ permissions }: { permissions: readonly Permission[] }) {
  const { t } = useTranslation(['plugins', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const fail = usePluginFailure();
  const canManage = permissions.includes('plugins:manage');
  const canReadVault = permissions.includes('vault:read');
  const [reviewing, setReviewing] = useState<PluginView | undefined>(undefined);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['plugins'], queryFn: listPlugins, retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plugins'] });
  const done = (result: Notice) => {
    setReviewing(undefined);
    notifySuccess(
      t(`notice.${result.kind}Title`),
      t(`notice.${result.kind}`, { name: result.name }),
    );
    void refresh();
  };
  const disable = useMutation({
    mutationFn: (plugin: PluginView) => step.run(() => disablePlugin(plugin.id)),
    onSuccess: (disabled) => {
      done({ kind: 'disabled', name: displayName(disabled) });
    },
    onError: (error) => {
      fail(t('disable.confirm'), error, t('manageForbidden'));
    },
  });
  const askDisable = (plugin: PluginView) => {
    confirmAction({
      title: t('disable.title', { name: displayName(plugin) }),
      message: t('disable.body'),
      confirmLabel: t('disable.confirm'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => {
        disable.mutate(plugin);
      },
    });
  };

  const plugins = list.data?.plugins;
  const rows = useMemo(
    () => (plugins ?? []).map((plugin) => ({ plugin, tags: filtersOf(plugin) })),
    [plugins],
  );
  const visible = filterByTag(rows, activeTag);
  const liveReviewing = reviewing ? plugins?.find((item) => item.id === reviewing.id) : undefined;
  const configured = list.data
    ? list.data.directories.official ||
      list.data.directories.local ||
      list.data.directories.community
    : true;

  return (
    <>
      <PageHeader
        actions={
          <HeaderActions>
            <HeaderAction
              color="lime"
              href={PLUGINS_DOCS_URL}
              icon={IconBook}
              label={t('header.docs')}
              target="_blank"
            />
            <HeaderAction
              icon={IconRefresh}
              label={t('common:refresh')}
              loading={list.isRefetching}
              onClick={() => void list.refetch()}
            />
          </HeaderActions>
        }
        description={t('header.description')}
        icon={<IconPuzzle size={24} />}
        title={t('header.title')}
      />

      {list.isPending ? (
        <LoadingScreen height="60vh" />
      ) : list.isError ? (
        <FailureCard
          message={describeError(t, list.error, t('signInAgain'), t('loadFailed'))}
          onRetry={() => void list.refetch()}
          retrying={list.isRefetching}
          title={t('loadFailedTitle')}
        />
      ) : (
        // The panel fades its list in over half a second (`node-plugins-base-page.component.tsx`).
        <motion.div
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {!configured && rows.length > 0 ? (
            <Callout color="blue" icon={<IconInfoCircle size={20} />} mb="md">
              <NoDirectoriesText />
            </Callout>
          ) : null}
          {rows.length === 0 ? <PluginsEmpty configured={configured} /> : null}
          {rows.length > 0 ? (
            <>
              <TagFilterBar
                activeTag={activeTag}
                allLabel={t('filter.all')}
                items={rows}
                onChange={setActiveTag}
                tagLabel={(tag) => t(`filter.${filterOfTag(tag)}`)}
                untaggedLabel={t('filter.inactive')}
              />
              <Box style={{ paddingInline: 'calc(var(--mantine-spacing-md) - 4px)' }}>
                <SimpleGrid cols={{ base: 1, '1000px': 2 }} p={4} spacing={8} type="container">
                  {visible.map(({ plugin }) => (
                    <PluginCard
                      canManage={canManage}
                      key={plugin.id}
                      onDisable={askDisable}
                      onReview={setReviewing}
                      plugin={plugin}
                    />
                  ))}
                </SimpleGrid>
              </Box>
            </>
          ) : null}
        </motion.div>
      )}

      <ReviewDialog
        canManage={canManage}
        canReadVault={canReadVault}
        live={liveReviewing}
        onClose={() => {
          setReviewing(undefined);
        }}
        onDone={done}
        plugin={reviewing}
      />
    </>
  );
}
