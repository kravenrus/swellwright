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

const PAGE_SIZE = 50;

const OUTCOME: Record<AuditOutcome, { kind: StatusKind; label: string }> = {
  success: { kind: 'ok', label: 'Success' },
  failure: { kind: 'err', label: 'Failure' },
  denied: { kind: 'warn', label: 'Denied' },
};

const PROBLEM_TEXT: Record<NonNullable<ChainVerification['problem']>['reason'], string> = {
  missing: 'is missing or repeated',
  link: 'does not point at the event before it',
  content: 'was changed after it was written',
};

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

const shortHash = (hash: string): string => `${hash.slice(0, 12)}…${hash.slice(-6)}`;

function detailsText(event: AuditEvent): string {
  return Object.entries(event.details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

function Verification({ result }: { result: ChainVerification }) {
  if (result.ok) {
    return (
      <Alert
        color="teal"
        icon={<IconShieldCheck size={18} />}
        title="The chain is intact"
        variant="light"
      >
        <Stack gap={4}>
          <Text fz="sm">
            {result.checked === 0
              ? 'The log is empty.'
              : `All ${String(result.checked)} events check out: numbering, links and hashes.`}
          </Text>
          {result.head ? (
            <Text c="dimmed" fz="sm">
              Head: event {result.head.seq}, <Code>{shortHash(result.head.hash)}</Code>. Note it
              somewhere outside the database: if events are cut off the end later, the head of a
              later check will be older than this one.
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
      title="The chain does not check out"
      variant="light"
    >
      <Text fz="sm">
        {result.problem
          ? `Event ${String(result.problem.seq)} ${PROBLEM_TEXT[result.problem.reason]}. ${String(result.checked)} events before it are intact.`
          : 'The check failed.'}
      </Text>
    </Alert>
  );
}

/** The audit log: newest first, filters, and the integrity check for those who may run it. */
export function AuditPage({ permissions }: { permissions: readonly Permission[] }) {
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
              Refresh
            </Button>
            {canVerify ? (
              <Button
                leftSection={<IconShieldCheck size={16} />}
                loading={verify.isPending}
                onClick={() => {
                  verify.mutate();
                }}
              >
                Verify chain
              </Button>
            ) : null}
          </>
        }
        description="Append-only record of sign-ins, refusals and changes, chained by hashes"
        icon={<IconBook size={22} />}
        title="Audit log"
      />

      {verify.data ? (
        <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
          <Verification result={verify.data} />
        </div>
      ) : null}
      {verify.error ? (
        <Alert color="red" mb="md" variant="light">
          {describeError(
            verify.error,
            'Sign in again to continue.',
            'Your role may not verify the chain.',
          )}
        </Alert>
      ) : null}

      <Card padding={0}>
        <Group gap="sm" p="md">
          <Select
            aria-label="Action"
            clearable
            data={[...AUDIT_ACTIONS]}
            onChange={setAction}
            placeholder="Any action"
            searchable
            value={action}
            w={240}
          />
          <Select
            aria-label="Outcome"
            clearable
            data={AUDIT_OUTCOMES.map((value) => ({ value, label: OUTCOME[value].label }))}
            onChange={(value) => {
              setOutcome(AUDIT_OUTCOMES.find((known) => known === value) ?? null);
            }}
            placeholder="Any outcome"
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
            {describeError(
              log.error,
              'Sign in again to continue.',
              'Your role may not read the audit log.',
            )}
          </Alert>
        ) : events.length === 0 ? (
          <Text c="dimmed" fz="sm" px="md" pb="md">
            Nothing recorded yet{action || outcome ? ' for these filters' : ''}.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th pl="md">#</Table.Th>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Who</Table.Th>
                  <Table.Th>What</Table.Th>
                  <Table.Th>Outcome</Table.Th>
                  <Table.Th pr="md">Address</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((event) => (
                  <Table.Tr key={event.seq}>
                    <Table.Td c="dimmed" ff="monospace" pl="md">
                      {event.seq}
                    </Table.Td>
                    <Table.Td title={event.occurredAt} style={{ whiteSpace: 'nowrap' }}>
                      {when.format(new Date(event.occurredAt))}
                    </Table.Td>
                    <Table.Td>
                      {event.actor?.name ?? (
                        <Text c="dimmed" component="span">
                          nobody identified
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
                      <StatusText kind={OUTCOME[event.outcome].kind}>
                        {OUTCOME[event.outcome].label}
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
              Load older events
            </Button>
          </Group>
        ) : null}
      </Card>
    </>
  );
}
