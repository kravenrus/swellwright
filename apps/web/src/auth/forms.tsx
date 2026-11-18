import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconKey, IconShieldLock } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation(['auth', 'common']);
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
          label={t('shared.loginName')}
          onChange={(e) => {
            setUsername(e.currentTarget.value);
          }}
          required
          value={username}
        />
        <PasswordInput
          autoComplete="current-password"
          label={t('shared.password')}
          onChange={(e) => {
            setPassword(e.currentTarget.value);
          }}
          required
          value={password}
        />
        <ErrorNote
          message={
            mutation.error
              ? describeError(t, mutation.error, t('login.wrongCredentials'))
              : undefined
          }
        />
        <Button
          fullWidth
          leftSection={<IconKey size={16} />}
          loading={mutation.isPending}
          type="submit"
        >
          {t('common:continue')}
        </Button>
      </Stack>
    </form>
  );
}

/** The second step: six digits from the authenticator, or one recovery code. */
export function TotpForm({
  onSignedIn,
  onBack,
}: {
  onSignedIn: (session: SessionInfo) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(['auth', 'common']);
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
            description={t('totp.recoveryHint')}
            label={t('totp.recoveryLabel')}
            onChange={(e) => {
              setCode(e.currentTarget.value);
            }}
            placeholder="XXXX-XXXX-XXXX"
            value={code}
          />
        ) : (
          <Stack gap={6}>
            <Text fw={500} fz="sm">
              {t('totp.codeLabel')}
            </Text>
            <CodeInput busy={isPending} onChange={setCode} value={code} />
          </Stack>
        )}
        <ErrorNote
          message={
            mutation.error
              ? describeError(
                  t,
                  mutation.error,
                  recovery ? t('totp.recoveryInvalid') : t('totp.codeWrong'),
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
          {t('totp.submit')}
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
            {recovery ? t('totp.useAuthenticator') : t('totp.useRecovery')}
          </Anchor>
          <Anchor c="dimmed" component="button" fz="sm" onClick={onBack} type="button">
            {t('totp.backToPassword')}
          </Anchor>
        </Stack>
      </Stack>
    </form>
  );
}

export function SetupForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation(['auth', 'common']);
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
          description={t('setup.tokenHint')}
          label={t('setup.tokenLabel')}
          onChange={(e) => {
            setSetupToken(e.currentTarget.value.trim());
          }}
          required
          value={setupToken}
        />
        <TextInput
          autoComplete="username"
          description={t('setup.usernameHint')}
          error={touched && !usernameCheck.success ? t('setup.usernameInvalid') : undefined}
          label={t('shared.loginName')}
          onChange={(e) => {
            setUsername(e.currentTarget.value);
          }}
          required
          value={username}
        />
        <PasswordInput
          autoComplete="new-password"
          description={t('shared.passwordHint', { count: PASSWORD_MIN_LENGTH })}
          error={touched && !passwordCheck.success ? t('shared.passwordTooShort') : undefined}
          label={t('shared.password')}
          onChange={(e) => {
            setPassword(e.currentTarget.value);
          }}
          required
          value={password}
        />
        <PasswordInput
          autoComplete="new-password"
          error={mismatch ? t('shared.passwordsDiffer') : undefined}
          label={t('shared.repeatPassword')}
          onChange={(e) => {
            setRepeat(e.currentTarget.value);
          }}
          required
          value={repeat}
        />
        <ErrorNote
          message={
            mutation.error
              ? describeError(t, mutation.error, t('shared.signInAgain'), t('setup.tokenWrong'))
              : undefined
          }
        />
        <Button fullWidth loading={mutation.isPending} type="submit">
          {t('setup.submit')}
        </Button>
      </Stack>
    </form>
  );
}
