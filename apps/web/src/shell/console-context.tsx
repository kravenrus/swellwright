import { createContext, useContext, type ReactNode } from 'react';

import type { SessionInfo } from '@swellwright/contracts';

/** What every page of the console may ask about the person who is signed in. */
export interface ConsoleContextValue {
  session: SessionInfo;
  signOut: () => Promise<void>;
}

const ConsoleContext = createContext<ConsoleContextValue | undefined>(undefined);

export function ConsoleProvider({
  value,
  children,
}: {
  value: ConsoleContextValue;
  children: ReactNode;
}) {
  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext);
  if (value === undefined) {
    throw new Error('useConsole must be used inside the signed-in console.');
  }
  return value;
}
