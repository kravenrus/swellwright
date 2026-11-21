import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { checkParameterValues, ScriptParametersSchema } from '@swellwright/contracts';

import { BUILTIN_MANIFEST, loadBuiltinScripts } from './builtin-scripts.js';

/** The text of a script without its comments: what can run. */
function codeOf(body: string): string {
  return body
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

/**
 * A command in command position: at the start of a line, after `;`, `&`, `|`, `(`, `$(`, or after `then`, `do`, `else`.
 * A word inside an echoed message ("reboot required") is not a command.
 */
const at = (words: string, rest = ''): RegExp =>
  new RegExp(String.raw`(?:^|[;&|(]|\$\(|\b(?:then|do|else)\s)\s*(?:${words})\b${rest}`, 'mu');

/** What a read-only script must never contain, and why. */
const FORBIDDEN: readonly [RegExp, string][] = [
  [
    at(
      'rm|mv|cp|mkdir|rmdir|touch|chmod|chown|chgrp|ln|tee|dd|truncate|mkfifo|mknod|shred|install',
    ),
    'a command that writes',
  ],
  [/\b(sed|perl)\s+(-[a-z]*i|--in-place)/u, 'an in-place edit'],
  [
    at('curl|wget|nc|ncat|socat|telnet|ssh|scp|sftp|ftp|rsync|ping|dig|nslookup|traceroute|mtr'),
    'a network tool',
  ],
  [at('apt-get', String.raw`\s+(?!-s\b)`), 'apt-get other than the simulation'],
  [
    at(
      'apt|aptitude|dpkg|yum|dnf|zypper|apk|pip|pip3|npm|snap',
      String.raw`\s+(install|remove|purge|upgrade|update|autoremove|dist-upgrade|-i\b|-r\b)`,
    ),
    'a package change',
  ],
  [
    /\bsystemctl\s+(start|stop|restart|reload|try-restart|enable|disable|mask|unmask|kill|reset-failed|daemon-reload|edit|set-|isolate|reboot|poweroff|halt)/u,
    'a service change',
  ],
  [at('service', String.raw`\s+\S+\s+(start|stop|restart|reload)`), 'a service change'],
  [
    at('kill|pkill|killall|reboot|shutdown|poweroff|halt|init|telinit'),
    'a process or power command',
  ],
  [
    /\bdocker\s+(run|exec|rm|stop|start|restart|kill|pull|push|build|create|prune|rmi|network|volume|compose|cp|commit|tag|login|logout|update|pause|unpause)\b/u,
    'a docker change',
  ],
  [
    /\bufw\s+(enable|disable|allow|deny|reject|limit|delete|reset|reload|insert|route|default|logging)\b/u,
    'a firewall change',
  ],
  [/\b(iptables|ip6tables)\b.*\s-[AIDFXPNRZ]\b/u, 'an iptables change'],
  [/\bnft\s+(add|delete|flush|insert|replace|create|destroy|-f)\b/u, 'an nftables change'],
  [
    /\bfail2ban-client\s+(set|start|stop|reload|unban|ban|add|restart|flushlogs)\b/u,
    'a fail2ban change',
  ],
  [
    /\b(timedatectl\s+set-|date\s+(-s|--set)|hostnamectl\s+set-|sysctl\s+-w|localectl\s+set-)/u,
    'a system setting',
  ],
  [
    at('mount|umount|swapon|swapoff|modprobe|insmod|rmmod|losetup|fdisk|parted|mkfs|fsck'),
    'a device command',
  ],
  [at('eval|exec'), 'eval or exec'],
  [/(^|[\s;&|(])(source|\.)\s+[/~$.]/mu, 'sourcing a file'],
  [/\b(sh|bash|dash|zsh)\s+-c\b/u, 'a nested shell'],
  [at('sudo'), 'sudo inside the script (the runner decides who runs it)'],
  [
    at('crontab|at|batch|useradd|userdel|usermod|groupadd|passwd|chpasswd|visudo'),
    'an account or schedule change',
  ],
];

describe('the built-in scripts', () => {
  const scripts = loadBuiltinScripts();

  it('are the thirteen of the manifest, each with its file, header and a stored hash', () => {
    assert.equal(scripts.length, 13);
    assert.deepEqual(
      scripts.map((script) => script.name),
      BUILTIN_MANIFEST.map((entry) => entry.name),
    );
    for (const script of scripts) {
      assert.match(script.bodySha256, /^[0-9a-f]{64}$/u, script.name);
      assert.ok(script.body.startsWith('#!/bin/sh\n'), `${script.name} starts with the shebang`);
      assert.ok(!script.body.includes('\r'), `${script.name} has LF line endings`);
      assert.ok(
        script.body.includes(`# swellwright-script: ${script.name} v${String(script.version)}`),
      );
    }
    assert.equal(new Set(scripts.map((script) => script.name)).size, 13, 'names are unique');
  });

  it('are named like the contract wants, and describe themselves in a sentence or two', () => {
    for (const script of scripts) {
      assert.match(script.name, /^[A-Za-z0-9 _.-]{1,64}$/u);
      assert.ok(script.description.length > 20 && script.description.length <= 500, script.name);
    }
  });

  it('have parameter definitions that are valid and whose defaults pass their own check', () => {
    for (const script of scripts) {
      assert.ok(ScriptParametersSchema.safeParse(script.parameters).success, script.name);
      const checked = checkParameterValues(script.parameters, {});
      assert.ok(checked.ok, `${script.name}: ${JSON.stringify(checked)}`);
    }
  });

  it('promise in their header what a read-only script promises', () => {
    for (const script of scripts) {
      const header = script.body
        .split('\n')
        .filter((line) => line.startsWith('#'))
        .join('\n');
      for (const promise of ['read-only', 'no network access', 'bounded', 'POSIX sh']) {
        assert.ok(header.includes(promise), `${script.name} promises "${promise}"`);
      }
    }
  });

  it('contain nothing that writes, changes, installs or reaches the network', () => {
    for (const script of scripts) {
      const code = codeOf(script.body);
      for (const [pattern, why] of FORBIDDEN) {
        assert.ok(
          !pattern.test(code),
          `${script.name} must not contain ${why}: ${String(pattern)}`,
        );
      }
      // The only redirections are to /dev/null, and of one stream into the other.
      const rest = code
        .replaceAll('>/dev/null', '')
        .replaceAll('2>&1', '')
        .replaceAll('>&2', '')
        .replaceAll('>&-', '');
      assert.ok(
        !rest
          .replaceAll(/'[^'\n]*'/gu, "''")
          .replaceAll(/"[^"\n]*"/gu, '""')
          .includes('>'),
        `${script.name} writes to a file`,
      );
    }
  });

  it('use exactly the environment variables they declare as parameters', () => {
    for (const script of scripts) {
      const code = codeOf(script.body);
      const declared = new Set(script.parameters.map((p) => `SW_PARAM_${p.name.toUpperCase()}`));
      const used = new Set(code.match(/SW_PARAM_[A-Z0-9_]+/gu) ?? []);
      assert.deepEqual(
        [...used].sort(),
        [...declared].sort(),
        `${script.name} uses what it declares`,
      );
    }
  });

  it('declare sudo for every script that needs root to see what it is for', () => {
    const needRoot = [
      'listening-ports',
      'docker-containers',
      'firewall-status',
      'fail2ban-status',
      'sshd-effective-config',
      'recent-errors',
    ];
    for (const script of scripts) {
      assert.equal(script.sudo, needRoot.includes(script.name), script.name);
    }
  });
});

const isLinux = process.platform === 'linux';

/**
 * Where the machine allows it (Linux: the scripts use its tools) every script runs in a real `sh`, as an ordinary user
 * of the test machine, and must leave no trace in the home and temporary directories it was given, finish within a
 * minute, and answer either with output and status 0, or with status 3 and a message when its tool is not there.
 */
describe('the built-in scripts in a real shell', { skip: !isLinux }, () => {
  const scripts = loadBuiltinScripts();

  it('run, change nothing in the directories they could write to, and keep their output small', () => {
    const home = mkdtempSync(join(tmpdir(), 'sw-builtin-home-'));
    const temp = mkdtempSync(join(tmpdir(), 'sw-builtin-tmp-'));
    try {
      for (const script of scripts) {
        const before = [readdirSync(home), readdirSync(temp)];
        const result = spawnSync('/bin/sh', ['-c', script.body], {
          env: {
            PATH: process.env['PATH'] ?? '/usr/bin:/bin',
            HOME: home,
            TMPDIR: temp,
            LANG: 'C',
          },
          encoding: 'utf8',
          timeout: 60_000,
          maxBuffer: 4 * 1024 * 1024,
          input: '',
        });
        assert.ok(
          result.status === 0 || result.status === 3,
          `${script.name} exited with ${String(result.status)}: ${result.stderr}`,
        );
        if (result.status === 3) {
          assert.ok(result.stderr.length > 0, `${script.name} says why it cannot run`);
        } else {
          assert.ok(
            result.stdout.includes('==') || result.stdout.length > 0,
            `${script.name} prints something`,
          );
        }
        assert.ok(result.stdout.length < 256 * 1024, `${script.name} keeps its output bounded`);
        assert.deepEqual(
          [readdirSync(home), readdirSync(temp)],
          before,
          `${script.name} leaves no file behind`,
        );
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('refuse a parameter that is not what they expect instead of using it', () => {
    const byName = new Map(scripts.map((script) => [script.name, script]));
    const run = (name: string, env: Record<string, string>) =>
      spawnSync('/bin/sh', ['-c', byName.get(name)?.body ?? ''], {
        env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', LANG: 'C', ...env },
        encoding: 'utf8',
        timeout: 60_000,
        input: '',
      });
    assert.equal(run('disk-usage', { SW_PARAM_PATH: 'relative/path' }).status, 2);
    assert.equal(run('listening-ports', { SW_PARAM_PROTOCOL: 'tcp; touch /tmp/pwn' }).status, 2);
    // Numbers that are not numbers fall back to the default instead of reaching a command.
    const errors = run('recent-errors', {
      SW_PARAM_MINUTES: '5; touch /tmp/sw-pwn',
      SW_PARAM_LINES: '$(id)',
    });
    assert.ok(errors.status === 0 || errors.status === 3);
    assert.ok(!errors.stdout.includes('uid='));
  });
});
