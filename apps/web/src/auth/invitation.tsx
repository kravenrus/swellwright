import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PASSWORD_MIN_LENGTH, PasswordSchema } from '@swellwright/contracts';

import { acceptInvitation } from '../api.js';
import { describeError } from './messages.js';

const HASH_PREFIX = '#invite=';

let taken: { token: string | undefined } | undefined;

/**
 * The invitation token from the address (`#invite=<token>`), removed from it so it does not stay in the
 * history or get copied along with the address. Undefined when the address has none.
 */
export function takeInvitationFromAddress(): string | undefined {
  // Read once and remembered: React may run an initializer twice, and the second look finds the address bare.
  if (!taken) {
    const { hash } = window.location;
    let token: string | undefined;
    if (hash.startsWith(HASH_PREFIX)) {
      try {
        token = decodeURIComponent(hash.slice(HASH_PREFIX.length)).trim() || undefined;
      } catch {
        token = undefined;
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    taken = { token };
  }
  return taken.token;
}

/** The link an owner hands over: the console's own address with the token in the fragment. */
export const invitationLink = (token: string): string =>
  `${window.location.origin}/${HASH_PREFIX}${encodeURIComponent(token)}`;

/** Choosing a password with an invitation; the authenticator is set up next. */
export function AcceptInvitationForm({
  initialToken,
  onAccepted,
  onBack,
}: {
  initialToken: string | undefined;
  onAccepted: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation('auth');
  const [token, setToken] = useState(initialToken ?? '');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);

  const passwordCheck = PasswordSchema.safeParse(password);
  const mismatch = repeat.length > 0 && repeat !== password;
  const valid = token.length > 0 && passwordCheck.success && repeat === password;

  const mutation = useMutation({
    mutationFn: () => acceptInvitation({ token, password }),
    onSuccess: () => {
      setPassword('');
      setRepeat('');
      onAccepted();
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
          description={t('invitation.tokenHint')}
          label={t('invitation.tokenLabel')}
          onChange={(e) => {
            setToken(e.currentTarget.value.trim());
          }}
          required
          value={token}
        />
        <PasswordInput
          autoComplete="new-password"
          autoFocus={token.length > 0}
          description={t('shared.passwordHint', { count: PASSWORD_MIN_LENGTH })}
          error={touched && !passwordCheck.success ? t('shared.passwordTooShort') : undefined}
          label={t('invitation.passwordLabel')}
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
        {mutation.error ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
            {describeError(t, mutation.error, t('invitation.invalid'))}
          </Alert>
        ) : null}
        <Button fullWidth loading={mutation.isPending} type="submit">
          {t('invitation.submit')}
        </Button>
        <Text c="dimmed" fz="sm" ta="center">
          {t('invitation.next')}
        </Text>
        <Anchor c="dimmed" component="button" fz="sm" onClick={onBack} type="button">
          {t('invitation.backToSignIn')}
        </Anchor>
      </Stack>
    </form>
  );
}
