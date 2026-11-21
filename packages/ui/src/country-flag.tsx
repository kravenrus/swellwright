// The flag of a country as the Remnawave panel frontend 3.4.11 (AGPL-3.0-only) draws it in its Nodes table and node cards
// (src/widgets/dashboard/nodes/nodes-datatable/use-nodes-table-widget.tsx): `react-country-flag` in its emoji mode with a
// 1.1em font and a 2 px radius. Changes: a country that is unknown or has no code shows nothing; the flag has an
// accessible name (the name of the country in the language of the console) and the picture mode of the library, which
// would fetch an image from a CDN, is not exposed.
import { ReactCountryFlag } from 'react-country-flag';

const COUNTRY_CODE = /^[A-Za-z]{2}$/u;

export interface CountryFlagProps {
  /** ISO 3166-1 alpha-2. Anything else (and the panel's `XX`) draws nothing. */
  code: string | null | undefined;
  /** Spoken name of the country; the code when none is given. */
  label?: string;
}

export function CountryFlag({ code, label }: CountryFlagProps) {
  if (
    code === null ||
    code === undefined ||
    !COUNTRY_CODE.test(code) ||
    code.toUpperCase() === 'XX'
  ) {
    return null;
  }
  return (
    <ReactCountryFlag
      aria-label={label ?? code.toUpperCase()}
      countryCode={code}
      style={{ fontSize: '1.1em', borderRadius: '2px' }}
      title={label ?? code.toUpperCase()}
    />
  );
}
