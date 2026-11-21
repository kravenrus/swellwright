import {
  ActionIcon,
  Button,
  Code,
  CopyButton,
  List,
  Modal,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconBox,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileCode,
  IconListNumbers,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { PluginView } from '@swellwright/contracts';
import {
  Callout,
  CopyableCodeBlock,
  CopyableDataListItem,
  ModalFooter,
  OverlayHeader,
  SectionCard,
} from '@swellwright/ui';

import { getPluginSidecar } from '../api.js';
import { useStepUp } from '../auth/step-up.js';
import { useNumber } from '../format.js';
import { useIsMobile } from '../shell/use-is-mobile.js';
import {
  DetailList,
  DetailRow,
  MODAL_SIZE,
  useCopyLabels,
  usePluginFailure,
} from './plugin-shared.js';

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
  const labels = useCopyLabels();
  const isMobile = useIsMobile();
  return (
    <Modal
      fullScreen={isMobile}
      onClose={onClose}
      opened={fragment !== undefined}
      size={MODAL_SIZE}
      title={<OverlayHeader icon={IconFileCode} iconColor="orange" title={t('fragment.title')} />}
      // Above the review dialog it was opened from, below the confirmation with a code.
      zIndex={300}
    >
      {fragment ? (
        <>
          <Stack gap="md">
            <Callout color="orange">{t('fragment.warning')}</Callout>

            <SectionCard.Root>
              <SectionCard.Section>
                <DetailList>
                  <CopyableDataListItem
                    {...labels}
                    label={t('fragment.service')}
                    monospace
                    value={fragment.service}
                  />
                </DetailList>
              </SectionCard.Section>
              <SectionCard.Section>
                <CopyableCodeBlock
                  {...labels}
                  maxHeight={360}
                  multiline
                  regionLabel={t('fragment.file', { name: fragmentFile(pluginId) })}
                  value={fragment.compose}
                />
              </SectionCard.Section>
            </SectionCard.Root>

            <SectionCard.Root>
              <SectionCard.Section>
                <OverlayHeader
                  icon={IconListNumbers}
                  iconColor="blue"
                  iconSize={18}
                  title={t('fragment.applyTitle')}
                  titleOrder={5}
                />
              </SectionCard.Section>
              <SectionCard.Section>
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
              </SectionCard.Section>
            </SectionCard.Root>
          </Stack>

          <ModalFooter isMobile={isMobile}>
            <ActionIcon.Group ml="auto">
              <CopyButton timeout={1600} value={fragment.compose}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t('common:copied') : t('common:copy')}>
                    <ActionIcon
                      aria-label={copied ? t('common:copied') : t('common:copy')}
                      color={copied ? 'teal' : 'gray'}
                      onClick={copy}
                      size="input-md"
                      variant="soft"
                    >
                      {copied ? <IconCheck size={24} /> : <IconCopy size={24} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
              <Tooltip label={t('common:download')}>
                <ActionIcon
                  aria-label={t('common:download')}
                  color="gray"
                  onClick={() => {
                    saveFile(fragment.compose, fragmentFile(pluginId));
                  }}
                  size="input-md"
                  variant="soft"
                >
                  <IconDownload size={24} />
                </ActionIcon>
              </Tooltip>
            </ActionIcon.Group>
            <Button color="teal" onClick={onClose} size="md" variant="light">
              {t('common:close')}
            </Button>
          </ModalFooter>
        </>
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
  const fail = usePluginFailure();
  const labels = useCopyLabels();
  // The fragment holds a token: it is kept only while its dialog is open (no cache after it is closed).
  const fetchFragment = useMutation({
    gcTime: 0,
    mutationFn: () => step.run(() => getPluginSidecar(plugin.id)),
    onError: (error) => {
      fail(t('container.fragmentButton'), error, t('container.forbidden'));
    },
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
    <>
      <SectionCard.Root>
        <SectionCard.Section>
          <OverlayHeader
            icon={IconBox}
            iconColor="cyan"
            iconSize={18}
            title={t('container.title')}
            titleOrder={5}
          />
        </SectionCard.Section>
        <SectionCard.Section>
          <Stack gap="sm">
            <CopyableCodeBlock
              {...labels}
              inputWrapperProps={{ label: t('container.image') }}
              size="small"
              value={sidecar.image}
            />
            <DetailList>
              <DetailRow label={t('container.port')}>{sidecar.port}</DetailRow>
              <DetailRow label={t('container.memory')}>
                {t('container.memoryValue', { memory: formatNumber(sidecar.memoryMiB) })}
              </DetailRow>
              <DetailRow label={t('container.cpus')}>{formatNumber(sidecar.cpus)}</DetailRow>
            </DetailList>
            <Text c="dimmed" size="sm">
              {t('container.note')}
            </Text>
            {canManage && plugin.discovery === 'available' ? (
              <Button
                leftSection={<IconFileCode size={16} />}
                loading={fetchFragment.isPending}
                onClick={() => {
                  fetchFragment.mutate();
                }}
                size="sm"
                variant="soft"
                w="fit-content"
              >
                {t('container.fragmentButton')}
              </Button>
            ) : null}
          </Stack>
        </SectionCard.Section>
      </SectionCard.Root>
      <FragmentDialog
        fragment={fragment}
        onClose={() => {
          fetchFragment.reset();
        }}
        pluginId={plugin.id}
      />
    </>
  );
}
