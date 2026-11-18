import {
  Alert,
  Button,
  Card,
  Code,
  Group,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconBook, IconRefresh, IconShieldCheck } from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import {
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  type AuditEvent,
  type AuditOutcome,
  type ChainVerification,
  type Permission,
} from '@swellwright/contracts';
import { PageHeader, StatusText, type StatusKind } from '@swellwright/ui';

import { listAudit, verifyAuditChain } from '../api.js';
import { describeError } from '../auth/messages.js';
import { useDateTime } from '../format.js';

const PAGE_SIZE = 50;

const OUTCOME_KIND: Record<AuditOutcome, StatusKind> = {
  success: 'ok',
  failure: 'err',
  denied: 'warn',
};

const shortHash = (hash: string): string => `${hash.slice(0, 12)}…${hash.slice(-6)}`;

function detailsText(event: AuditEvent): string {
  return Object.entries(event.details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

function Verification({ result }: { result: ChainVerification }) {
  const { t } = useTranslation(['audit', 'common']);
  if (result.ok) {
    return (
      <Alert
        color="teal"
        icon={<IconShieldCheck size={18} />}
        title={t('verification.intactTitle')}
        variant="light"
      >
        <Stack gap={4}>
          <Text fz="sm">
            {result.checked === 0
              ? t('verification.emptyLog')
              : t('verification.allChecked', { count: result.checked })}
          </Text>
          {result.head ? (
            <Text c="dimmed" fz="sm">
              <Trans
                components={{ code: <Code /> }}
                i18nKey="verification.head"
                t={t}
                values={{ seq: result.head.seq, hash: shortHash(result.head.hash) }}
              />
            </Text>
          ) : null}
        </Stack>
      </Alert>
    );
  }
  return (
    <Alert
      color="red"
      icon={<IconShieldCheck size={18} />}
      title={t('verification.brokenTitle')}
      variant="light"
    >
      <Text fz="sm">
        {result.problem
          ? [
              t(`verification.problem.${result.problem.reason}`, { seq: result.problem.seq }),
              t('verification.intactBefore', { count: result.checked }),
            ].join(' ')
          : t('verification.failed')}
      </Text>
    </Alert>
  );
}

/** The audit log: newest first, filters, and the integrity check for those who may run it. */
export function AuditPage({ permissions }: { permissions: readonly Permission[] }) {
  const { t } = useTranslation(['audit', 'common']);
  const formatTime = useDateTime('medium');
  const queryClient = useQueryClient();
  const [action, setAction] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AuditOutcome | null>(null);
  const canVerify = permissions.includes('audit:verify');

  const log = useInfiniteQuery({
    queryKey: ['audit', action, outcome],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      listAudit({
        limit: PAGE_SIZE,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
        ...(action ? { action } : {}),
        ...(outcome ? { outcome } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });

  const verify = useMutation({
    mutationFn: verifyAuditChain,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audit'] }),
  });

  const events = log.data?.pages.flatMap((p) => p.events) ?? [];

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button
              leftSection={<IconRefresh size={16} />}
              loading={log.isRefetching && !log.isFetchingNextPage}
              onClick={() => void log.refetch()}
              variant="default"
            >
              {t('common:refresh')}
            </Button>
            {canVerify ? (
              <Button
                leftSection={<IconShieldCheck size={16} />}
                loading={verify.isPending}
                onClick={() => {
                  verify.mutate();
                }}
              >
                {t('verifyChain')}
              </Button>
            ) : null}
          </>
        }
        description={t('description')}
        icon={<IconBook size={22} />}
        title={t('title')}
      />

      {verify.data ? (
        <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
          <Verification result={verify.data} />
        </div>
      ) : null}
      {verify.error ? (
        <Alert color="red" mb="md" variant="light">
          {describeError(t, verify.error, t('signInAgain'), t('verifyForbidden'))}
        </Alert>
      ) : null}

      <Card padding={0}>
        <Group gap="sm" p="md">
          <Select
            aria-label={t('filters.actionLabel')}
            clearable
            data={[...AUDIT_ACTIONS]}
            onChange={setAction}
            placeholder={t('filters.actionPlaceholder')}
            searchable
            value={action}
            w={240}
          />
          <Select
            aria-label={t('filters.outcomeLabel')}
            clearable
            data={AUDIT_OUTCOMES.map((value) => ({ value, label: t(`outcome.${value}`) }))}
            onChange={(value) => {
              setOutcome(AUDIT_OUTCOMES.find((known) => known === value) ?? null);
            }}
            placeholder={t('filters.outcomePlaceholder')}
            value={outcome}
            w={180}
          />
        </Group>

        {log.isPending ? (
          <Stack gap="xs" p="md">
            <Skeleton h={28} />
            <Skeleton h={28} />
            <Skeleton h={28} />
          </Stack>
        ) : log.isError ? (
          <Alert color="red" m="md" variant="light">
            {describeError(t, log.error, t('signInAgain'), t('readForbidden'))}
          </Alert>
        ) : events.length === 0 ? (
          <Text c="dimmed" fz="sm" px="md" pb="md">
            {action || outcome ? t('emptyFiltered') : t('empty')}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th pl="md">#</Table.Th>
                  <Table.Th>{t('columns.time')}</Table.Th>
                  <Table.Th>{t('columns.who')}</Table.Th>
                  <Table.Th>{t('columns.what')}</Table.Th>
                  <Table.Th>{t('columns.outcome')}</Table.Th>
                  <Table.Th pr="md">{t('columns.address')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((event) => (
                  <Table.Tr key={event.seq}>
                    <Table.Td c="dimmed" ff="monospace" pl="md">
                      {event.seq}
                    </Table.Td>
                    <Table.Td title={event.occurredAt} style={{ whiteSpace: 'nowrap' }}>
                      {formatTime(event.occurredAt)}
                    </Table.Td>
                    <Table.Td>
                      {event.actor?.name ?? (
                        <Text c="dimmed" component="span">
                          {t('nobody')}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text ff="monospace" fz="sm">
                        {event.action}
                      </Text>
                      <Text c="dimmed" fz="xs">
                        {[
                          event.object ? `${event.object.type} ${event.object.id}` : '',
                          detailsText(event),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StatusText kind={OUTCOME_KIND[event.outcome]}>
                        {t(`outcome.${event.outcome}`)}
                      </StatusText>
                    </Table.Td>
                    <Table.Td ff="monospace" fz="sm" pr="md">
                      {event.ip ?? ''}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        {log.hasNextPage ? (
          <Group justify="center" p="md">
            <Button
              loading={log.isFetchingNextPage}
              onClick={() => void log.fetchNextPage()}
              variant="default"
            >
              {t('loadOlder')}
            </Button>
          </Group>
        ) : null}
      </Card>
    </>
  );
}
