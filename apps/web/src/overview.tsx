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
          Refresh
        </Button>
      }
      description="Fleet health, runs and approvals at a glance"
      icon={<IconLayoutDashboard size={22} />}
      title="Overview"
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
          title={
            unreachable ? 'The API does not answer' : 'The API answered with something unexpected'
          }
          variant="light"
        >
          <Stack gap="xs">
            <Text fz="sm">
              {unreachable
                ? 'Start the API (pnpm --filter @swellwright/api start) or check the reverse proxy, then try again.'
                : 'The response does not match the API contract. The API and the console are probably from different versions.'}
            </Text>
            <Group>
              <Button onClick={() => void refetch()} size="xs" variant="default">
                Try again
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
        <StatCard icon={<IconApi size={20} />} label="API">
          <StatusBadge kind="ok">Alive</StatusBadge>
        </StatCard>
        <StatCard icon={<IconDatabase size={20} />} label="Dependencies">
          {ready.status === 'ready' ? (
            <StatusBadge kind="ok">Ready</StatusBadge>
          ) : (
            <StatusBadge kind="err">Not ready</StatusBadge>
          )}
        </StatCard>
        <StatCard icon={<IconServer size={20} />} label="Version">
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
          <Text fw={600}>Dependency checks</Text>
          <Anchor fz="sm" href="/api/v1/openapi.json" rel="noreferrer" target="_blank">
            API description
          </Anchor>
        </Group>
        {checks.length === 0 ? (
          <Text c="dimmed" fz="sm" px="md" pb="md">
            No dependencies are configured yet. Set SW_DATABASE_URL and SW_VALKEY_URL to have them
            checked here.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th pl="md">Dependency</Table.Th>
                <Table.Th>State</Table.Th>
                <Table.Th ta="right">Latency</Table.Th>
                <Table.Th pr="md">Reason</Table.Th>
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
                      {check.status === 'up' ? 'Up' : 'Down'}
                    </StatusText>
                  </Table.Td>
                  <Table.Td ta="right">{check.latencyMs} ms</Table.Td>
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
