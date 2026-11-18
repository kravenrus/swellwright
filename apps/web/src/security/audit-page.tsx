import {
  Alert,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  Loader,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBook,
  IconBookmark,
  IconCheck,
  IconCopy,
  IconDownload,
  IconListCheck,
  IconRefresh,
  IconShieldCheck,
  IconShieldX,
} from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import {
  AUDIT_ACTIONS,
  AUDIT_EXPORT_FORMAT,
  AUDIT_EXPORT_VERSION,
  AUDIT_OUTCOMES,
  type AuditCheckpoint,
  type AuditCheckpointVerification,
  type AuditEvent,
  type AuditOutcome,
  type ChainVerification,
  type Permission,
} from '@swellwright/contracts';
import { PageHeader, StatusText, type StatusKind } from '@swellwright/ui';

import {
  createAuditCheckpoint,
  exportAudit,
  listAudit,
  verifyAuditCheckpoint,
  verifyAuditChain,
} from '../api.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useDateTime } from '../format.js';

const PAGE_SIZE = 50;
/** Events per request when the log is exported: fewer requests, and each one is recorded in the log. */
const EXPORT_PAGE_SIZE = 1000;
/** How the exported file is checked without this server. A command, not a text to translate. */
const VERIFY_COMMAND = 'node dist/admin.js audit-verify <file>';

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

/** Hands a file to the browser as a download. */
function saveFile(content: Blob, name: string): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The download has started by then; a large file needs the address a little longer than a click does.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
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

/** What the export came to: the file name, how many events it holds and the last of them. */
interface ExportDone {
  readonly file: string;
  readonly count: number;
  readonly head: { readonly seq: number; readonly hash: string } | null;
}

/** The command that checks a downloaded file anywhere, shown before and after the export. */
function VerifyCommand() {
  const { t } = useTranslation(['audit', 'common']);
  return (
    <Stack gap={4}>
      <Text c="dimmed" fz="sm">
        {t('export.verifyHint')}
      </Text>
      <Code block>{VERIFY_COMMAND}</Code>
    </Stack>
  );
}

/**
 * Downloads the whole log as a file that can be checked without this server. Every page is fetched with a fresh
 * confirmation by code (asked again if it lapses on a long export) and the file is put together here.
 */
function ExportDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation(['audit', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const [fetched, setFetched] = useState(0);
  // Set when the person gives up or leaves the page: the run stops after the page it is waiting for.
  const run = useRef<{ stopped: boolean } | undefined>(undefined);

  useEffect(
    () => () => {
      if (run.current) {
        run.current.stopped = true;
      }
    },
    [],
  );

  const exportLog = useMutation({
    gcTime: 0,
    mutationFn: async (): Promise<ExportDone | undefined> => {
      const mine = { stopped: false };
      run.current = mine;
      setFetched(0);
      const fetchPage = (from: number | undefined) =>
        step.run(() =>
          exportAudit({ limit: EXPORT_PAGE_SIZE, ...(from === undefined ? {} : { from }) }),
        );

      const parts = [
        `${JSON.stringify({ format: AUDIT_EXPORT_FORMAT, version: AUDIT_EXPORT_VERSION })}\n`,
      ];
      let count = 0;
      let last: AuditEvent | undefined;
      let from: number | undefined;
      for (;;) {
        const page = await fetchPage(from);
        if (mine.stopped) {
          return undefined;
        }
        for (const event of page.events) {
          parts.push(`${JSON.stringify(event)}\n`);
        }
        count += page.events.length;
        last = page.events.at(-1) ?? last;
        setFetched(count);
        if (page.nextFrom === null) {
          break;
        }
        // A page that does not move on would repeat for ever.
        if (page.nextFrom <= (from ?? 1)) {
          throw new Error('The export did not advance.');
        }
        from = page.nextFrom;
      }

      const file = `swellwright-audit-${new Date().toISOString().slice(0, 10)}.jsonl`;
      saveFile(new Blob(parts, { type: 'application/x-ndjson' }), file);
      return { file, count, head: last ? { seq: last.seq, hash: last.hash } : null };
    },
    // The export itself is recorded, page by page, even when it stops half way.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
  const done = exportLog.data;

  const close = () => {
    if (run.current) {
      run.current.stopped = true;
    }
    exportLog.reset();
    setFetched(0);
    onClose();
  };

  return (
    <Modal
      centered
      closeOnClickOutside={!exportLog.isPending}
      closeOnEscape={!exportLog.isPending}
      onClose={close}
      opened={opened}
      size="lg"
      title={t('export.title')}
    >
      <Stack gap="md">
        {done ? (
          <Alert
            color="teal"
            icon={<IconCheck size={18} />}
            role="status"
            title={t('export.doneTitle')}
            variant="light"
          >
            <Stack gap={4}>
              <Text fz="sm">{t('export.done', { count: done.count, file: done.file })}</Text>
              {done.head ? (
                <Text c="dimmed" fz="sm">
                  <Trans
                    components={{ code: <Code /> }}
                    i18nKey="export.head"
                    t={t}
                    values={{ seq: done.head.seq, hash: shortHash(done.head.hash) }}
                  />
                </Text>
              ) : null}
            </Stack>
          </Alert>
        ) : (
          <>
            <Text fz="sm">{t('export.intro')}</Text>
            <Text c="dimmed" fz="sm">
              {t('export.stepUp')}
            </Text>
          </>
        )}
        <VerifyCommand />
        {exportLog.isPending ? (
          <Group gap="xs" role="status">
            <Loader size="xs" />
            <Text fz="sm">{t('export.progress', { count: fetched })}</Text>
          </Group>
        ) : null}
        {exportLog.error ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
            {describeError(t, exportLog.error, t('signInAgain'), t('exportForbidden'))}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          {done ? (
            <Button onClick={close}>{t('common:close')}</Button>
          ) : (
            <>
              <Button onClick={close} variant="default">
                {t('common:cancel')}
              </Button>
              <Button
                leftSection={<IconDownload size={16} />}
                loading={exportLog.isPending}
                onClick={() => {
                  exportLog.mutate();
                }}
              >
                {t('export.submit')}
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

/** The checkpoint that was just made, with the plain warning that it is worth nothing if it stays here. */
function CheckpointDialog({
  checkpoint,
  opened,
  onClose,
}: {
  checkpoint: AuditCheckpoint | undefined;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(['audit', 'common']);
  const formatTime = useDateTime('medium');
  return (
    <Modal
      centered
      onClose={onClose}
      opened={opened && checkpoint !== undefined}
      size="lg"
      title={t('checkpoint.title')}
    >
      {checkpoint ? (
        <Stack gap="md">
          <Text fz="sm">
            {t('checkpoint.made', {
              seq: checkpoint.seq,
              when: formatTime(checkpoint.issuedAt),
            })}
          </Text>
          <Alert
            color="yellow"
            icon={<IconAlertTriangle size={18} />}
            title={t('checkpoint.warningTitle')}
            variant="light"
          >
            <Text fz="sm">{t('checkpoint.warning')}</Text>
          </Alert>
          <Textarea
            autosize
            description={t('checkpoint.valueDescription')}
            label={t('checkpoint.valueLabel')}
            maxRows={6}
            minRows={2}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
            readOnly
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            value={checkpoint.checkpoint}
          />
          <Group justify="space-between">
            <CopyButton timeout={2000} value={checkpoint.checkpoint}>
              {({ copied, copy }) => (
                <Button
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  onClick={copy}
                  variant="default"
                >
                  {copied ? t('common:copied') : t('checkpoint.copy')}
                </Button>
              )}
            </CopyButton>
            <Button onClick={onClose}>{t('common:close')}</Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}

/** What a check against a checkpoint found, in words for an administrator. */
function CheckpointResult({ result }: { result: AuditCheckpointVerification }) {
  const { t } = useTranslation(['audit', 'common']);
  const formatTime = useDateTime('medium');
  const kind = result.result;
  if (kind === 'ok') {
    return (
      <Alert
        color="teal"
        icon={<IconShieldCheck size={18} />}
        role="status"
        title={t('check.okTitle')}
        variant="light"
      >
        <Stack gap={4}>
          {result.seq !== null && result.issuedAt !== null ? (
            <Text fz="sm">
              {t('check.ok', { seq: result.seq, when: formatTime(result.issuedAt) })}
            </Text>
          ) : null}
          {result.eventsSince !== null ? (
            <Text c="dimmed" fz="sm">
              {t('check.added', { count: result.eventsSince })}
            </Text>
          ) : null}
        </Stack>
      </Alert>
    );
  }
  return (
    <Alert
      color="red"
      icon={<IconShieldX size={18} />}
      role="alert"
      title={t('check.failedTitle')}
      variant="light"
    >
      <Text fz="sm">{t(`check.result.${kind}`, { seq: result.seq ?? '?' })}</Text>
    </Alert>
  );
}

/** Pastes a checkpoint noted earlier and checks the log against it. */
function CheckDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation(['audit', 'common']);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const check = useMutation({
    mutationFn: verifyAuditCheckpoint,
    // A check is recorded, so the list has a new event whatever the answer was.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  // A checkpoint has no spaces; a copy that was wrapped on the way may have gained line breaks.
  const value = text.replace(/\s+/gu, '');
  const close = () => {
    check.reset();
    setText('');
    onClose();
  };
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (value.length > 0) {
      check.mutate(value);
    }
  };

  return (
    <Modal centered onClose={close} opened={opened} size="lg" title={t('check.title')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text c="dimmed" fz="sm">
            {t('check.intro')}
          </Text>
          <Textarea
            autoComplete="off"
            autosize
            data-autofocus
            label={t('check.inputLabel')}
            maxRows={6}
            minRows={2}
            onChange={(e) => {
              setText(e.currentTarget.value);
              // The answer belongs to the text that was checked, not to the one being typed.
              if (check.data !== undefined || check.error) {
                check.reset();
              }
            }}
            placeholder={t('check.inputPlaceholder')}
            spellCheck={false}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            value={text}
          />
          {check.data ? <CheckpointResult result={check.data} /> : null}
          {check.error ? (
            <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
              {describeError(t, check.error, t('signInAgain'), t('checkpointForbidden'))}
            </Alert>
          ) : null}
          <Group justify="flex-end">
            <Button onClick={close} variant="default">
              {t('common:close')}
            </Button>
            <Button
              disabled={value.length === 0}
              leftSection={<IconListCheck size={16} />}
              loading={check.isPending}
              type="submit"
            >
              {t('check.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** The audit log: newest first, filters, and the integrity check for those who may run it. */
export function AuditPage({ permissions }: { permissions: readonly Permission[] }) {
  const { t } = useTranslation(['audit', 'common']);
  const formatTime = useDateTime('medium');
  const queryClient = useQueryClient();
  const [action, setAction] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AuditOutcome | null>(null);
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const canVerify = permissions.includes('audit:verify');
  const canExport = permissions.includes('audit:export');

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

  // The checkpoint stays in the mutation after the dialog is closed, so its text does not vanish mid-fade.
  const noteHead = useMutation({
    mutationFn: createAuditCheckpoint,
    onSuccess: () => {
      setShowCheckpoint(true);
      return queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
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
            {canExport ? (
              <Button
                leftSection={<IconDownload size={16} />}
                onClick={() => {
                  setExporting(true);
                }}
                variant="default"
              >
                {t('export.button')}
              </Button>
            ) : null}
            {canVerify ? (
              <>
                <Button
                  leftSection={<IconBookmark size={16} />}
                  loading={noteHead.isPending}
                  onClick={() => {
                    noteHead.mutate();
                  }}
                  variant="default"
                >
                  {t('checkpoint.button')}
                </Button>
                <Button
                  leftSection={<IconListCheck size={16} />}
                  onClick={() => {
                    setChecking(true);
                  }}
                  variant="default"
                >
                  {t('check.button')}
                </Button>
                <Button
                  leftSection={<IconShieldCheck size={16} />}
                  loading={verify.isPending}
                  onClick={() => {
                    verify.mutate();
                  }}
                >
                  {t('verifyChain')}
                </Button>
              </>
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
      {noteHead.error ? (
        <Alert color="red" mb="md" variant="light">
          {describeError(t, noteHead.error, t('signInAgain'), t('checkpointForbidden'))}
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

      {canExport ? (
        <ExportDialog
          onClose={() => {
            setExporting(false);
          }}
          opened={exporting}
        />
      ) : null}
      {canVerify ? (
        <>
          <CheckpointDialog
            checkpoint={noteHead.data}
            onClose={() => {
              setShowCheckpoint(false);
            }}
            opened={showCheckpoint}
          />
          <CheckDialog
            onClose={() => {
              setChecking(false);
            }}
            opened={checking}
          />
        </>
      ) : null}
    </>
  );
}
