import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_NAMES,
  isLanguage,
  pickLanguage,
} from './languages.js';

describe('languages', () => {
  it('names every language in itself', () => {
    assert.deepEqual(Object.keys(LANGUAGE_NAMES).sort(), [...LANGUAGES].sort());
    assert.equal(LANGUAGE_NAMES.ru, 'Русский');
  });

  it('knows its languages and nothing else', () => {
    assert.ok(isLanguage('en') && isLanguage('ru'));
    for (const other of ['EN', 'ru-RU', 'de', '', null, undefined, 42]) {
      assert.equal(isLanguage(other), false, String(other));
    }
  });
});

describe('the language to start in', () => {
  it('is the one the person chose before', () => {
    assert.equal(pickLanguage({ stored: 'ru', browser: ['en-US'] }), 'ru');
    assert.equal(pickLanguage({ stored: 'en', browser: ['ru'] }), 'en');
  });

  it('ignores a stored value it does not know', () => {
    assert.equal(pickLanguage({ stored: 'klingon', browser: ['ru-RU'] }), 'ru');
    assert.equal(pickLanguage({ stored: '', browser: [] }), DEFAULT_LANGUAGE);
  });

  it('takes the first language of the browser that the console has', () => {
    assert.equal(pickLanguage({ browser: ['de-DE', 'ru-RU', 'en-US'] }), 'ru');
    assert.equal(pickLanguage({ browser: ['de', 'en-GB'] }), 'en');
    assert.equal(pickLanguage({ browser: ['RU'] }), 'ru');
    assert.equal(pickLanguage({ browser: ['ru_RU'] }), 'ru');
  });

  it('falls back to English', () => {
    assert.equal(pickLanguage({}), 'en');
    assert.equal(pickLanguage({ browser: ['de', 'fr'] }), 'en');
    assert.equal(pickLanguage({ stored: null, browser: undefined }), 'en');
  });
});
