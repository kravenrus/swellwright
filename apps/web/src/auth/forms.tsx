import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconKey, IconShieldLock } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type SyntheticEvent } from 'react';

import {
  PASSWORD_MIN_LENGTH,
  PasswordSchema,
  type PendingSession,
  type SessionInfo,
  UsernameSchema,
} from '@swellwright/contracts';

import { createOwner, login, verifyTotp } from '../api.js';
import { CODE_LENGTH, CodeInput } from './code-input.js';
import { describeError } from './messages.js';

function ErrorNote({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
      {message}
    </Alert>
  );
}

export function LoginForm({ onNext }: { onNext: (next: PendingSession['next']) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => login({ username, password }),
    onSuccess: (result) => {
      setPassword('');
      onNext(result.next);
    },
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <TextInput
          autoComplete="username"
          autoFocus
          label="Login name"
          onChange={(e) => {
            setUsername(e.currentTarget.value);
          }}
          required
          value={username}
        />
        <PasswordInput
          autoComplete="current-password"
          label="Password"
          onChange={(e) => {
            setPassword(e.currentTarget.value);
          }}
          required
          value={password}
        />
        <ErrorNote
          message={
            mutation.error
              ? describeError(mutation.error, 'Wrong login name or password.')
              : undefined
          }
        />
        <Button
          fullWidth
          leftSection={<IconKey size={16} />}
          loading={mutation.isPending}
          type="submit"
        >
          Continue
        </Button>
      </Stack>
    </form>
  );
}

const RECOVERY_HINT = 'A recovery code looks like ABCD-EFGH-JKLM. It works once.';

/** The second step: six digits from the authenticator, or one recovery code. */
export function TotpForm({
  onSignedIn,
  onBack,
}: {
  onSignedIn: (session: SessionInfo) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const mutation = useMutation({
    mutationFn: (value: string) => verifyTotp(value),
    onSuccess: onSignedIn,
    onError: () => {
      setCode('');
    },
  });
  // Six digits send themselves.
  const { mutate, isPending } = mutation;
  useEffect(() => {
    if (!recovery && code.length === CODE_LENGTH && !isPending) {
      mutate(code);
    }
  }, [code, recovery, isPending, mutate]);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (code.trim().length > 0) {
      mutation.mutate(code);
    }
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        {recovery ? (
          <TextInput
            autoComplete="off"
            autoFocus
            description={RECOVERY_HINT}
            label="Recovery code"
            onChange={(e) => {
              setCode(e.currentTarget.value);
            }}
            placeholder="XXXX-XXXX-XXXX"
            value={code}
          />
        ) : (
          <Stack gap={6}>
            <Text fw={500} fz="sm">
              Code from your authenticator
            </Text>
            <CodeInput busy={isPending} onChange={setCode} value={code} />
          </Stack>
        )}
        <ErrorNote
          message={
            mutation.error
              ? describeError(
                  mutation.error,
                  recovery
                    ? 'That recovery code is not valid, or was used already.'
                    : 'That code is not right. Wait for the next one and try again.',
                )
              : undefined
          }
        />
        <Button
          fullWidth
          leftSection={<IconShieldLock size={16} />}
          loading={mutation.isPending}
          type="submit"
        >
          Sign in
        </Button>
        <Stack align="center" gap={4}>
          <Anchor
            component="button"
            fz="sm"
            onClick={() => {
              setRecovery(!recovery);
              setCode('');
              mutation.reset();
            }}
            type="button"
          >
            {recovery ? 'Use the authenticator instead' : 'Use a recovery code'}
          </Anchor>
          <Anchor c="dimmed" component="button" fz="sm" onClick={onBack} type="button">
            Back to the password
          </Anchor>
        </Stack>
      </Stack>
    </form>
  );
}

export function SetupForm({ onCreated }: { onCreated: () => void }) {
  const [setupToken, setSetupToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);

  const usernameCheck = UsernameSchema.safeParse(username);
  const passwordCheck = PasswordSchema.safeParse(password);
  const mismatch = repeat.length > 0 && repeat !== password;
  const valid =
    setupToken.length > 0 && usernameCheck.success && passwordCheck.success && repeat === password;

  const mutation = useMutation({
    mutationFn: () => createOwner({ setupToken, username, password }),
    onSuccess: () => {
      setPassword('');
      setRepeat('');
      onCreated();
    },
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (valid) {
      mutation.mutate();
    }
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <TextInput
          autoComplete="off"
          autoFocus
          description="The server printed it to its log when it started."
          label="Setup token"
          onChange={(e) => {
            setSetupToken(e.currentTarget.value.trim());
          }}
          required
          value={setupToken}
        />
        <TextInput
          autoComplete="username"
          description="Lower-case letters, digits, dot, dash or underscore. 2 to 32 characters."
          error={touched && !usernameCheck.success ? 'This login name is not allowed.' : undefined}
          label="Login name"
          onChange={(e) => {
            setUsername(e.currentTarget.value);
          }}
          required
          value={username}
        />
        <PasswordInput
          autoComplete="new-password"
          description={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A passphrase is fine.`}
          error={touched && !passwordCheck.success ? 'The password is too short.' : undefined}
          label="Password"
          onChange={(e) => {
            setPassword(e.currentTarget.value);
          }}
          required
          value={password}
        />
        <PasswordInput
          autoComplete="new-password"
          error={mismatch ? 'The passwords differ.' : undefined}
          label="Repeat the password"
          onChange={(e) => {
            setRepeat(e.currentTarget.value);
          }}
          required
          value={repeat}
        />
        <ErrorNote
          message={
            mutation.error
              ? describeError(
                  mutation.error,
                  'Sign in again to continue.',
                  'The setup token is not right.',
                )
              : undefined
          }
        />
        <Button fullWidth loading={mutation.isPending} type="submit">
          Create the owner
        </Button>
      </Stack>
    </form>
  );
}
