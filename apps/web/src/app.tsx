import { useLayoutEffect, useMemo, useRef } from 'react';
import { RouterProvider } from 'react-router';

import type { SessionInfo } from '@swellwright/contracts';

import { AuthGate } from './auth/gate.js';
import { StepUpProvider } from './auth/step-up.js';
import { followSavedLanguage } from './i18n.js';
import { createConsoleRouter } from './router.js';
import { ConsoleProvider } from './shell/console-context.js';

/** Made once, the first time the console is shown, and kept when the person signs out and in again. */
let router: ReturnType<typeof createConsoleRouter> | undefined;
const consoleRouter = () => (router ??= createConsoleRouter());

function Console({ session, signOut }: { session: SessionInfo; signOut: () => Promise<void> }) {
  // The language saved on the account wins once, when the session is first known. Later changes in this browser
  // are the person's own and must not be undone by an older value read back from the server. A layout effect
  // switches before the first paint, so the console does not flash in the wrong language.
  const appliedFor = useRef<string | undefined>(undefined);
  const { id: userId, language: savedLanguage } = session.user;
  useLayoutEffect(() => {
    if (appliedFor.current !== userId) {
      appliedFor.current = userId;
      followSavedLanguage(savedLanguage);
    }
  }, [userId, savedLanguage]);

  const value = useMemo(() => ({ session, signOut }), [session, signOut]);
  return (
    <ConsoleProvider value={value}>
      <StepUpProvider>
        <RouterProvider router={consoleRouter()} />
      </StepUpProvider>
    </ConsoleProvider>
  );
}

export function App() {
  return (
    <AuthGate>{(session, signOut) => <Console session={session} signOut={signOut} />}</AuthGate>
  );
}
