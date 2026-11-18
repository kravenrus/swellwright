import { useState } from 'react';

/**
 * The last value that was not `undefined`. A dialog opens for a record and closes by clearing it; this keeps the
 * record on screen while the dialog fades out, so its title and body do not empty out during the transition.
 */
export function useLastDefined<T>(value: T | undefined): T | undefined {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) {
    setKept(value);
  }
  return value ?? kept;
}
