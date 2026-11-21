import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ServerFactsSchema } from '@swellwright/contracts';

import { parseFacts, unreadableFacts } from './parse-facts.js';
import { loadFactsScript } from './script.js';
import {
  ALPINE_BOX,
  DEBIAN_12_NODE,
  MINIMAL_CONTAINER,
  UBUNTU_2204_NODE,
  UBUNTU_2404_AS_ROOT,
  UBUNTU_2404_AS_USER,
} from './samples.js';

const EPOCH_MS = 1_795_285_607_000;
const context = { receivedAtMs: EPOCH_MS, viaSudo: false, truncated: false };

/** Replaces one section of a sample, or removes it when `body` is null. */
function withSection(text: string, name: string, body: string | null): string {
  const pattern = new RegExp(`@@swf begin ${name}\\n[\\s\\S]*?@@swf end ${name}\\n`, 'u');
  assert.ok(pattern.test(text), `the sample has a ${name} section`);
  return text.replace(
    pattern,
    body === null ? '' : `@@swf begin ${name}\n${body}\n@@swf end ${name}\n`,
  );
}

describe('the facts script', () => {
  it('is read from its file and hashed', () => {
    const script = loadFactsScript();
    assert.match(script.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(script.text.startsWith('#!/bin/sh\n# swellwright-facts: schema 1'));
    assert.ok(!script.text.includes('\r'));
    assert.equal(loadFactsScript(), script, 'read once');
  });

  it('promises no writes: it has no redirection to a file, no tee, no package manager action', () => {
    const { text } = loadFactsScript();
    const code = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    // The only redirections allowed are to /dev/null (and 2>&1 on one command).
    assert.ok(
      !/>>?\s*[^&\s/]/u.test(code.replaceAll('>/dev/null', '').replaceAll('2>&1', '')),
      'no > file',
    );
    for (const forbidden of [
      /\btee\b/u,
      /\brm\b/u,
      /\bmv\b/u,
      /\bcp\b/u,
      /\bmkdir\b/u,
      /\btouch\b/u,
      /\bchmod\b/u,
      /\bapt-get\s+(?!-s\b)(install|upgrade|update|remove)/u,
      /\bcurl\b/u,
      /\bwget\b/u,
      /\bnc\b/u,
      /\bsystemctl\s+(start|stop|restart|enable|disable|reload|daemon-reload)\b/u,
      /\beval\b/u,
    ]) {
      assert.ok(!forbidden.test(code), String(forbidden));
    }
    // apt only simulates, and writes no cache.
    assert.match(code, /apt-get -s /u);
    assert.match(code, /Dir::Cache::pkgcache=/u);
  });
});

describe('facts captured on Ubuntu 24.04 as root', () => {
  const { facts, recognised } = parseFacts(UBUNTU_2404_AS_ROOT, { ...context, viaSudo: true });

  it('reads every section', () => {
    assert.equal(recognised, true);
    assert.equal(facts.schemaVersion, 1);
    assert.equal(facts.collectedAs, 'sudo');
    assert.deepEqual(facts.os, {
      id: 'ubuntu',
      versionId: '24.04',
      prettyName: 'Ubuntu 24.04.5 LTS',
    });
    assert.deepEqual(facts.kernel, { name: 'Linux', release: '6.8.0-36-generic', arch: 'x86_64' });
    assert.equal(facts.hostname, 'node-1.example.com');
    assert.equal(facts.uptimeSeconds, 336137);
    assert.equal(facts.bootedAt, new Date((1_795_285_607 - 336_137) * 1000).toISOString());
    assert.equal(facts.cpuCount, 1);
    assert.deepEqual(facts.loadAverage, [0.09, 0.04, 0.01]);
    assert.deepEqual(facts.memory, {
      totalBytes: 2_015_392 * 1024,
      availableBytes: 1_522_372 * 1024,
      swapTotalBytes: 524_284 * 1024,
      swapFreeBytes: 523_504 * 1024,
    });
    assert.deepEqual(facts.warnings, []);
  });

  it('keeps `/` and real block devices, not tmpfs', () => {
    assert.deepEqual(facts.disks, [
      {
        mount: '/',
        device: '/dev/vda1',
        totalBytes: 15_394_840 * 1024,
        usedBytes: 4_859_820 * 1024,
        availableBytes: 9_732_496 * 1024,
      },
    ]);
  });

  it('reads the clock, the failed units and the pending reboot', () => {
    assert.deepEqual(facts.time, {
      utc: new Date(1_795_285_607_000).toISOString(),
      skewSeconds: 0,
      timezone: 'Etc/UTC',
      ntpSynchronized: false,
    });
    assert.deepEqual(facts.systemd, {
      state: 'degraded',
      failedUnits: [
        'fwupd-refresh.service',
        'fwupd.service',
        'ifup-eth0.service',
        'networking.service',
      ],
    });
    assert.equal(facts.rebootRequired, true);
  });

  it('lists the listening ports with the processes that own them', () => {
    assert.deepEqual(facts.listeningPorts, [
      { address: '0.0.0.0', port: 22, process: 'sshd, systemd' },
      { address: '::', port: 22, process: 'sshd, systemd' },
      { address: '0.0.0.0', port: 80, process: 'nginx' },
      { address: '127.0.0.1', port: 8444, process: 'nginx' },
    ]);
  });

  it('reads the services, the versions, the containers, ufw, sshd and the updates', () => {
    assert.deepEqual(facts.services, [
      { name: 'ssh', state: 'active' },
      { name: 'docker', state: 'active' },
      { name: 'haproxy', state: 'not_installed' },
      { name: 'nginx', state: 'active' },
      { name: 'fail2ban', state: 'active' },
      { name: 'ufw', state: 'active' },
    ]);
    assert.deepEqual(facts.versions, {
      docker: '29.10.0',
      haproxy: null,
      nginx: '1.30.6',
      fail2ban: '1.0.2',
    });
    assert.deepEqual(facts.containers, [], 'docker answered and there is none');
    assert.deepEqual(facts.firewall, { ufw: 'active' });
    assert.deepEqual(facts.sshd, {
      port: 22,
      passwordAuthentication: true,
      permitRootLogin: 'yes',
    });
    assert.deepEqual(facts.updates, { manager: 'apt', upgradable: 18 });
  });

  it('matches the contract', () => {
    assert.deepEqual(ServerFactsSchema.parse(facts), facts);
  });
});

describe('facts captured on Ubuntu 24.04 as a plain user', () => {
  const { facts } = parseFacts(UBUNTU_2404_AS_USER, context);

  it('says what only root can see is unknown, not empty', () => {
    assert.equal(facts.collectedAs, 'user');
    assert.equal(facts.containers, null);
    assert.deepEqual(facts.firewall, { ufw: null });
    assert.equal(facts.sshd, null);
    assert.ok(facts.listeningPorts !== null);
    assert.ok(
      facts.listeningPorts.every((port) => port.process === null),
      'the owners of the sockets are hidden',
    );
    assert.deepEqual(facts.warnings, [], 'being unable to look is not a malformed output');
  });

  it('still has the rest', () => {
    assert.equal(facts.os?.id, 'ubuntu');
    assert.equal(facts.updates?.manager, 'apt');
    assert.equal(facts.versions?.docker, '29.10.0');
  });
});

describe('facts of other systems', () => {
  it('a Debian 12 node: haproxy, containers with tags, a failed unit', () => {
    const { facts } = parseFacts(DEBIAN_12_NODE, { ...context, viaSudo: false });
    assert.equal(facts.collectedAs, 'root');
    assert.equal(facts.os?.prettyName, 'Debian GNU/Linux 12 (bookworm)');
    assert.equal(facts.kernel?.release, '6.1.0-28-amd64');
    assert.equal(facts.versions?.haproxy, '2.6.12-1+deb12u1');
    assert.equal(facts.versions.docker, '27.3.1');
    assert.equal(facts.versions.nginx, '1.22.1');
    assert.equal(facts.services?.find((service) => service.name === 'fail2ban')?.state, 'failed');
    assert.equal(facts.services.find((service) => service.name === 'haproxy')?.state, 'active');
    assert.equal(facts.time?.ntpSynchronized, true);
    assert.deepEqual(facts.containers, [
      {
        name: 'remnanode',
        image: 'remnawave/node:3.4.6',
        imageName: 'remnawave/node',
        imageTag: '3.4.6',
        state: 'running',
        status: 'Up 3 days',
      },
      {
        name: 'edge-proxy',
        image: `registry.example.com:5000/team/proxy:1.2.3@sha256:${'0123456789abcdef'.repeat(4)}`,
        imageName: 'registry.example.com:5000/team/proxy',
        imageTag: '1.2.3',
        state: 'running',
        status: 'Up 2 hours (healthy)',
      },
      {
        name: 'old-job',
        image: 'alpine',
        imageName: 'alpine',
        imageTag: null,
        state: 'exited',
        status: 'Exited (0) 5 weeks ago',
      },
      {
        name: 'untagged',
        image: 'sha256:0123456789ab',
        imageName: 'sha256',
        imageTag: '0123456789ab',
        state: 'created',
        status: 'Created',
      },
    ]);
    assert.ok(
      facts.listeningPorts?.some((port) => port.port === 53 && port.address === '127.0.0.53%lo'),
      'an interface suffix stays in the address',
    );
  });

  it('an Ubuntu 22.04 node: reboot pending, another time zone', () => {
    const { facts } = parseFacts(UBUNTU_2204_NODE, { ...context, viaSudo: true });
    assert.equal(facts.os?.versionId, '22.04');
    assert.equal(facts.rebootRequired, true);
    assert.equal(facts.time?.timezone, 'Europe/Berlin');
    assert.equal(facts.time.ntpSynchronized, false);
    assert.equal(facts.versions?.nginx, '1.18.0');
    assert.equal(facts.versions.haproxy, null);
  });

  it('a minimal container: every missing tool is null, never an error', () => {
    const { facts, recognised } = parseFacts(MINIMAL_CONTAINER, context);
    assert.equal(recognised, true);
    assert.equal(facts.systemd, null);
    assert.equal(facts.listeningPorts, null);
    assert.equal(facts.services, null);
    assert.deepEqual(facts.versions, { docker: null, haproxy: null, nginx: null, fail2ban: null });
    assert.equal(facts.containers, null);
    assert.deepEqual(facts.firewall, { ufw: null });
    assert.equal(facts.sshd, null);
    assert.deepEqual(facts.updates, { manager: 'apt', upgradable: 0 });
    assert.equal(facts.time?.timezone, null);
    assert.equal(facts.time.ntpSynchronized, null);
    assert.deepEqual(
      facts.disks?.map((disk) => disk.mount),
      ['/', '/etc/hosts'],
      '`/` of an overlay and a real device, not the tmpfs',
    );
    assert.deepEqual(facts.warnings, []);
  });

  it('a BusyBox box: sections that are not there at all are null too', () => {
    const { facts, recognised } = parseFacts(ALPINE_BOX, context);
    assert.equal(recognised, true);
    assert.equal(facts.os?.id, 'alpine');
    assert.equal(facts.os.versionId, '3.20.3');
    assert.equal(facts.kernel?.arch, 'aarch64');
    assert.equal(facts.loadAverage, null);
    assert.equal(facts.rebootRequired, null);
    assert.equal(facts.updates, null);
    assert.equal(facts.memory?.swapTotalBytes, null);
    assert.equal(facts.memory.totalBytes, 494_956 * 1024);
    assert.equal(facts.disks?.length, 2);
    assert.equal(facts.firewall, null);
    assert.equal(facts.collectedAs, 'root');
  });
});

describe('malformed output', () => {
  it('says so and keeps the rest when one number is not a number', () => {
    const text = withSection(UBUNTU_2404_AS_ROOT, 'cpu', 'cpus=many');
    const { facts } = parseFacts(text, context);
    assert.equal(facts.cpuCount, null);
    assert.ok(facts.warnings.includes('The number of processors could not be read.'));
    assert.equal(facts.os?.id, 'ubuntu', 'the rest is intact');
    assert.equal(facts.memory?.totalBytes, 2_015_392 * 1024);
  });

  it('refuses a negative, an enormous or a fractional count', () => {
    for (const body of ['cpus=-1', 'cpus=99999999999999999999', 'cpus=1.5', 'cpus=', 'cpus=0']) {
      const { facts } = parseFacts(withSection(UBUNTU_2404_AS_ROOT, 'cpu', body), context);
      assert.equal(facts.cpuCount, null, body);
    }
  });

  it('handles lines of the disk table and the sockets that make no sense', () => {
    const disks = withSection(
      UBUNTU_2404_AS_ROOT,
      'disks',
      'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 abc def ghi 3% /\n/dev/vdb1 10 5 5 50% /data\nthis is not a table',
    );
    const { facts } = parseFacts(disks, context);
    assert.deepEqual(
      facts.disks?.map((disk) => disk.mount),
      ['/data'],
    );
    assert.ok(facts.warnings.some((warning) => warning.includes('2 line(s) of the disk table')));

    const ports = withSection(
      UBUNTU_2404_AS_ROOT,
      'ports',
      'LISTEN 0 4096 0.0.0.0:22 0.0.0.0:*\nLISTEN 0 4096 nonsense\nESTAB 0 0 192.0.2.4:5 198.51.100.9:10\nLISTEN 0 4096 0.0.0.0:99999 0.0.0.0:*',
    );
    const parsed = parseFacts(ports, context).facts;
    assert.deepEqual(parsed.listeningPorts, [{ address: '0.0.0.0', port: 22, process: null }]);
    assert.ok(
      parsed.warnings.some((warning) => warning.includes('3 line(s) of the listening sockets')),
    );
  });

  it('reads nothing from an operating system file without the keys', () => {
    const { facts } = parseFacts(
      withSection(UBUNTU_2404_AS_ROOT, 'os', 'garbage\nmore garbage'),
      context,
    );
    assert.equal(facts.os, null);
    assert.ok(facts.warnings.includes('The operating system release file could not be read.'));
  });

  it('does not take a version it cannot read, and says so', () => {
    const text = withSection(
      UBUNTU_2404_AS_ROOT,
      'versions',
      'docker=command not found\nnginx=nginx version: nginx/1.30.6\nhaproxy=',
    );
    const { facts } = parseFacts(text, context);
    assert.deepEqual(facts.versions, {
      docker: null,
      haproxy: null,
      nginx: '1.30.6',
      fail2ban: null,
    });
    assert.ok(facts.warnings.includes('The docker version could not be read.'));
    assert.ok(facts.warnings.includes('The haproxy version could not be read.'));
  });

  it('refuses a firewall line that is not a status', () => {
    const { facts } = parseFacts(withSection(UBUNTU_2404_AS_ROOT, 'ufw', 'Status: maybe'), context);
    assert.deepEqual(facts.firewall, { ufw: null });
    assert.ok(facts.warnings.includes('The firewall status could not be read.'));
  });

  it('skips container lines that are not containers', () => {
    const text = withSection(
      UBUNTU_2404_AS_ROOT,
      'containers',
      'web|nginx:1.27|running|Up 1 hour\n|no name|running|Up\nbad name|img|running|Up\nweb2|nginx|RUNNING|Up\nonlytwo|fields',
    );
    const { facts } = parseFacts(text, context);
    assert.deepEqual(
      facts.containers?.map((container) => container.name),
      ['web'],
    );
    assert.ok(
      facts.warnings.some((warning) => warning.includes('4 line(s) of the container list')),
    );
  });

  it('survives a truncated output and keeps what came before the cut', () => {
    const cut = UBUNTU_2404_AS_ROOT.slice(0, UBUNTU_2404_AS_ROOT.indexOf('@@swf begin ports') + 40);
    const { facts, recognised } = parseFacts(cut, { ...context, truncated: true });
    assert.equal(recognised, true);
    assert.equal(facts.os?.id, 'ubuntu');
    assert.equal(facts.listeningPorts, null);
    assert.equal(facts.updates, null);
    assert.ok(facts.warnings.includes('The output was longer than the limit and was cut off.'));
    assert.ok(facts.warnings.some((warning) => warning.startsWith('The output ended inside')));
    assert.ok(facts.warnings.some((warning) => warning.startsWith('The output ended before')));
  });

  it('recognises nothing in output that is not from the script, and does not throw', () => {
    for (const text of [
      '',
      'Welcome to Ubuntu\nLast login: today\n',
      '@@swf script 2\n@@swf begin os\nID=x\n@@swf end os\n@@swf done\n',
      '@@swf script 1\n',
      '\u0000\u0001\u0002',
      'x'.repeat(100_000),
    ]) {
      const result = parseFacts(text, context);
      assert.equal(result.recognised, false, JSON.stringify(text.slice(0, 30)));
      assert.equal(result.facts.os, null);
      assert.ok(result.facts.warnings.length >= 1);
      assert.ok(ServerFactsSchema.safeParse(result.facts).success);
    }
  });

  it('uses the first of two sections with the same name', () => {
    const doubled = `${UBUNTU_2404_AS_ROOT.replace('@@swf done\n', '')}@@swf begin cpu\ncpus=64\n@@swf end cpu\n@@swf done\n`;
    const { facts } = parseFacts(doubled, context);
    assert.equal(facts.cpuCount, 1);
    assert.ok(facts.warnings.includes('The section "cpu" came twice; the first one is used.'));
  });

  it('is not misled by a server that prints a marker inside a value', () => {
    const text = withSection(
      UBUNTU_2404_AS_ROOT,
      'containers',
      'sneaky|nginx:1|running|Up\n@@swf end containers\n@@swf begin cpu\ncpus=9999\n@@swf end cpu',
    );
    const { facts } = parseFacts(text, context);
    // The forged end closes the section early and the forged section counts as a second one: the first stays.
    assert.equal(facts.cpuCount, 1);
    assert.deepEqual(
      facts.containers?.map((container) => container.name),
      ['sneaky'],
    );
  });

  it('cuts what is too long and removes control characters', () => {
    const text = withSection(
      UBUNTU_2404_AS_ROOT,
      'kernel',
      `name=Linux\nrelease=${'9'.repeat(500)}\narch=x86\u0007_64\nhostname=${'h'.repeat(900)}`,
    );
    const { facts } = parseFacts(text, context);
    assert.equal(facts.kernel?.release?.length, 128);
    assert.equal(facts.kernel.arch, 'x86 _64');
    assert.equal(facts.hostname?.length, 255);
    assert.ok(ServerFactsSchema.safeParse(facts).success);
  });

  it('caps the lists', () => {
    const many = Array.from(
      { length: 400 },
      (_, index) => `c${String(index)}|nginx:1|running|Up`,
    ).join('\n');
    const { facts } = parseFacts(withSection(UBUNTU_2404_AS_ROOT, 'containers', many), context);
    // A section is cut at 600 lines and a list at 200 entries.
    assert.equal(facts.containers?.length, 200);
    const warnings = parseFacts(
      withSection(
        UBUNTU_2404_AS_ROOT,
        'systemd',
        `state=running\n${Array.from({ length: 60 }, (_, i) => `failed: u${String(i)}.service loaded failed failed x`).join('\n')}`,
      ),
      context,
    ).facts;
    assert.equal(warnings.systemd?.failedUnits.length, 20);
  });
});

describe('the clock', () => {
  it('measures the skew against when the output arrived', () => {
    const ahead = parseFacts(UBUNTU_2404_AS_ROOT, { ...context, receivedAtMs: EPOCH_MS - 90_000 });
    assert.equal(ahead.facts.time?.skewSeconds, 90);
    const behind = parseFacts(UBUNTU_2404_AS_ROOT, { ...context, receivedAtMs: EPOCH_MS + 3000 });
    assert.equal(behind.facts.time?.skewSeconds, -3);
  });

  it('leaves the boot time out when the uptime is longer than the clock says', () => {
    const text = withSection(UBUNTU_2404_AS_ROOT, 'uptime', '99999999999.00 1.00');
    const { facts } = parseFacts(text, context);
    assert.equal(facts.uptimeSeconds, 99_999_999_999);
    assert.equal(facts.bootedAt, null);
  });
});

describe('unreadable facts', () => {
  it('is a valid, empty record with one warning', () => {
    const facts = unreadableFacts('The stored facts are of a version this server does not know.');
    assert.ok(ServerFactsSchema.safeParse(facts).success);
    assert.equal(facts.warnings.length, 1);
    assert.equal(facts.os, null);
  });
});
