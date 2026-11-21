// The dialog follows the panel's modals (a titled `Modal`, `OverlayHeader`, the sticky `ModalFooter` with a teal soft
// primary button, a red soft one for what is dangerous) and the panel's way of showing a technical error (the red
// `ErrorMessageBlock`) and a note the reader must not miss (the `Callout`). Confirming a scanned host key has no
// counterpart in the panel; the pieces are the panel's cards and `DataList` rows.
import { Badge, Button, DataList, Group, Modal, Stack, Text } from '@mantine/core';
import { IconFingerprint, IconPin, IconRefresh, IconReplace, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { HostKeyScan, ServerHostKey, ServerView } from '@swellwright/contracts';
import {
  Callout,
  CopyableCodeBlock,
  ErrorMessageBlock,
  LoaderModal,
  ModalFooter,
  OverlayHeader,
  SectionCard,
} from '@swellwright/ui';

import { useIsMobile } from '../shell/use-is-mobile.js';
import { hostKeyMismatchOf, sshErrorText } from './ssh-errors.js';

const STATUS_COLOR = { new: 'cyan', pinned: 'teal', differs: 'red' } as const;

export interface ScanState {
  readonly data: HostKeyScan | undefined;
  readonly isPending: boolean;
  readonly error: unknown;
}

export interface ConfirmState {
  readonly isPending: boolean;
  readonly error: unknown;
}

export function HostKeyScanDialog({
  server,
  opened,
  scan,
  confirm,
  onClose,
  onScanAgain,
  onConfirm,
}: {
  server: ServerView;
  opened: boolean;
  scan: ScanState;
  confirm: ConfirmState;
  onClose: () => void;
  onScanAgain: () => void;
  /** `replace` is true when keys are pinned and the person said that the system was reinstalled. */
  onConfirm: (fingerprint: string, replace: boolean) => void;
}) {
  const { t } = useTranslation(['servers', 'common', 'errors']);
  const isMobile = useIsMobile();
  const result = scan.data;
  const status = result?.status;
  const color = status ? STATUS_COLOR[status] : scan.error ? 'red' : 'cyan';

  const unauthorized = t('servers:signInAgain');
  const changed = hostKeyMismatchOf(confirm.error);

  const body = () => {
    if (scan.isPending) {
      return (
        <LoaderModal
          label={t('servers:hostKeys.scan.reading', {
            address: server.address,
            port: server.sshPort,
          })}
          mih="200px"
        />
      );
    }
    if (scan.error !== null && scan.error !== undefined) {
      return (
        <SectionCard.Root>
          <SectionCard.Section>
            <OverlayHeader
              icon={IconX}
              iconColor="red"
              title={t('servers:hostKeys.scan.failedTitle')}
              titleOrder={5}
            />
          </SectionCard.Section>
          <SectionCard.Section>
            <ErrorMessageBlock
              copiedLabel={t('common:copied')}
              copyLabel={t('common:copy')}
              message={sshErrorText(t, scan.error, unauthorized)}
            />
          </SectionCard.Section>
        </SectionCard.Root>
      );
    }
    if (!result || !status) {
      return null;
    }
    const pinnedKeys: readonly ServerHostKey[] = result.pinned;
    return (
      <Stack gap="md">
        <SectionCard.Root>
          <SectionCard.Section>
            <Group gap="xs" justify="space-between" wrap="wrap">
              <OverlayHeader
                icon={IconFingerprint}
                iconColor={color}
                subtitle={t('servers:hostKeys.scan.subtitle')}
                title={t('servers:hostKeys.scan.title', { name: server.name })}
                titleOrder={5}
              />
              <Badge color={color} size="lg" variant="soft">
                {t(`servers:hostKeys.scan.statuses.${status}`)}
              </Badge>
            </Group>
          </SectionCard.Section>
          <SectionCard.Section>
            <Stack gap="md">
              <DataList orientation="vertical" withDivider>
                <DataList.Item>
                  <DataList.ItemLabel>{t('servers:hostKeys.scan.address')}</DataList.ItemLabel>
                  <DataList.ItemValue>
                    <Text ff="monospace" size="sm">
                      {result.address}:{result.port}
                    </Text>
                  </DataList.ItemValue>
                </DataList.Item>
                <DataList.Item>
                  <DataList.ItemLabel>{t('servers:hostKeys.algorithm')}</DataList.ItemLabel>
                  <DataList.ItemValue>
                    <Badge color="gray" size="lg" variant="soft">
                      {result.algorithm}
                    </Badge>
                  </DataList.ItemValue>
                </DataList.Item>
              </DataList>
              <CopyableCodeBlock
                copiedLabel={t('common:copied')}
                copyLabel={t('common:copy')}
                inputWrapperProps={{ label: t('servers:hostKeys.fingerprint') }}
                value={result.fingerprintSha256}
                wrap
              />
            </Stack>
          </SectionCard.Section>
        </SectionCard.Root>

        {status === 'differs' ? (
          <>
            <Callout color="red" title={t('servers:hostKeys.scan.differsTitle')}>
              {t('servers:hostKeys.scan.differsText')}
            </Callout>
            <Text c="dimmed" size="sm">
              {t('servers:hostKeys.scan.confirmReplaceHint', { count: result.pinned.length })}
            </Text>
            <SectionCard.Root>
              <SectionCard.Section>
                <Stack gap="xs">
                  <Text fw={600} size="sm">
                    {t('servers:hostKeys.scan.pinnedNow')}
                  </Text>
                  {pinnedKeys.map((key) => (
                    <Text
                      c="dimmed"
                      ff="monospace"
                      key={key.id}
                      size="xs"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {key.algorithm} {key.fingerprintSha256}
                    </Text>
                  ))}
                </Stack>
              </SectionCard.Section>
            </SectionCard.Root>
          </>
        ) : (
          <Text c="dimmed" size="sm">
            {status === 'new'
              ? t('servers:hostKeys.scan.guidanceNew')
              : t('servers:hostKeys.scan.guidancePinned')}
          </Text>
        )}

        {confirm.error !== null && confirm.error !== undefined ? (
          <SectionCard.Root>
            <SectionCard.Section>
              <OverlayHeader
                icon={IconX}
                iconColor="red"
                title={
                  changed
                    ? t('servers:hostKeys.scan.changedTitle')
                    : t('servers:hostKeys.scan.acceptFailed')
                }
                titleOrder={5}
              />
            </SectionCard.Section>
            <SectionCard.Section>
              <Stack gap="xs">
                {changed ? (
                  <Text c="dimmed" size="sm">
                    {t('servers:hostKeys.scan.changedText')}
                  </Text>
                ) : null}
                <ErrorMessageBlock
                  copiedLabel={t('common:copied')}
                  copyLabel={t('common:copy')}
                  message={
                    changed
                      ? `${t('servers:hostKeys.scan.expected')}: ${changed.expected.join(', ')}\n${t('servers:hostKeys.scan.actual')}: ${changed.actual}`
                      : sshErrorText(t, confirm.error, unauthorized)
                  }
                />
              </Stack>
            </SectionCard.Section>
          </SectionCard.Root>
        ) : null}
      </Stack>
    );
  };

  const confirmButton = () => {
    if (!result || scan.isPending) {
      return null;
    }
    if (result.status === 'new') {
      return (
        <Button
          color="teal"
          leftSection={<IconPin size={16} />}
          loading={confirm.isPending}
          onClick={() => {
            onConfirm(result.fingerprintSha256, false);
          }}
          size="md"
          variant="soft"
        >
          {t('servers:hostKeys.scan.confirm')}
        </Button>
      );
    }
    if (result.status === 'differs') {
      return (
        <Button
          color="red"
          leftSection={<IconReplace size={16} />}
          loading={confirm.isPending}
          onClick={() => {
            onConfirm(result.fingerprintSha256, true);
          }}
          size="md"
          variant="soft"
        >
          {t('servers:hostKeys.scan.confirmReplace')}
        </Button>
      );
    }
    return null;
  };

  return (
    <Modal
      closeButtonProps={{ 'aria-label': t('common:close') }}
      closeOnClickOutside={!confirm.isPending}
      closeOnEscape={!confirm.isPending}
      fullScreen={isMobile}
      onClose={onClose}
      opened={opened}
      size="lg"
      title={
        <OverlayHeader
          icon={IconFingerprint}
          iconColor={color}
          title={t('servers:hostKeys.scan.button')}
        />
      }
    >
      {body()}
      <ModalFooter>
        <Button
          disabled={scan.isPending || confirm.isPending}
          leftSection={<IconRefresh size={16} />}
          onClick={onScanAgain}
          size="md"
          variant="default"
        >
          {t('servers:hostKeys.scan.scanAgain')}
        </Button>
        {confirmButton()}
      </ModalFooter>
    </Modal>
  );
}
