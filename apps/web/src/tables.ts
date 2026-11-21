import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MRT_Localization_EN, MRT_Localization_RU } from '@swellwright/ui';

type Localization = typeof MRT_Localization_EN;

/**
 * The texts of a table (`@kastov/mantine-react-table-open`) in the language of the console. The panel does not
 * translate them; the package ships both bundles, so this console does. `empty` replaces the "no records" line, and
 * the placeholder of the filter fields is the short one the panel uses.
 */
export function useTableLocalization(empty: string): Localization {
  const { i18n, t } = useTranslation('common');
  const filterBy = t('filterBy');
  const language = i18n.resolvedLanguage ?? i18n.language;
  return useMemo(
    () => ({
      ...(language.startsWith('ru') ? MRT_Localization_RU : MRT_Localization_EN),
      noRecordsToDisplay: empty,
      // The panel's filter fields say "Filter by..." in every column (it passes that text to the table). The
      // bundle's own text names the column and is cut off in a narrow one.
      filterByColumn: filterBy,
    }),
    [language, empty, filterBy],
  );
}
