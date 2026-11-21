import { Button, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PiArrowClockwiseDuotone } from 'react-icons/pi';

import type { PendingSession, SessionInfo } from '@swellwright/contracts';

import { ApiRequestError, ApiUnreachableError, getMe, getSetupStatus, logout } from '../api.js';
import { LoadingProgress } from '../shell/loading-progress.js';
import { EnrollmentStep, RecoveryCodes } from './enrollment.js';
import { LoginForm, SetupForm, TotpForm } from './forms.js';
import { AcceptInvitationForm, takeInvitationFromAddress } from './invitation.js';
import { AuthLayout } from './layout.js';

type Step = 'login' | 'setup' | 'totp' | 'enroll' | 'invite';

const ME_KEY = ['auth', 'me'] as const;

/**
 * Shows the console only to a signed-in person. Before that it walks through what the server asks for:
 * first-run setup, the password, then the authenticator (or its enrollment).
 */
export function AuthGate({
  children,
}: {
  children: (session: SessionInfo, signOut: () => Promise<void>) => ReactNode;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe, retry: false });
  const signedOut = me.data === null;
  const setup = useQuery({
    queryKey: ['auth', 'setup'],
    queryFn: getSetupStatus,
    enabled: signedOut,
    retry: false,
  });
  // A link with an invitation opens its screen first; the token leaves the address bar at once.
  const [invitation] = useState(takeInvitationFromAddress);
  const [step, setStep] = useState<Step | undefined>(invitation ? 'invite' : undefined);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | undefined>(undefined);

  const signOut = async () => {
    try {
      await logout();
    } finally {
      queryClient.setQueryData(ME_KEY, null);
      setStep(undefined);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'setup'] });
    }
  };
  const signedIn = (session: SessionInfo) => {
    queryClient.setQueryData(ME_KEY, session);
  };
  const next = (result: PendingSession['next']) => {
    setStep(result === 'totp' ? 'totp' : 'enroll');
  };
  const backToPassword = () => {
    // The password-only session is of no use now; drop it so nothing is left behind.
    void logout().catch(() => undefined);
    setStep('login');
  };

  if (recoveryCodes) {
    return (
      <AuthLayout
        description={t('recoveryCodes.description')}
        pageTitle={t('recoveryCodes.title')}
        title={t('recoveryCodes.title')}
      >
        <RecoveryCodes
          codes={recoveryCodes}
          onDone={() => {
            setRecoveryCodes(undefined);
          }}
        />
      </AuthLayout>
    );
  }
  if (me.isPending) {
    return <LoadingProgress />;
  }
  if (me.isError) {
    const unreachable = me.error instanceof ApiUnreachableError;
    return (
      <AuthLayout
        pageTitle={unreachable ? t('gate.apiDownTitle') : t('gate.somethingWrongTitle')}
        status={unreachable ? t('gate.apiDownTitle') : t('gate.somethingWrongTitle')}
      >
        <Stack gap="md">
          <Text c="dimmed" size="sm" ta="center">
            {unreachable ? t('gate.apiDownHint') : t('gate.versionMismatchHint')}
          </Text>
          <Button
            fullWidth
            leftSection={<PiArrowClockwiseDuotone size="16px" />}
            onClick={() => {
              void me.refetch();
            }}
            variant="default"
          >
            {t('common:retry')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }
  if (me.data) {
    return <>{children(me.data, signOut)}</>;
  }

  // Nobody is signed in. A server without a database cannot say whether it has an owner.
  if (setup.isPending) {
    return <LoadingProgress />;
  }
  if (setup.isError) {
    const noDatabase = setup.error instanceof ApiRequestError && setup.error.code === 'not_ready';
    return (
      <AuthLayout
        pageTitle={noDatabase ? t('gate.noDatabaseTitle') : t('gate.apiDownTitle')}
        status={noDatabase ? t('gate.noDatabaseTitle') : t('gate.apiDownTitle')}
      >
        <Text c="dimmed" size="sm" ta="center">
          {noDatabase ? t('gate.noDatabaseHint') : t('gate.serverDownHint')}
        </Text>
      </AuthLayout>
    );
  }

  const current: Step = step ?? (setup.data.initialized ? 'login' : 'setup');
  switch (current) {
    case 'invite':
      return (
        <AuthLayout
          description={t('invitation.description')}
          pageTitle={t('invitation.title')}
          title={t('invitation.title')}
        >
          <AcceptInvitationForm
            initialToken={invitation}
            onAccepted={() => {
              setStep('enroll');
            }}
            onBack={() => {
              setStep('login');
            }}
          />
        </AuthLayout>
      );
    case 'setup':
      return (
        <AuthLayout
          description={t('setup.description')}
          pageTitle={t('setup.title')}
          title={t('setup.title')}
        >
          <SetupForm
            onCreated={() => {
              setStep('enroll');
            }}
          />
        </AuthLayout>
      );
    case 'login':
      return (
        <AuthLayout pageTitle={t('login.title')}>
          <LoginForm onNext={next} />
        </AuthLayout>
      );
    case 'totp':
      return (
        <AuthLayout pageTitle={t('totp.title')}>
          <TotpForm onBack={backToPassword} onSignedIn={signedIn} />
        </AuthLayout>
      );
    case 'enroll':
      return (
        <AuthLayout
          description={t('enrollment.description')}
          pageTitle={t('enrollment.title')}
          title={t('enrollment.title')}
        >
          <EnrollmentStep
            onConfirmed={(result) => {
              setRecoveryCodes(result.recoveryCodes);
              signedIn({
                user: result.user,
                permissions: result.permissions,
                expiresAt: result.expiresAt,
              });
            }}
          />
        </AuthLayout>
      );
  }
}
