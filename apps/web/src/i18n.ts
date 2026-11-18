import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  DEFAULT_LANGUAGE,
  DEFAULT_NAMESPACE,
  LANGUAGES,
  NAMESPACES,
  isLanguage,
  pickLanguage,
  resources,
  type Language,
} from '@swellwright/i18n';

const STORAGE_KEY = 'sw.language';

/** The language the person chose on this browser. The storage can be blocked (private windows); that is no error. */
function storedLanguage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function announce(language: string): void {
  document.documentElement.lang = language;
}

/** Starts in the chosen language, else the browser's, else English. All texts are part of the bundle. */
void i18next.use(initReactI18next).init({
  resources,
  lng: pickLanguage({ stored: storedLanguage(), browser: navigator.languages }),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  ns: [...NAMESPACES],
  defaultNS: DEFAULT_NAMESPACE,
  // The texts are all in the bundle, so there is nothing to wait for: the first render already has them.
  initAsync: false,
  // React escapes what it renders; escaping here as well would show `&amp;`.
  interpolation: { escapeValue: false },
});
announce(i18next.language);

/** The language in use. */
export function currentLanguage(): Language {
  return isLanguage(i18next.language) ? i18next.language : DEFAULT_LANGUAGE;
}

/** Switches the console to another language and remembers the choice on this browser. */
export async function setLanguage(language: Language): Promise<void> {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The choice then lasts until the page is closed.
  }
  await i18next.changeLanguage(language);
  announce(language);
}

/**
 * Follows the language saved on the account, when there is one the console has texts for and it is not the one in
 * use. It never calls the server: the value came from there, so there is nothing to save. `null` (the person has
 * not chosen) keeps what this browser chose or detected.
 */
export function followSavedLanguage(saved: string | null): void {
  if (saved !== null && isLanguage(saved) && saved !== currentLanguage()) {
    void setLanguage(saved);
  }
}

export { i18next };
