import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

import { SshInputError } from './errors.js';
import {
  assertEnvName,
  assertStepId,
  checkedHost,
  checkedPort,
  defaultStepBaseDir,
  normalizeFingerprint,
  remoteDirWord,
  shellQuote,
} from './shell.js';
import { NO_POSIX_SHELL } from './test-util.js';

const HOSTILE = [
  '',
  'plain',
  'with space',
  "it's",
  "'; touch /tmp/pwned; '",
  '$(id)',
  '`id`',
  '${HOME}',
  '"; id; "',
  'line one\nline two',
  '\\',
  "\\'",
  'a;b|c&d>e<f',
  '*?[x]',
  '~',
  '-rf',
  'ünïcödé 日本語 🙂',
  '%s%n',
  '!history',
];

describe('shellQuote', () => {
  it('always yields one single-quoted word with every inner quote escaped', () => {
    for (const value of HOSTILE) {
      const quoted = shellQuote(value);
      assert.ok(quoted.startsWith("'") && quoted.endsWith("'"), quoted);
      // Remove the sanctioned escape and the outer quotes: no single quote may remain.
      const inner = quoted.slice(1, -1).replaceAll("'\\''", '');
      assert.ok(!inner.includes("'"), `unescaped quote in ${quoted}`);
    }
  });

  it('refuses a NUL, which no process can receive', () => {
    assert.throws(() => shellQuote('a\0b'), SshInputError);
  });

  it('survives a real POSIX shell unchanged', { skip: NO_POSIX_SHELL }, () => {
    for (const value of HOSTILE) {
      const run = spawnSync('/bin/sh', ['-c', `printf '%s' ${shellQuote(value)}`], {
        encoding: 'utf8',
      });
      assert.equal(run.status, 0);
      assert.equal(run.stdout, value, JSON.stringify(value));
    }
  });

  it('never lets a hostile value run a command', { skip: NO_POSIX_SHELL }, () => {
    const run = spawnSync('/bin/sh', ['-c', `echo ${shellQuote("x'; echo INJECTED; echo '")}`], {
      encoding: 'utf8',
    });
    assert.equal(run.stdout.trim(), "x'; echo INJECTED; echo '");
  });
});

describe('step ids', () => {
  it('accept lowercase letters, digits and hyphen up to 64 characters', () => {
    for (const id of ['a', 'step-1', '0', 'a'.repeat(64), '--', 'x-y-z']) {
      assert.doesNotThrow(() => {
        assertStepId(id);
      });
    }
  });

  it('refuse everything that could escape a directory or reach a shell', () => {
    const bad = [
      '',
      'A',
      'a b',
      'a/b',
      '../x',
      '..',
      '.',
      'a;b',
      '$(id)',
      '`id`',
      "a'b",
      'a\nb',
      'a'.repeat(65),
      'ä',
      'a_b',
      'a.b',
      '~',
    ];
    for (const id of bad) {
      assert.throws(
        () => {
          assertStepId(id);
        },
        SshInputError,
        JSON.stringify(id),
      );
    }
  });
});

describe('remote directories', () => {
  it('quote absolute paths and expand ~ from $HOME', () => {
    assert.equal(remoteDirWord('/var/lib/swellwright/steps'), "'/var/lib/swellwright/steps'");
    assert.equal(remoteDirWord('~/.swellwright/steps'), `"$HOME"'/.swellwright/steps'`);
    assert.equal(remoteDirWord('/tmp/a b/'), "'/tmp/a b'");
    assert.equal(remoteDirWord('/'), "'/'");
  });

  it('keep hostile characters inside the quotes', () => {
    assert.equal(remoteDirWord("/tmp/it's"), "'/tmp/it'\\''s'");
    assert.equal(remoteDirWord('/tmp/$(id)'), "'/tmp/$(id)'");
  });

  it('refuse relative paths, parent segments and control characters', () => {
    for (const bad of [
      '',
      'relative',
      './x',
      '~',
      '~/',
      '/a/../b',
      '~/../x',
      '/a\nb',
      '/a\0b',
      `/${'x'.repeat(1030)}`,
    ]) {
      assert.throws(() => remoteDirWord(bad), SshInputError, JSON.stringify(bad));
    }
  });

  it('default to a per-user directory', () => {
    assert.equal(defaultStepBaseDir('root'), '/var/lib/swellwright/steps');
    assert.equal(defaultStepBaseDir('deploy'), '~/.swellwright/steps');
  });
});

describe('other validators', () => {
  it('check environment variable names', () => {
    assertEnvName('PATH');
    assertEnvName('_x1');
    for (const bad of ['', '1A', 'A-B', 'A B', 'A=B', 'A;B', '$X']) {
      assert.throws(() => {
        assertEnvName(bad);
      }, SshInputError);
    }
  });

  it('check hosts and ports', () => {
    assert.equal(checkedHost(' example.com '), 'example.com');
    assert.equal(checkedHost('192.0.2.7'), '192.0.2.7');
    for (const bad of ['', '  ', 'a b', 'a\nb', 'x'.repeat(256)])
      assert.throws(() => checkedHost(bad), SshInputError);
    assert.equal(checkedPort(22), 22);
    for (const bad of [0, -1, 65536, 1.5, Number.NaN])
      assert.throws(() => checkedPort(bad), SshInputError);
  });

  it('normalise fingerprints and refuse anything that is not SHA256 base64', () => {
    const good = `SHA256:${'A'.repeat(43)}`;
    assert.equal(normalizeFingerprint(good), good);
    assert.equal(normalizeFingerprint(`${good}=`), good);
    assert.equal(normalizeFingerprint(` ${good} `), good);
    for (const bad of [
      '',
      'SHA256:short',
      `MD5:${'A'.repeat(43)}`,
      `SHA256:${'A'.repeat(42)}!`,
      'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99',
    ]) {
      assert.throws(() => normalizeFingerprint(bad), SshInputError);
    }
  });
});
