import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** The officially assigned ISO 3166-1 alpha-2 codes. The names come from the browser (`Intl.DisplayNames`). */
const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );

export interface CountryOption {
  value: string;
  label: string;
}

/** The name of a country in a language; the code itself when the browser does not know it. */
export function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The names of the countries for a select and for a flag's name, in the language of the console. */
export function useCountries(): {
  options: CountryOption[];
  nameOf: (code: string | null | undefined) => string;
} {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return useMemo(() => {
    const names = new Map(COUNTRY_CODES.map((code) => [code, countryName(code, language)]));
    const options = [...names]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, language));
    return {
      options,
      nameOf: (code) => (code ? (names.get(code.toUpperCase()) ?? code) : ''),
    };
  }, [language]);
}
