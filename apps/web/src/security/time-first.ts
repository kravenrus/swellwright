import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Formats a moment the way the panel's tables do (`TIME_FIRST_DATETIME`): the time with seconds first, then the
 * date (`14:30:00, 5 March 2026` or `14:30:00, 5 марта 2026 г.`), in the language of the console.
 */
export function useTimeFirst(): (value: string | number | Date) => string {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const date = new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return (value) => {
      const moment = new Date(value);
      return `${time.format(moment)}, ${date.format(moment)}`;
    };
  }, [language]);
}
