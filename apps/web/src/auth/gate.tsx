import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconApi } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import type { PendingSession, SessionInfo } from '@swellwright/contracts';

import { ApiRequestError, ApiUnreachableError, getMe, getSetupStatus, logout } from '../api.js';
import { EnrollmentStep, RecoveryCodes } from './enrollment.js';
import { LoginForm, SetupForm, TotpForm } from './forms.js';
import { AuthLayout } from './layout.js';

type Step = 'login' | 'setup' | 'totp' | 'enroll';

const ME_KEY = ['auth', 'me'] as const;

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="sw-auth">
      <Group justify="center">{children}</Group>
    </main>
  );
}

/**
 * Shows the console only to a signed-in person. Before that it walks through what the server asks for:
 * first-run setup, the password, then the authenticator (or its enrollment).
 */
export function AuthGate({
  children,
}: {
  children: (session: SessionInfo, signOut: () => Promise<void>) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: getMe, retry: false });
  const signedOut = me.data === null;
  const setup = useQuery({
    queryKey: ['auth', 'setup'],
    queryFn: getSetupStatus,
    enabled: signedOut,
    retry: false,
  });
  const [step, setStep] = useState<Step | undefined>(undefined);
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
        description="Your authenticator works. Save the recovery codes before you go on."
        title="Recovery codes"
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
    return (
      <Centered>
        <Loader size="sm" />
      </Centered>
    );
  }
  if (me.isError) {
    const unreachable = me.error instanceof ApiUnreachableError;
    return (
      <AuthLayout title={unreachable ? 'The API does not answer' : 'Something is wrong'}>
        <Alert color="red" icon={<IconApi size={18} />} variant="light">
          <Stack gap="xs">
            <Text fz="sm">
              {unreachable
                ? 'Start the API (pnpm --filter @swellwright/api start) or check the reverse proxy, then try again.'
                : 'The API answered with something unexpected. The API and the console are probably from different versions.'}
            </Text>
            <Group>
              <Button
                onClick={() => {
                  void me.refetch();
                }}
                size="xs"
                variant="default"
              >
                Try again
              </Button>
            </Group>
          </Stack>
        </Alert>
      </AuthLayout>
    );
  }
  if (me.data) {
    return <>{children(me.data, signOut)}</>;
  }

  // Nobody is signed in. A server without a database cannot say whether it has an owner.
  if (setup.isPending) {
    return (
      <Centered>
        <Loader size="sm" />
      </Centered>
    );
  }
  if (setup.isError) {
    const noDatabase = setup.error instanceof ApiRequestError && setup.error.code === 'not_ready';
    return (
      <AuthLayout title={noDatabase ? 'No database yet' : 'The API does not answer'}>
        <Alert color="red" icon={<IconApi size={18} />} variant="light">
          <Text fz="sm">
            {noDatabase
              ? 'The server is running without a database, so nobody can sign in yet. Set SW_DATABASE_URL, apply the migrations and restart it.'
              : 'Check that the server is running, then reload this page.'}
          </Text>
        </Alert>
      </AuthLayout>
    );
  }

  const current: Step = step ?? (setup.data.initialized ? 'login' : 'setup');
  switch (current) {
    case 'setup':
      return (
        <AuthLayout
          description="No one owns this instance yet. Create the owner account, then set up an authenticator."
          title="First-run setup"
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
        <AuthLayout description="Sign in to the Swellwright console." title="Sign in">
          <LoginForm onNext={next} />
        </AuthLayout>
      );
    case 'totp':
      return (
        <AuthLayout
          description="Enter the code from your authenticator app, or a recovery code."
          title="Two-step verification"
        >
          <TotpForm onBack={backToPassword} onSignedIn={signedIn} />
        </AuthLayout>
      );
    case 'enroll':
      return (
        <AuthLayout
          description="Sign-in needs a second step. Set up an authenticator app now."
          title="Set up two-step verification"
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
