import { Button, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PASSWORD_MIN_LENGTH, PasswordSchema } from '@swellwright/contracts';
import { ModalFooter, OverlayHeader } from '@swellwright/ui';

import { ApiRequestError, changePassword } from '../api.js';
import { notifyError, notifySuccess } from '../shell/feedback.js';
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
      notifySuccess(t('changePassword.title'), t('changePassword.success'));
      close();
    },
    onError: (error) => {
      // A wrong current password is said on its field; anything else is a toast, as in the panel.
      if (!(error instanceof ApiRequestError && error.code === 'unauthorized')) {
        notifyError(t('changePassword.title'), describeError(t, error, ''));
      }
    },
  });
  const currentWrong =
    mutation.error instanceof ApiRequestError && mutation.error.code === 'unauthorized';
  function close() {
    mutation.reset();
    setCurrent('');
    setNext('');
    setRepeat('');
    setTouched(false);
    onClose();
  }
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (valid) {
      mutation.mutate();
    }
  };

  return (
    <Modal
      centered
      onClose={close}
      opened={opened}
      title={<OverlayHeader icon={IconKey} iconColor="teal" title={t('changePassword.title')} />}
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <PasswordInput
            autoComplete="current-password"
            data-autofocus
            error={currentWrong ? t('changePassword.currentWrong') : undefined}
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
          <Text c="dimmed" fz="xs">
            {t('changePassword.lockoutNote')}
          </Text>
        </Stack>
        <ModalFooter>
          <Button onClick={close} variant="subtle">
            {t('common:cancel')}
          </Button>
          <Button
            color="teal"
            leftSection={<IconKey size={16} />}
            loading={mutation.isPending}
            size="md"
            type="submit"
            variant="soft"
          >
            {t('changePassword.submit')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
