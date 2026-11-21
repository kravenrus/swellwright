import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Formats a moment the way the panel's tables do (`TIME_FIRST_DATETIME`, dayjs `HH:mm:ss, D MMMM YYYY`): the time with
 * seconds first, then day, month name and year in that order whatever the language (`14:30:00, 5 March 2026` or
 * `14:30:00, 5 марта 2026`). The date is put together from the parts of `Intl`, because its own pattern differs by
 * language (`March 5, 2026`, `5 марта 2026 г.`).
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
      const parts = date.formatToParts(moment);
      const part = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((candidate) => candidate.type === type)?.value ?? '';
      return `${time.format(moment)}, ${part('day')} ${part('month')} ${part('year')}`;
    };
  }, [language]);
}

/**
 * Formats a day the way the panel's cards and tables do (`FULL_DATE`, dayjs `D MMMM YYYY`): `5 March 2026`,
 * `5 марта 2026`. For a date that is a day rather than a moment, such as the expiry of a secret.
 */
export function useFullDate(): (value: string | number | Date) => string {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const date = new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return (value) => {
      const parts = date.formatToParts(new Date(value));
      const part = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((candidate) => candidate.type === type)?.value ?? '';
      return `${part('day')} ${part('month')} ${part('year')}`;
    };
  }, [language]);
}
