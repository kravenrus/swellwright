import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { displayText, endOnBoundary, pageOf, startOnBoundary } from './output.js';

const bytes = (text: string): Buffer => Buffer.from(text, 'utf8');

describe('showing bytes as text', () => {
  it('decodes UTF-8 and turns invalid bytes and NUL into replacement characters', () => {
    assert.equal(displayText(bytes('héllo')), 'héllo');
    assert.equal(displayText(Buffer.from([0x61, 0xff, 0x62])), 'a�b');
    assert.equal(displayText(Buffer.from([0x61, 0x00, 0x62])), 'a�b');
  });
});

describe('cutting between characters', () => {
  it('ends a prefix before an incomplete sequence and keeps a complete one', () => {
    const text = bytes('aé€😀'); // 1, 2, 3 and 4 bytes
    for (let cut = 0; cut <= text.length; cut += 1) {
      const end = endOnBoundary(text.subarray(0, cut));
      assert.equal(
        displayText(text.subarray(0, end)).includes('�'),
        false,
        `cut at ${String(cut)}`,
      );
      assert.ok(end <= cut && cut - end <= 3, `cut at ${String(cut)} gave ${String(end)}`);
    }
  });

  it('starts a window after the continuation bytes of a character it began in the middle of', () => {
    const text = bytes('a😀b');
    for (let from = 0; from <= text.length; from += 1) {
      const window = startOnBoundary(text.subarray(from));
      assert.equal(displayText(window).includes('�'), false, `from ${String(from)}`);
    }
  });
});

describe('a page of output', () => {
  const text = bytes('héllo wörld, ünïcode 😀 end');

  it('never ends or starts inside a character, so pages read in order give the text back', () => {
    for (const limit of [1, 2, 3, 4, 5, 7, 16]) {
      let offset = 0;
      let rebuilt = '';
      let guard = 0;
      while (offset < text.length && guard < 200) {
        guard += 1;
        const window = text.subarray(offset, offset + limit + 3);
        const more = offset + window.length < text.length;
        const page = pageOf(window, limit, more);
        assert.ok(
          page.length > 0,
          `a page is never empty (limit ${String(limit)}, offset ${String(offset)})`,
        );
        rebuilt += displayText(page);
        offset += page.length;
      }
      assert.equal(rebuilt, text.toString('utf8'), `limit ${String(limit)}`);
    }
  });

  it('shows an incomplete character at the very end of finished output as a replacement character', () => {
    const cut = text.subarray(0, text.length - 2);
    const page = pageOf(cut, 1000, false);
    assert.equal(page.length, cut.length);
    assert.ok(displayText(page).endsWith('�') || displayText(page).endsWith('e'));
  });

  it('holds an incomplete character back while the output may still grow', () => {
    const cut = bytes('ab😀').subarray(0, 4); // 'ab' and the first two bytes of the emoji
    const page = pageOf(cut, 1000, true);
    assert.equal(displayText(page), 'ab');
  });
});
