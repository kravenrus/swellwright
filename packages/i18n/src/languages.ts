/** The languages of the console. English is the source of the texts and the fallback; Russian is complete. */
export const LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** How each language names itself, for the language switch: a person looks for their own language. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  en: 'English',
  ru: 'Русский',
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** `ru-RU` and `RU` are Russian: the part before the first dash or underscore decides. */
function primaryLanguage(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/u)[0] ?? '';
}

export interface LanguageChoice {
  /** What the person chose before, if anything. */
  readonly stored?: string | null | undefined;
  /** The languages of the browser, most wanted first (`navigator.languages`). */
  readonly browser?: readonly string[] | undefined;
}

/**
 * The language to start in: the person's own choice, then the first language of the browser that the console
 * has, then English.
 */
export function pickLanguage({ stored, browser = [] }: LanguageChoice): Language {
  if (isLanguage(stored)) {
    return stored;
  }
  for (const tag of browser) {
    const primary = primaryLanguage(tag);
    if (isLanguage(primary)) {
      return primary;
    }
  }
  return DEFAULT_LANGUAGE;
}
