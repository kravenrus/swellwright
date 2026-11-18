# packages/i18n

The texts of the console in English and Russian, the list of languages and the rule that picks one. Decisions: [ADR 0020](../../docs/adr/0020-console-texts-with-i18next.md).

The package has no dependency on i18next: it is plain objects and a few functions. `apps/web` feeds it to i18next.

## Layout

```text
src/languages.ts           LANGUAGES, LANGUAGE_NAMES, pickLanguage (stored choice, then the browser, then English)
src/messages.ts            resources = { en, ru }, NAMESPACES
src/locales/en/<ns>.ts     one namespace per file: common, nav, errors, auth, users, roles, audit, overview
src/locales/ru/<ns>.ts     the same keys in Russian
src/messages.test.ts       the two languages must match
```

## Writing texts

- English is the source. Add the key to `locales/en/<ns>.ts`, then to `locales/ru/<ns>.ts`; the web build refuses a key that English lacks, and the test refuses a language that differs from English.
- A sentence is one text with `{{placeholders}}`. A count uses plural keys: `key_one` and `key_other` in English, `key_one`, `key_few`, `key_many` and `key_other` in Russian, and `t('key', { count })`.
- Technical identifiers shown as data (audit actions, permission ids) are not translated.

## Adding a language

Add a directory `src/locales/<code>/` with the same files, an entry in `LANGUAGES` and `LANGUAGE_NAMES` (the language's name in itself), and the language to `resources`. `pnpm --filter @swellwright/i18n run test` then lists every key it lacks.
