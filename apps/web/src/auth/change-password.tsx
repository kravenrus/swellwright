import { Alert, Button, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';

import { PASSWORD_MIN_LENGTH, PasswordSchema } from '@swellwright/contracts';

import { changePassword } from '../api.js';
import { describeError } from './messages.js';

/** Changing your own password: the current one and a new one. Your other sessions end. */
export function ChangePasswordDialog({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);

  const check = PasswordSchema.safeParse(next);
  const mismatch = repeat.length > 0 && repeat !== next;
  const valid = current.length > 0 && check.success && repeat === next;

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword: current, newPassword: next }),
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
    <Modal centered onClose={close} opened={opened} title="Change your password">
      {mutation.isSuccess ? (
        <Stack gap="md">
          <Alert color="teal" icon={<IconCheck size={16} />} variant="light">
            Your password was changed. Your other sessions were signed out.
          </Alert>
          <Group justify="flex-end">
            <Button onClick={close}>Done</Button>
          </Group>
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack gap="md">
            <PasswordInput
              autoComplete="current-password"
              data-autofocus
              label="Current password"
              onChange={(e) => {
                setCurrent(e.currentTarget.value);
              }}
              required
              value={current}
            />
            <PasswordInput
              autoComplete="new-password"
              description={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
              error={touched && !check.success ? 'The password is too short.' : undefined}
              label="New password"
              onChange={(e) => {
                setNext(e.currentTarget.value);
              }}
              required
              value={next}
            />
            <PasswordInput
              autoComplete="new-password"
              error={mismatch ? 'The passwords differ.' : undefined}
              label="Repeat the new password"
              onChange={(e) => {
                setRepeat(e.currentTarget.value);
              }}
              required
              value={repeat}
            />
            {mutation.error ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
                {describeError(mutation.error, 'The current password is not right.')}
              </Alert>
            ) : null}
            <Text c="dimmed" fz="xs">
              Five wrong current passwords in a row lock the account for a while.
            </Text>
            <Group justify="flex-end">
              <Button onClick={close} variant="default">
                Cancel
              </Button>
              <Button loading={mutation.isPending} type="submit">
                Change the password
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
