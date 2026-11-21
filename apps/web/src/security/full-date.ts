import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Formats a day the way the panel's cards and tables do (`FULL_DATE`, dayjs `D MMMM YYYY`): `5 March 2026`,
 * `5 марта 2026`. For a value that is a day rather than a moment, such as the expiry of a secret; a moment goes through
 * `useTimeFirst`. The date is put together from the parts of `Intl`, because its own pattern differs by language
 * (`March 5, 2026`, `5 марта 2026 г.`).
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
