import { SimpleGrid, Stack, Text } from '@mantine/core';
import {
  IconApi,
  IconBook,
  IconDatabase,
  IconDatabaseOff,
  IconHeartbeat,
  IconLayoutDashboard,
  IconRefresh,
  IconServer,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  EmptyPageLayout,
  ErrorMessageBlock,
  HeaderAction,
  HeaderActions,
  MetricCard,
  OverlayHeader,
  PageHeader,
  SectionCard,
  StatRow,
  StatusBadge,
} from '@swellwright/ui';

import { ApiUnreachableError, loadSystemStatus } from './api.js';
import { QueryErrorCard } from './security/query-error.js';

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
        <HeaderActions>
          <HeaderAction
            color="lime"
            href="/api/v1/openapi.json"
            icon={IconBook}
            label={t('checks.apiDescription')}
            target="_blank"
          />
          <HeaderAction
            icon={IconRefresh}
            label={t('common:refresh')}
            loading={isFetching}
            onClick={() => void refetch()}
          />
        </HeaderActions>
      }
      description={t('description')}
      icon={<IconLayoutDashboard size={24} />}
      title={t('title')}
    />
  );

  if (isPending) {
    return (
      <>
        {header}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
          <MetricCard icon={IconApi} iconColor="teal" isLoading title={t('stats.api')} value="" />
          <MetricCard
            icon={IconDatabase}
            iconColor="teal"
            isLoading
            title={t('stats.dependencies')}
            value=""
          />
          <MetricCard
            icon={IconServer}
            iconColor="cyan"
            isLoading
            title={t('stats.version')}
            value=""
          />
        </SimpleGrid>
      </>
    );
  }

  if (error) {
    const unreachable = error instanceof ApiUnreachableError;
    return (
      <>
        {header}
        <QueryErrorCard
          icon={IconApi}
          message={unreachable ? t('error.unreachableText') : t('error.unexpectedText')}
          onRetry={() => void refetch()}
          title={unreachable ? t('error.unreachableTitle') : t('error.unexpectedTitle')}
        />
      </>
    );
  }

  const { ready, version } = data;
  const checks = Object.entries(ready.checks);
  const up = checks.filter(([, check]) => check.status === 'up').length;

  return (
    <>
      {header}
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
          <MetricCard
            icon={IconApi}
            iconColor="teal"
            title={t('stats.api')}
            value={t('stats.alive')}
          />
          <MetricCard
            icon={IconDatabase}
            iconColor={ready.status === 'ready' ? 'teal' : 'red'}
            title={t('stats.dependencies')}
            value={ready.status === 'ready' ? t('stats.ready') : t('stats.notReady')}
            {...(checks.length === 0
              ? {}
              : { subtitle: t('stats.dependenciesSummary', { up, total: checks.length }) })}
          />
          <MetricCard
            icon={IconServer}
            iconColor="cyan"
            title={t('stats.version')}
            value={version.version}
            {...(version.commit ? { subtitle: version.commit.slice(0, 7) } : {})}
          />
        </SimpleGrid>

        {checks.length === 0 ? (
          <EmptyPageLayout
            description={t('checks.none')}
            icon={<IconDatabaseOff size="3rem" />}
            title={t('checks.noneTitle')}
          />
        ) : (
          <SectionCard.Root>
            <SectionCard.Section>
              <OverlayHeader
                icon={IconHeartbeat}
                iconColor="cyan"
                title={t('checks.title')}
                titleOrder={5}
              />
            </SectionCard.Section>
            <SectionCard.Section>
              <Stack gap="xs">
                {checks.map(([name, check]) => (
                  <Stack gap="xs" key={name}>
                    <StatRow
                      label={name}
                      trailing={
                        <>
                          <Text c="dimmed" ff="monospace" size="xs">
                            {t('checks.latencyValue', { ms: check.latencyMs })}
                          </Text>
                          <StatusBadge kind={check.status === 'up' ? 'ok' : 'err'}>
                            {check.status === 'up' ? t('checks.up') : t('checks.down')}
                          </StatusBadge>
                        </>
                      }
                    />
                    {check.error ? (
                      <ErrorMessageBlock
                        copiedLabel={t('common:copied')}
                        copyLabel={t('common:copy')}
                        message={check.error}
                      />
                    ) : null}
                  </Stack>
                ))}
              </Stack>
            </SectionCard.Section>
          </SectionCard.Root>
        )}
      </Stack>
    </>
  );
}
