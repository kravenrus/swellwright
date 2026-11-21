// The date fields of the Remnawave panel frontend 3.4.11 (AGPL-3.0-only) are Mantine's `DatePickerInput` (for example
// src/shared/_modals/infra-billing/create-infra-billing-node-modal/create-infra-billing-node.modal.tsx: a calendar icon,
// `valueFormat="D MMMM, YYYY"`, `highlightToday`, the language of the interface as `locale`). The panel prepares dayjs for
// it in src/app.tsx (the `customParseFormat` plugin) and src/shared/utils/time-utils/index.ts (the `ru` locale). This
// file does the same and re-exports the field, so that a page uses it as the panel does. Changes: only the Russian
// locale is loaded, the console has no others.
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

export { DatePickerInput, type DatePickerInputProps } from '@mantine/dates';
