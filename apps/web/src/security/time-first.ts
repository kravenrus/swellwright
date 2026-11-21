import { useDateTime } from '../format.js';

/**
 * Formats a moment the way the panel's tables do (`TIME_FIRST_DATETIME`): the time with seconds first, then the
 * date (`14:30:00, 5 March 2026` or `14:30:00, 5 марта 2026`), in the language of the console. It is the console's one
 * date format: `useDateTime` gives the same text, and this name stays for the pages that already call it.
 */
export function useTimeFirst(): (value: string | number | Date) => string {
  return useDateTime();
}
