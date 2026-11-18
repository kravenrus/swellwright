import type { DEFAULT_NAMESPACE, resources } from '@swellwright/i18n';

// Makes `t('key')` check the key (and the namespace in `useTranslation('ns')`) against the English texts.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: (typeof resources)['en'];
  }
}
