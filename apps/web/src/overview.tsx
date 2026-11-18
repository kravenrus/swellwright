import {
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconApi,
  IconDatabase,
  IconLayoutDashboard,
  IconRefresh,
  IconServer,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { PageHeader, StatusBadge, StatusText } from '@swellwright/ui';

import { ApiUnreachableError, loadSystemStatus } from './api.js';

function StatCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="md">
      <Group gap="md" wrap="nowrap">
        <ThemeIcon size={40} variant="soft">
          {icon}
        </ThemeIcon>
        <Stack gap={2}>
          <Text c="dimmed" fw={500} fz="sm">
            {label}
          </Text>
          {children}
        </Stack>
      </Group>
    </Card>
  );
}

export function Overview() {
  const { t } = useTranslation(['overview', 'common']);
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['system', 'status'],
    queryFn: loadSystemStatus,
    refetchInterval: 10_000,
  });

  const header = (
    <PageHeader
      actions={
        <Button
          leftSection={<IconRefresh size={16} />}
          loading={isFetching}
          onClick={() => void refetch()}
          variant="default"
        >
          {t('common:refresh')}
        </Button>
      }
      description={t('description')}
      icon={<IconLayoutDashboard size={22} />}
      title={t('title')}
    />
  );

  if (isPending) {
    return (
      <>
        {header}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          <Skeleton h={92} radius="md" />
          <Skeleton h={92} radius="md" />
          <Skeleton h={92} radius="md" />
        </SimpleGrid>
      </>
    );
  }

  if (error) {
    const unreachable = error instanceof ApiUnreachableError;
    return (
      <>
        {header}
        <Alert
          color="red"
          icon={<IconApi size={18} />}
          title={unreachable ? t('error.unreachableTitle') : t('error.unexpectedTitle')}
          variant="light"
        >
          <Stack gap="xs">
            <Text fz="sm">
              {unreachable ? t('error.unreachableText') : t('error.unexpectedText')}
            </Text>
            <Group>
              <Button onClick={() => void refetch()} size="xs" variant="default">
                {t('common:retry')}
              </Button>
            </Group>
          </Stack>
        </Alert>
      </>
    );
  }

  const { ready, version } = data;
  const checks = Object.entries(ready.checks);

  return (
    <>
      {header}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <StatCard icon={<IconApi size={20} />} label={t('stats.api')}>
          <StatusBadge kind="ok">{t('stats.alive')}</StatusBadge>
        </StatCard>
        <StatCard icon={<IconDatabase size={20} />} label={t('stats.dependencies')}>
          {ready.status === 'ready' ? (
            <StatusBadge kind="ok">{t('stats.ready')}</StatusBadge>
          ) : (
            <StatusBadge kind="err">{t('stats.notReady')}</StatusBadge>
          )}
        </StatCard>
        <StatCard icon={<IconServer size={20} />} label={t('stats.version')}>
          <Text fw={600} fz="lg">
            {version.version}
            {version.commit ? (
              <Text c="dimmed" component="span" ff="monospace" fz="xs" ml="xs">
                {version.commit.slice(0, 7)}
              </Text>
            ) : null}
          </Text>
        </StatCard>
      </SimpleGrid>

      <Card mt="md" padding={0}>
        <Group justify="space-between" p="md">
          <Text fw={600}>{t('checks.title')}</Text>
          <Anchor fz="sm" href="/api/v1/openapi.json" rel="noreferrer" target="_blank">
            {t('checks.apiDescription')}
          </Anchor>
        </Group>
        {checks.length === 0 ? (
          <Text c="dimmed" fz="sm" px="md" pb="md">
            {t('checks.none')}
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th pl="md">{t('checks.dependency')}</Table.Th>
                <Table.Th>{t('checks.state')}</Table.Th>
                <Table.Th ta="right">{t('checks.latency')}</Table.Th>
                <Table.Th pr="md">{t('checks.reason')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {checks.map(([name, check]) => (
                <Table.Tr key={name}>
                  <Table.Td fw={500} pl="md">
                    {name}
                  </Table.Td>
                  <Table.Td>
                    <StatusText kind={check.status === 'up' ? 'ok' : 'err'}>
                      {check.status === 'up' ? t('checks.up') : t('checks.down')}
                    </StatusText>
                  </Table.Td>
                  <Table.Td ta="right">
                    {t('checks.latencyValue', { ms: check.latencyMs })}
                  </Table.Td>
                  <Table.Td c="dimmed" pr="md">
                    {check.error ?? ''}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
