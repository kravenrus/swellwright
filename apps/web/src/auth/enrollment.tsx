import {
  Alert,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconCopy, IconDownload } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TotpConfirmed } from '@swellwright/contracts';

import { confirmTotpEnrollment, startTotpEnrollment } from '../api.js';
import { CODE_LENGTH, CodeInput } from './code-input.js';
import { describeError } from './messages.js';
import { QrCode } from './qr.js';

/** Shows the authenticator secret as a QR code and as text, then asks for a code to prove it works. */
export function EnrollmentStep({ onConfirmed }: { onConfirmed: (result: TotpConfirmed) => void }) {
  const { t } = useTranslation(['auth', 'common']);
  const enrollment = useQuery({
    queryKey: ['auth', 'enrollment'],
    queryFn: startTotpEnrollment,
    // The server returns the same secret until it is confirmed; keep it out of the cache afterwards.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const [code, setCode] = useState('');
  const confirm = useMutation({
    mutationFn: (value: string) => confirmTotpEnrollment(value),
    onSuccess: onConfirmed,
    onError: () => {
      setCode('');
    },
  });
  // Six digits send themselves.
  const { mutate, isPending } = confirm;
  useEffect(() => {
    if (code.length === CODE_LENGTH && !isPending) {
      mutate(code);
    }
  }, [code, isPending, mutate]);

  if (enrollment.isPending) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }
  if (enrollment.isError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
        {describeError(t, enrollment.error, t('shared.signInAgain'))}
      </Alert>
    );
  }
  const { secret, otpauthUri } = enrollment.data;
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text fw={600} fz="sm">
          {t('enrollment.addTitle')}
        </Text>
        <Text c="dimmed" fz="sm">
          {t('enrollment.addHint')}
        </Text>
        <Group align="flex-start" gap="lg" wrap="wrap">
          <QrCode label={t('enrollment.qrLabel')} text={otpauthUri} />
          <Stack gap={6} style={{ flex: 1, minWidth: 180 }}>
            <Text c="dimmed" fz="xs">
              {t('enrollment.keyLabel')}
            </Text>
            <Code block fz="sm" style={{ wordBreak: 'break-all' }}>
              {secret.match(/.{1,4}/gu)?.join(' ') ?? secret}
            </Code>
            <CopyButton timeout={2000} value={secret}>
              {({ copied, copy }) => (
                <Button
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={copy}
                  size="xs"
                  variant="default"
                >
                  {copied ? t('common:copied') : t('enrollment.copyKey')}
                </Button>
              )}
            </CopyButton>
          </Stack>
        </Group>
      </Stack>
      <Stack gap="xs">
        <Text fw={600} fz="sm">
          {t('enrollment.enterTitle')}
        </Text>
        <CodeInput busy={isPending} onChange={setCode} value={code} />
        {confirm.error ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
            {describeError(t, confirm.error, t('totp.codeWrong'))}
          </Alert>
        ) : null}
      </Stack>
      <Button
        disabled={code.length !== CODE_LENGTH}
        loading={confirm.isPending}
        onClick={() => {
          confirm.mutate(code);
        }}
      >
        {t('enrollment.submit')}
      </Button>
    </Stack>
  );
}

/** The one-time recovery codes. They are shown once, so the person has to say they saved them. */
export function RecoveryCodes({ codes, onDone }: { codes: readonly string[]; onDone: () => void }) {
  const { t } = useTranslation(['auth', 'common']);
  const [saved, setSaved] = useState(false);
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'swellwright-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Stack gap="lg">
      <Text c="dimmed" fz="sm">
        {t('recoveryCodes.intro')}
      </Text>
      <SimpleGrid cols={2} spacing="xs">
        {codes.map((code) => (
          <Code fz="sm" key={code} ta="center">
            {code}
          </Code>
        ))}
      </SimpleGrid>
      <Group gap="xs">
        <CopyButton timeout={2000} value={text}>
          {({ copied, copy }) => (
            <Button
              leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              onClick={copy}
              size="xs"
              variant="default"
            >
              {copied ? t('common:copied') : t('recoveryCodes.copyAll')}
            </Button>
          )}
        </CopyButton>
        <Button
          leftSection={<IconDownload size={14} />}
          onClick={download}
          size="xs"
          variant="default"
        >
          {t('common:download')}
        </Button>
      </Group>
      <Checkbox
        checked={saved}
        label={t('recoveryCodes.saved')}
        onChange={(e) => {
          setSaved(e.currentTarget.checked);
        }}
      />
      <Button disabled={!saved} onClick={onDone}>
        {t('recoveryCodes.continue')}
      </Button>
    </Stack>
  );
}
