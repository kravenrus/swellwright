import { Alert, Button, Code, CopyButton, Group, List, Modal, Stack, Text } from '@mantine/core';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileCode,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { PluginView } from '@swellwright/contracts';

import { getPluginSidecar } from '../api.js';
import { describeError } from '../auth/messages.js';
import { useStepUp } from '../auth/step-up.js';
import { useNumber } from '../format.js';

/** The file the compose fragment is saved as, and the command that applies it. */
const fragmentFile = (pluginId: string): string => `plugin-${pluginId}.yml`;
const applyCommand = (pluginId: string): string =>
  `docker compose -f docker-compose.yml -f ${fragmentFile(pluginId)} up -d`;

/** Hands a file to the browser as a download. */
function saveFile(content: string, name: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/yaml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The download has started by then; the address is not needed after that.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** A label and its value, side by side (the same layout as the other sections of the review dialog). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group align="baseline" gap="md" wrap="nowrap">
      <Text c="dimmed" fz="sm" style={{ flexShrink: 0 }} w={120}>
        {label}
      </Text>
      <div style={{ minWidth: 0 }}>{children}</div>
    </Group>
  );
}

/**
 * The compose fragment as the server made it. It holds the token the container proves itself with, so the dialog says
 * so before anything else, and it is not kept once it is closed.
 */
function FragmentDialog({
  pluginId,
  fragment,
  onClose,
}: {
  pluginId: string;
  fragment: { service: string; compose: string } | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation(['plugins', 'common']);
  return (
    <Modal
      centered
      onClose={onClose}
      opened={fragment !== undefined}
      size="xl"
      title={t('fragment.title')}
      // Above the review dialog it was opened from, below the confirmation with a code.
      zIndex={300}
    >
      {fragment ? (
        <Stack gap="md">
          <Alert color="orange" icon={<IconAlertTriangle size={16} />} variant="light">
            <Text fz="sm">{t('fragment.warning')}</Text>
          </Alert>
          <Group gap="xs">
            <Text c="dimmed" fz="sm">
              {t('fragment.service')}
            </Text>
            <Code>{fragment.service}</Code>
          </Group>
          <Code
            aria-label={t('fragment.file', { name: fragmentFile(pluginId) })}
            block
            mah={360}
            role="region"
            style={{ overflow: 'auto', whiteSpace: 'pre' }}
            tabIndex={0}
          >
            {fragment.compose}
          </Code>
          <Group gap="xs">
            <CopyButton timeout={2000} value={fragment.compose}>
              {({ copied, copy }) => (
                <Button
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={copy}
                  size="xs"
                  variant="default"
                >
                  {copied ? t('common:copied') : t('common:copy')}
                </Button>
              )}
            </CopyButton>
            <Button
              leftSection={<IconDownload size={14} />}
              onClick={() => {
                saveFile(fragment.compose, fragmentFile(pluginId));
              }}
              size="xs"
              variant="default"
            >
              {t('common:download')}
            </Button>
          </Group>
          <Stack gap={6}>
            <Text fw={600} fz="sm">
              {t('fragment.applyTitle')}
            </Text>
            <List fz="sm" size="sm" spacing={4} type="ordered">
              <List.Item>{t('fragment.applySave')}</List.Item>
              <List.Item>
                <Trans
                  components={{ code: <Code style={{ overflowWrap: 'anywhere' }} /> }}
                  i18nKey="fragment.applyRun"
                  ns="plugins"
                  values={{ command: applyCommand(pluginId) }}
                />
              </List.Item>
              <List.Item>{t('fragment.applyCheck')}</List.Item>
            </List>
          </Stack>
          <Group justify="flex-end">
            <Button onClick={onClose} variant="default">
              {t('common:close')}
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}

/**
 * For a plugin whose code runs in a container: what the container is (image, port, limits), who starts it (the
 * administrator, never Swellwright), and, for `plugins:manage`, the compose fragment that runs it. `onDialogChange`
 * tells the review dialog that a dialog is open over it, so that Escape closes only the top one.
 */
export function SidecarSection({
  plugin,
  canManage,
  onDialogChange,
}: {
  plugin: PluginView;
  canManage: boolean;
  onDialogChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['plugins', 'errors', 'common']);
  const formatNumber = useNumber();
  const step = useStepUp();
  // The fragment holds a token: it is kept only while its dialog is open (no cache after it is closed).
  const fetchFragment = useMutation({
    gcTime: 0,
    mutationFn: () => step.run(() => getPluginSidecar(plugin.id)),
  });
  const fragment = fetchFragment.data;
  const dialogOpen = fragment !== undefined;
  useEffect(() => {
    onDialogChange(dialogOpen);
    return () => {
      onDialogChange(false);
    };
  }, [dialogOpen, onDialogChange]);

  const { sidecar } = plugin;
  if (sidecar === null) {
    return null;
  }
  return (
    <Stack gap="xs">
      <Text fw={600} fz="sm">
        {t('container.title')}
      </Text>
      <Row label={t('container.image')}>
        <Code block fz="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {sidecar.image}
        </Code>
      </Row>
      <Row label={t('container.port')}>
        <Text fz="sm">{sidecar.port}</Text>
      </Row>
      <Row label={t('container.memory')}>
        <Text fz="sm">
          {t('container.memoryValue', { memory: formatNumber(sidecar.memoryMiB) })}
        </Text>
      </Row>
      <Row label={t('container.cpus')}>
        <Text fz="sm">{formatNumber(sidecar.cpus)}</Text>
      </Row>
      <Text fz="sm">{t('container.note')}</Text>
      {canManage && plugin.discovery === 'available' ? (
        <Stack gap={6}>
          {fetchFragment.error ? (
            <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
              {describeError(t, fetchFragment.error, t('signInAgain'), t('container.forbidden'))}
            </Alert>
          ) : null}
          <Group>
            <Button
              leftSection={<IconFileCode size={16} />}
              loading={fetchFragment.isPending}
              onClick={() => {
                fetchFragment.mutate();
              }}
              size="xs"
              variant="default"
            >
              {t('container.fragmentButton')}
            </Button>
          </Group>
        </Stack>
      ) : null}
      <FragmentDialog
        fragment={fragment}
        onClose={() => {
          fetchFragment.reset();
        }}
        pluginId={plugin.id}
      />
    </Stack>
  );
}
