import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MRT_Localization_EN, MRT_Localization_RU } from '@swellwright/ui';

type Localization = typeof MRT_Localization_EN;

/**
 * The texts of a table (`@kastov/mantine-react-table-open`) in the language of the console. The panel does not
 * translate them; the package ships both bundles, so this console does. `empty` replaces the "no records" line.
 */
export function useTableLocalization(empty: string): Localization {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return useMemo(
    () => ({
      ...(language.startsWith('ru') ? MRT_Localization_RU : MRT_Localization_EN),
      noRecordsToDisplay: empty,
    }),
    [language, empty],
  );
}
