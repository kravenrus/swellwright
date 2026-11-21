// What was found on a server. The first card is the panel's node system card (src/widgets/dashboard/nodes/
// node-system-card/node-system-card.widget.tsx): the violet header with the platform and uptime badges, the tinted
// subsections with a small uppercase label, monospace values and a `Progress` with `radius="xl"` that turns yellow above
// 70 % and red above 90 %. Services and security are `DataList` cards as in the panel's drawers, and the tables inside a
// dialog are `@kastov/mantine-datatable` (ADR 0033). A facts card has no other counterpart in the panel.
import {
  Badge,
  Button,
  DataList,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconBox,
  IconNetwork,
  IconRefresh,
  IconServerCog,
  IconShieldLock,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PiClockDuotone,
  PiCpuDuotone,
  PiDesktopTowerDuotone,
  PiLinuxLogoDuotone,
  PiNetworkDuotone,
  PiTimerDuotone,
  PiWarningDuotone,
} from 'react-icons/pi';

import type { ServerFacts, ServerView } from '@swellwright/contracts';
import {
  Callout,
  CopyableCell,
  DataTable,
  type DataTableSortStatus,
  EllipsisCell,
  OverlayHeader,
  SectionCard,
  sortRecords,
} from '@swellwright/ui';

import { refreshServerFacts } from '../api.js';
import { useBytes, useNumber } from '../format.js';
import { useTimeFirst } from '../security/time-first.js';
import { notifySuccess } from '../shell/feedback.js';
import './facts-card.css';
import { notifySshFailure } from './ssh-errors.js';

const DASH = '–';

/** The panel's system card colours a bar teal, yellow above 70 % and red above 90 %. */
const barColor = (percent: number): string =>
  percent > 90 ? 'red' : percent > 70 ? 'yellow' : 'teal';

const SERVICE_COLOR = {
  active: 'teal',
  inactive: 'gray',
  failed: 'red',
  activating: 'yellow',
  deactivating: 'yellow',
  not_installed: 'dark',
} as const;

/** One bar: the label (the panel's stat label), "used / total (percent)" in monospace, and the `Progress`. */
function UsageBlock({
  label,
  used,
  total,
  format,
}: {
  label?: string;
  used: number;
  total: number;
  format: (bytes: number) => string;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((used * 100) / total)) : 0;
  return (
    <div>
      {label ? (
        <Text className="sw-facts-stat-label" mb={2}>
          {label}
        </Text>
      ) : null}
      <Group justify="space-between" mb={4}>
        <Text className="sw-facts-values">
          {format(used)} / {format(total)} <span className="sw-facts-percent">({percent}%)</span>
        </Text>
      </Group>
      <Progress
        aria-label={`${label ?? ''} ${String(percent)} %`.trim()}
        color={barColor(percent)}
        radius="xl"
        size="sm"
        value={percent}
      />
    </div>
  );
}

/** A label with a small icon over a value, as the panel's system card shows CPU and kernel. */
function Stat({
  label,
  icon,
  children,
  span,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <Stack gap={0} style={{ minWidth: 0, ...(span ? { gridColumn: '1 / -1' } : {}) }}>
      <Text className="sw-facts-stat-label" component="div">
        <Group gap={4}>
          {icon}
          {label}
        </Group>
      </Text>
      {children}
    </Stack>
  );
}

/** The value of a `Stat`: one line, monospace, cut with an ellipsis; the whole text is the tooltip. */
function StatValue({ text }: { text: string }) {
  return (
    <Tooltip disabled={text === DASH} label={text} withArrow>
      <Text className="sw-facts-stat-value">{text}</Text>
    </Tooltip>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DataList.Item>
      <DataList.ItemLabel>{label}</DataList.ItemLabel>
      <DataList.ItemValue>{children}</DataList.ItemValue>
    </DataList.Item>
  );
}

const orDash = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === '' ? DASH : String(value);

type PortRecord = NonNullable<ServerFacts['listeningPorts']>[number] & { key: string };
type ContainerRecord = NonNullable<ServerFacts['containers']>[number];

function PortsTable({ ports }: { ports: NonNullable<ServerFacts['listeningPorts']> }) {
  const { t } = useTranslation('servers');
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<PortRecord>>({
    columnAccessor: 'port',
    direction: 'asc',
  });
  const records = useMemo(
    () =>
      sortRecords(
        ports.map((port) => ({ ...port, key: `${port.address}|${String(port.port)}` })),
        sortStatus,
      ),
    [ports, sortStatus],
  );
  return (
    <DataTable<PortRecord>
      borderRadius="sm"
      columns={[
        {
          accessor: 'port',
          title: t('facts.ports.port'),
          sortable: true,
          width: 100,
          render: (record) => (
            <Text ff="monospace" size="sm">
              {record.port}
            </Text>
          ),
        },
        {
          accessor: 'address',
          title: t('facts.ports.address'),
          sortable: true,
          ellipsis: true,
          render: (record) => <CopyableCell value={record.address} />,
        },
        {
          accessor: 'process',
          title: t('facts.ports.process'),
          sortable: true,
          ellipsis: true,
          render: (record) => <EllipsisCell>{orDash(record.process)}</EllipsisCell>,
        },
      ]}
      highlightOnHover
      idAccessor="key"
      noRecordsText={t('facts.ports.empty')}
      {...(records.length === 0 ? { minHeight: 140 } : {})}
      onSortStatusChange={setSortStatus}
      records={records}
      sortStatus={sortStatus}
      striped
      withColumnBorders
      withRowBorders
      withTableBorder
    />
  );
}

function ContainersTable({ containers }: { containers: NonNullable<ServerFacts['containers']> }) {
  const { t } = useTranslation('servers');
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<ContainerRecord>>({
    columnAccessor: 'name',
    direction: 'asc',
  });
  const records = useMemo(() => sortRecords(containers, sortStatus), [containers, sortStatus]);
  return (
    <DataTable<ContainerRecord>
      borderRadius="sm"
      columns={[
        {
          accessor: 'name',
          title: t('facts.containers.name'),
          sortable: true,
          ellipsis: true,
          render: (record) => <CopyableCell value={record.name} />,
        },
        {
          accessor: 'imageName',
          title: t('facts.containers.image'),
          sortable: true,
          ellipsis: true,
          render: (record) => <EllipsisCell>{record.imageName}</EllipsisCell>,
        },
        {
          accessor: 'imageTag',
          title: t('facts.containers.tag'),
          sortable: true,
          width: 140,
          render: (record) => (
            <Text ff="monospace" size="sm">
              {orDash(record.imageTag)}
            </Text>
          ),
        },
        {
          accessor: 'state',
          title: t('facts.containers.state'),
          sortable: true,
          width: 130,
          render: (record) => (
            <Badge
              color={
                record.state === 'running' ? 'teal' : record.state === 'exited' ? 'gray' : 'orange'
              }
              size="lg"
              variant="soft"
            >
              {record.state}
            </Badge>
          ),
        },
        {
          accessor: 'status',
          title: t('facts.containers.status'),
          ellipsis: true,
          render: (record) => <EllipsisCell>{orDash(record.status)}</EllipsisCell>,
        },
      ]}
      highlightOnHover
      idAccessor="name"
      noRecordsText={t('facts.containers.empty')}
      {...(records.length === 0 ? { minHeight: 140 } : {})}
      onSortStatusChange={setSortStatus}
      records={records}
      sortStatus={sortStatus}
      striped
      withColumnBorders
      withRowBorders
      withTableBorder
    />
  );
}

export function FactsCard({
  server,
  canWrite,
  onChanged,
}: {
  server: ServerView;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation(['servers', 'common']);
  const formatTime = useTimeFirst();
  const formatBytes = useBytes();
  const formatNumber = useNumber();
  const queryClient = useQueryClient();
  const record = server.facts;
  const facts = record?.facts;

  const refresh = useMutation({
    mutationFn: () => refreshServerFacts(server.id),
    onSuccess: () => {
      notifySuccess(t('toast.success'), t('facts.refreshed', { name: server.name }));
      void queryClient.invalidateQueries({ queryKey: ['servers'] });
      void queryClient.invalidateQueries({ queryKey: ['server', server.id] });
      onChanged();
    },
    onError: (error) => {
      notifySshFailure(t, t('facts.refreshFailed'), error, t('signInAgain'), t('facts.forbidden'));
    },
  });

  const duration = (seconds: number): string => {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) {
      return `${t('facts.duration.days', { count: days })} ${t('facts.duration.hours', { count: hours })}`;
    }
    if (hours > 0) {
      return `${t('facts.duration.hours', { count: hours })} ${t('facts.duration.minutes', { count: minutes })}`;
    }
    return minutes > 0
      ? t('facts.duration.minutes', { count: minutes })
      : t('facts.duration.seconds', { count: seconds });
  };

  const yesNo = (value: boolean | null): string =>
    value === null ? DASH : value ? t('facts.security.yes') : t('facts.security.no');

  // What only root can read is unknown, not empty: say why when the login was not root.
  const needsRoot = facts?.collectedAs === 'user';

  const platform =
    facts?.kernel?.name && facts.kernel.arch ? `${facts.kernel.name} / ${facts.kernel.arch}` : null;

  const header = (
    <SectionCard.Section>
      <Group align="center" justify="space-between" wrap="nowrap">
        <OverlayHeader
          icon={PiDesktopTowerDuotone}
          iconColor="violet"
          iconSize={20}
          subtitle={
            record && facts
              ? `${t('facts.collected', { time: formatTime(record.collectedAt) })}${
                  facts.collectedAs ? `, ${t(`facts.collectedAs.${facts.collectedAs}`)}` : ''
                }`
              : undefined
          }
          title={t('facts.title')}
          titleOrder={5}
        />
        <Group gap="xs" wrap="nowrap">
          {platform ? (
            <Badge color="violet" ff="monospace" size="sm" variant="soft" visibleFrom="sm">
              {platform}
            </Badge>
          ) : null}
          {facts?.uptimeSeconds != null ? (
            <Badge
              color="teal"
              ff="monospace"
              leftSection={<PiTimerDuotone size={12} />}
              size="lg"
              variant="light"
            >
              {duration(facts.uptimeSeconds)}
            </Badge>
          ) : null}
          {canWrite ? (
            <Button
              color="teal"
              leftSection={<IconRefresh size={16} />}
              loading={refresh.isPending}
              onClick={() => {
                refresh.mutate();
              }}
              variant="soft"
            >
              {t('facts.refresh')}
            </Button>
          ) : null}
        </Group>
      </Group>
    </SectionCard.Section>
  );

  if (!record || !facts) {
    return (
      <SectionCard.Root>
        {header}
        <SectionCard.Section>
          <Text c="dimmed" size="sm">
            {t('facts.empty')}
          </Text>
        </SectionCard.Section>
      </SectionCard.Root>
    );
  }

  const memoryUsed =
    facts.memory?.totalBytes != null && facts.memory.availableBytes != null
      ? facts.memory.totalBytes - facts.memory.availableBytes
      : null;
  const swapTotal = facts.memory?.swapTotalBytes ?? null;
  const swapUsed =
    swapTotal !== null && facts.memory?.swapFreeBytes != null
      ? swapTotal - facts.memory.swapFreeBytes
      : null;
  const disks = facts.disks ?? [];

  return (
    <Stack gap="md">
      <SectionCard.Root gap="sm">
        {header}

        {memoryUsed !== null && facts.memory?.totalBytes != null ? (
          <SectionCard.Section>
            <div className="sw-facts-subsection sw-facts-memory">
              <Stack gap={6}>
                <Text c="dimmed" fw={600} lh={1} lts={1} size="10px" tt="uppercase">
                  {t('facts.resources.memory')}
                </Text>
                <UsageBlock
                  format={formatBytes}
                  total={facts.memory.totalBytes}
                  used={memoryUsed}
                />
                {swapTotal !== null && swapTotal > 0 && swapUsed !== null ? (
                  <UsageBlock
                    format={formatBytes}
                    label={t('facts.resources.swap')}
                    total={swapTotal}
                    used={swapUsed}
                  />
                ) : swapTotal === 0 ? (
                  <Text c="dimmed" size="xs">
                    {t('facts.resources.swap')}: {t('facts.resources.noSwap')}
                  </Text>
                ) : null}
              </Stack>
            </div>
          </SectionCard.Section>
        ) : null}

        {disks.length > 0 ? (
          <SectionCard.Section>
            <div className="sw-facts-subsection sw-facts-disks">
              <Stack gap={6}>
                <Text c="dimmed" fw={600} lh={1} lts={1} size="10px" tt="uppercase">
                  {t('facts.resources.disks')}
                </Text>
                {disks.map((disk) => (
                  <UsageBlock
                    format={formatBytes}
                    key={`${disk.device}|${disk.mount}`}
                    label={`${disk.mount} (${disk.device})`}
                    total={disk.usedBytes + disk.availableBytes}
                    used={disk.usedBytes}
                  />
                ))}
              </Stack>
            </div>
          </SectionCard.Section>
        ) : null}

        <SectionCard.Section>
          <div className="sw-facts-subsection sw-facts-info">
            <Stack gap={6}>
              <Text c="dimmed" fw={600} lh={1} lts={1} size="10px" tt="uppercase">
                {t('facts.sections.system')}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing={6}>
                <Stat icon={<PiLinuxLogoDuotone size={12} />} label={t('facts.system.os')} span>
                  <StatValue text={orDash(facts.os?.prettyName)} />
                </Stat>
                <Stat icon={<PiLinuxLogoDuotone size={12} />} label={t('facts.system.kernel')}>
                  <StatValue text={orDash(facts.kernel?.release)} />
                </Stat>
                <Stat icon={<PiNetworkDuotone size={12} />} label={t('facts.system.hostname')}>
                  <StatValue text={orDash(facts.hostname)} />
                </Stat>
                <Stat icon={<PiCpuDuotone size={12} />} label={t('facts.system.cpus')}>
                  <StatValue
                    text={
                      facts.cpuCount === null
                        ? DASH
                        : `${formatNumber(facts.cpuCount)}${
                            facts.loadAverage
                              ? `, ${t('facts.system.load')} ${facts.loadAverage.join(' ')}`
                              : ''
                          }`
                    }
                  />
                </Stat>
                <Stat icon={<PiTimerDuotone size={12} />} label={t('facts.system.booted')}>
                  <StatValue text={facts.bootedAt ? formatTime(facts.bootedAt) : DASH} />
                </Stat>
                <Stat icon={<PiClockDuotone size={12} />} label={t('facts.system.time')}>
                  <StatValue text={facts.time?.utc ? formatTime(facts.time.utc) : DASH} />
                </Stat>
                <Stat icon={<PiClockDuotone size={12} />} label={t('facts.system.skew')}>
                  <StatValue
                    text={
                      facts.time?.skewSeconds == null
                        ? DASH
                        : t('facts.system.skewValue', { count: facts.time.skewSeconds })
                    }
                  />
                </Stat>
                <Stat label={t('facts.system.timezone')}>
                  <StatValue text={orDash(facts.time?.timezone)} />
                </Stat>
                <Stat label={t('facts.system.ntp')}>
                  <StatValue text={yesNo(facts.time?.ntpSynchronized ?? null)} />
                </Stat>
                <Stat label={t('facts.system.systemd')}>
                  <StatValue text={orDash(facts.systemd?.state)} />
                </Stat>
                {facts.systemd && facts.systemd.failedUnits.length > 0 ? (
                  <Stat label={t('facts.system.failed')} span>
                    <StatValue text={facts.systemd.failedUnits.join(', ')} />
                  </Stat>
                ) : null}
                {record.scriptSha256 ? (
                  <Stat label={t('facts.system.script')} span>
                    <StatValue text={record.scriptSha256} />
                  </Stat>
                ) : null}
              </SimpleGrid>
            </Stack>
          </div>
        </SectionCard.Section>
      </SectionCard.Root>

      {facts.services !== null ? (
        <SectionCard.Root>
          <SectionCard.Section>
            <OverlayHeader
              icon={IconServerCog}
              iconColor="violet"
              title={t('facts.sections.services')}
              titleOrder={5}
            />
          </SectionCard.Section>
          <SectionCard.Section>
            <DataList orientation="vertical" withDivider>
              {facts.services.map((service) => {
                const version =
                  service.name === 'ssh' || service.name === 'ufw'
                    ? null
                    : (facts.versions?.[service.name] ?? null);
                return (
                  <Row key={service.name} label={t(`facts.services.${service.name}`)}>
                    <Group gap="xs" wrap="wrap">
                      {service.state === null ? (
                        DASH
                      ) : (
                        <Badge color={SERVICE_COLOR[service.state]} size="lg" variant="soft">
                          {t(`facts.services.states.${service.state}`)}
                        </Badge>
                      )}
                      {version ? (
                        <Text c="dimmed" ff="monospace" size="xs">
                          {version}
                        </Text>
                      ) : null}
                    </Group>
                  </Row>
                );
              })}
            </DataList>
          </SectionCard.Section>
        </SectionCard.Root>
      ) : null}

      {facts.listeningPorts !== null ? (
        <SectionCard.Root>
          <SectionCard.Section>
            <OverlayHeader
              icon={IconNetwork}
              iconColor="indigo"
              subtitle={
                needsRoot && facts.listeningPorts.some((port) => port.process === null)
                  ? t('facts.needsRoot')
                  : undefined
              }
              title={t('facts.sections.ports')}
              titleOrder={5}
            />
          </SectionCard.Section>
          <SectionCard.Section>
            <PortsTable ports={facts.listeningPorts} />
          </SectionCard.Section>
        </SectionCard.Root>
      ) : null}

      {facts.containers !== null || (needsRoot && facts.versions?.docker) ? (
        <SectionCard.Root>
          <SectionCard.Section>
            <OverlayHeader
              icon={IconBox}
              iconColor="blue"
              subtitle={facts.containers === null ? t('facts.needsRoot') : undefined}
              title={t('facts.sections.containers')}
              titleOrder={5}
            />
          </SectionCard.Section>
          {facts.containers !== null ? (
            <SectionCard.Section>
              <ContainersTable containers={facts.containers} />
            </SectionCard.Section>
          ) : null}
        </SectionCard.Root>
      ) : null}

      <SectionCard.Root>
        <SectionCard.Section>
          <OverlayHeader
            icon={IconShieldLock}
            iconColor="teal"
            subtitle={
              needsRoot && (facts.sshd === null || facts.firewall?.ufw == null)
                ? t('facts.needsRoot')
                : undefined
            }
            title={t('facts.sections.security')}
            titleOrder={5}
          />
        </SectionCard.Section>
        <SectionCard.Section>
          <DataList orientation="vertical" withDivider>
            <Row label={t('facts.security.sshPort')}>
              <Text ff="monospace" size="sm">
                {orDash(facts.sshd?.port)}
              </Text>
            </Row>
            <Row label={t('facts.security.password')}>
              {facts.sshd?.passwordAuthentication == null ? (
                DASH
              ) : (
                <Badge
                  color={facts.sshd.passwordAuthentication ? 'orange' : 'teal'}
                  size="lg"
                  variant="soft"
                >
                  {facts.sshd.passwordAuthentication
                    ? t('facts.security.enabled')
                    : t('facts.security.disabled')}
                </Badge>
              )}
            </Row>
            <Row label={t('facts.security.rootLogin')}>
              <Text ff="monospace" size="sm">
                {orDash(facts.sshd?.permitRootLogin)}
              </Text>
            </Row>
            <Row label={t('facts.security.ufw')}>
              {facts.firewall?.ufw == null ? (
                DASH
              ) : (
                <Badge
                  color={facts.firewall.ufw === 'active' ? 'teal' : 'orange'}
                  size="lg"
                  variant="soft"
                >
                  {t(`facts.security.ufwStates.${facts.firewall.ufw}`)}
                </Badge>
              )}
            </Row>
            <Row label={t('facts.security.reboot')}>
              {facts.rebootRequired === null ? (
                DASH
              ) : (
                <Badge color={facts.rebootRequired ? 'orange' : 'teal'} size="lg" variant="soft">
                  {yesNo(facts.rebootRequired)}
                </Badge>
              )}
            </Row>
            <Row label={t('facts.security.updates')}>
              {facts.updates === null ? DASH : formatNumber(facts.updates.upgradable)}
            </Row>
          </DataList>
        </SectionCard.Section>
      </SectionCard.Root>

      {facts.warnings.length > 0 ? (
        <Callout
          color="orange"
          icon={<PiWarningDuotone size={20} />}
          title={t('facts.sections.warnings')}
        >
          <Stack gap={4}>
            {facts.warnings.map((warning) => (
              <Text key={warning} size="sm">
                {warning}
              </Text>
            ))}
          </Stack>
        </Callout>
      ) : null}
    </Stack>
  );
}
