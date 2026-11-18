import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type DateTimeStyle = 'short' | 'medium';

/**
 * Formats a date and time in the language of the console (`12 Nov 2026, 14:30` or `12 нояб. 2026 г., 14:30`).
 * Use this instead of a formatter made once at the top of a file: that one does not follow a change of language.
 */
export function useDateTime(
  style: DateTimeStyle = 'medium',
): (value: string | number | Date) => string {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: style });
    return (value) => format.format(new Date(value));
  }, [language, style]);
}

/** Formats a whole number with the separators of the console's language. */
export function useNumber(): (value: number) => string {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const format = new Intl.NumberFormat(language);
    return (value) => format.format(value);
  }, [language]);
}
