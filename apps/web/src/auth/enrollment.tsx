import { Button, Checkbox, CopyButton, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import {
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconDownload,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TotpConfirmed } from '@swellwright/contracts';
import { CopyableCodeBlock, LoadingScreen } from '@swellwright/ui';

import { confirmTotpEnrollment, startTotpEnrollment } from '../api.js';
import { CODE_LENGTH, CodeInput } from './code-input.js';
import { FormError } from './form-error.js';
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
    return <LoadingScreen height="40vh" />;
  }
  if (enrollment.isError) {
    return <FormError message={describeError(t, enrollment.error, t('shared.signInAgain'))} />;
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
            <CopyableCodeBlock
              copiedLabel={t('common:copied')}
              copyLabel={t('enrollment.copyKey')}
              size="small"
              value={secret}
            />
          </Stack>
        </Group>
      </Stack>
      <Stack gap="xs">
        <Text fw={600} fz="sm">
          {t('enrollment.enterTitle')}
        </Text>
        <CodeInput busy={isPending} onChange={setCode} value={code} />
        <FormError
          message={confirm.error ? describeError(t, confirm.error, t('totp.codeWrong')) : undefined}
        />
      </Stack>
      <Button
        disabled={code.length !== CODE_LENGTH}
        fullWidth
        leftSection={<IconShieldCheck size={16} />}
        loading={confirm.isPending}
        onClick={() => {
          confirm.mutate(code);
        }}
        variant="soft"
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
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing={8}>
        {codes.map((code, index) => (
          <Paper
            key={code}
            px="sm"
            py={6}
            radius="md"
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <Group gap={6} wrap="nowrap">
              <Text c="dimmed" ff="monospace" fz="xs">
                {index + 1}
              </Text>
              <Text ff="monospace" fz="sm">
                {code}
              </Text>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      <Group gap="xs" grow>
        <CopyButton timeout={2000} value={text}>
          {({ copied, copy }) => (
            <Button
              leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              onClick={copy}
              variant="subtle"
            >
              {copied ? t('common:copied') : t('recoveryCodes.copyAll')}
            </Button>
          )}
        </CopyButton>
        <Button leftSection={<IconDownload size={16} />} onClick={download} variant="subtle">
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
      <Button
        disabled={!saved}
        fullWidth
        leftSection={<IconArrowRight size={16} />}
        onClick={onDone}
        variant="soft"
      >
        {t('recoveryCodes.continue')}
      </Button>
    </Stack>
  );
}
