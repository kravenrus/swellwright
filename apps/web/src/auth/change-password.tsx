import { Alert, Button, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PASSWORD_MIN_LENGTH, PasswordSchema } from '@swellwright/contracts';

import { changePassword } from '../api.js';
import { describeError } from './messages.js';
import { useStepUp } from './step-up.js';

/** Changing your own password: the current one and a new one. Your other sessions end. */
export function ChangePasswordDialog({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);

  const check = PasswordSchema.safeParse(next);
  const mismatch = repeat.length > 0 && repeat !== next;
  const valid = current.length > 0 && check.success && repeat === next;

  const step = useStepUp();
  const mutation = useMutation({
    mutationFn: () =>
      step.run(() => changePassword({ currentPassword: current, newPassword: next })),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setRepeat('');
      setTouched(false);
    },
  });
  const close = () => {
    mutation.reset();
    setCurrent('');
    setNext('');
    setRepeat('');
    setTouched(false);
    onClose();
  };
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (valid) {
      mutation.mutate();
    }
  };

  return (
    <Modal centered onClose={close} opened={opened} title={t('changePassword.title')}>
      {mutation.isSuccess ? (
        <Stack gap="md">
          <Alert color="teal" icon={<IconCheck size={16} />} variant="light">
            {t('changePassword.success')}
          </Alert>
          <Group justify="flex-end">
            <Button onClick={close}>{t('changePassword.done')}</Button>
          </Group>
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack gap="md">
            <PasswordInput
              autoComplete="current-password"
              data-autofocus
              label={t('changePassword.currentLabel')}
              onChange={(e) => {
                setCurrent(e.currentTarget.value);
              }}
              required
              value={current}
            />
            <PasswordInput
              autoComplete="new-password"
              description={t('changePassword.newHint', { count: PASSWORD_MIN_LENGTH })}
              error={touched && !check.success ? t('shared.passwordTooShort') : undefined}
              label={t('changePassword.newLabel')}
              onChange={(e) => {
                setNext(e.currentTarget.value);
              }}
              required
              value={next}
            />
            <PasswordInput
              autoComplete="new-password"
              error={mismatch ? t('shared.passwordsDiffer') : undefined}
              label={t('changePassword.repeatLabel')}
              onChange={(e) => {
                setRepeat(e.currentTarget.value);
              }}
              required
              value={repeat}
            />
            {mutation.error ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
                {describeError(t, mutation.error, t('changePassword.currentWrong'))}
              </Alert>
            ) : null}
            <Text c="dimmed" fz="xs">
              {t('changePassword.lockoutNote')}
            </Text>
            <Group justify="flex-end">
              <Button onClick={close} variant="default">
                {t('common:cancel')}
              </Button>
              <Button loading={mutation.isPending} type="submit">
                {t('changePassword.submit')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
