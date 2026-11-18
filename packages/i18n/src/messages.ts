import type { Language } from './languages.js';
import { en } from './locales/en/index.js';
import { ru } from './locales/ru/index.js';

/** The texts of every language, by namespace. A namespace is one area of the console (`auth`, `users`, ...). */
export const resources = { en, ru } as const satisfies Record<Language, object>;

export type Namespace = keyof typeof en;
export const NAMESPACES = Object.keys(en) as Namespace[];
/** The namespace `t('key')` uses when none is named. */
export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;
