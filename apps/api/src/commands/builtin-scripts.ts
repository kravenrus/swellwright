import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { ScriptParameter } from '@swellwright/contracts';

/**
 * The scripts that ship with Swellwright (ADR 0038): read-only diagnostics, one POSIX `sh` file each in `builtin/`
 * with a header that names the script and its version. This manifest says what the library shows about each
 * (description, whether it needs root, which parameters it takes); the file is the text that runs. A test fails the
 * build when a file lacks its header, promises less than it should, or does something a read-only script must not.
 *
 * Raise `version` when the text of a file changes: the library updates a built-in script by name at start, and the
 * runs that happened before keep the text they ran.
 */
interface BuiltinManifestEntry {
  readonly name: string;
  readonly version: number;
  readonly description: string;
  /** Needs root to see everything it shows (it runs through the stored sudo secret when the login is not root). */
  readonly sudo: boolean;
  readonly parameters: readonly ScriptParameter[];
}

export const BUILTIN_MANIFEST: readonly BuiltinManifestEntry[] = [
  {
    name: 'system-summary',
    version: 1,
    description:
      'One screen about the machine: host name, system, kernel, uptime, load, processors, memory, the root disk, systemd state and whether a reboot is pending.',
    sudo: false,
    parameters: [],
  },
  {
    name: 'disk-usage',
    version: 1,
    description:
      'Filesystems (space and inodes) and the biggest directories one level below a path, on one filesystem and with a 25 second deadline.',
    sudo: false,
    parameters: [
      {
        name: 'path',
        label: 'Path',
        description: 'The directory to measure, absolute. Plain path characters only.',
        type: 'string',
        required: false,
        pattern: '/|(?:/[A-Za-z0-9._-]+){1,8}',
        maxLength: 200,
        default: '/var',
      },
    ],
  },
  {
    name: 'memory-and-load',
    version: 1,
    description:
      'Memory and swap, the load averages, two seconds of vmstat and the pressure counters of the kernel.',
    sudo: false,
    parameters: [],
  },
  {
    name: 'listening-ports',
    version: 1,
    description:
      'What listens on the network and which process owns each socket (the owners are visible to root only).',
    sudo: true,
    parameters: [
      {
        name: 'protocol',
        label: 'Protocol',
        type: 'enum',
        required: false,
        options: ['tcp', 'udp', 'all'],
        default: 'tcp',
      },
    ],
  },
  {
    name: 'failed-systemd-units',
    version: 1,
    description:
      'The units systemd lists as failed, the state of the system and the last status lines of the first few failed units.',
    sudo: false,
    parameters: [],
  },
  {
    name: 'docker-containers',
    version: 1,
    description: 'Containers, images and the disk Docker uses.',
    sudo: true,
    parameters: [
      {
        name: 'all',
        label: 'Include stopped containers',
        type: 'boolean',
        required: false,
        default: true,
      },
    ],
  },
  {
    name: 'firewall-status',
    version: 1,
    description:
      'The firewall as it is now: ufw (verbose) and the rules of iptables, ip6tables and nftables.',
    sudo: true,
    parameters: [],
  },
  {
    name: 'fail2ban-status',
    version: 1,
    description: 'Whether fail2ban runs, its jails, and for each jail the addresses banned now.',
    sudo: true,
    parameters: [],
  },
  {
    name: 'sshd-effective-config',
    version: 1,
    description:
      'The settings sshd really uses (`sshd -T`), the ones that decide who can log in and how, and the drop-in files.',
    sudo: true,
    parameters: [],
  },
  {
    name: 'pending-reboot-and-updates',
    version: 1,
    description:
      'Whether a reboot is pending and why, the running and installed kernels, and the packages an upgrade would change (simulated, from the lists already on disk).',
    sudo: false,
    parameters: [],
  },
  {
    name: 'time-sync',
    version: 1,
    description:
      'The clock, the time zone, whether the system says it is synchronised and what the time service knows.',
    sudo: false,
    parameters: [],
  },
  {
    name: 'recent-errors',
    version: 1,
    description:
      'Errors of the systemd journal in the last minutes, newest last and capped, and the errors of the kernel ring buffer.',
    sudo: true,
    parameters: [
      {
        name: 'minutes',
        label: 'Minutes back',
        type: 'integer',
        required: false,
        min: 1,
        max: 1440,
        default: 60,
      },
      {
        name: 'lines',
        label: 'Most lines',
        type: 'integer',
        required: false,
        min: 1,
        max: 500,
        default: 200,
      },
    ],
  },
  {
    name: 'top-processes',
    version: 1,
    description: 'The processes that use the most processor time and the most memory right now.',
    sudo: false,
    parameters: [
      {
        name: 'count',
        label: 'How many of each',
        type: 'integer',
        required: false,
        min: 1,
        max: 50,
        default: 15,
      },
    ],
  },
];

export interface BuiltinScript {
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly sudo: boolean;
  readonly parameters: readonly ScriptParameter[];
  /** The file, with LF line endings. */
  readonly body: string;
  /** SHA-256 of `body`, in lower-case hex. */
  readonly bodySha256: string;
}

const HEADER = /^# swellwright-script: ([a-z0-9-]+) v(\d+)$/mu;

let loaded: readonly BuiltinScript[] | undefined;

/**
 * Reads the files (they sit in `builtin/` next to this file, in `src` and, copied by the build, in `dist`). Line
 * endings are made LF first, so a checkout with Windows line endings runs and hashes the same text. A file that is
 * missing, or whose header does not name the script and the version the manifest says, is an error at start.
 */
export function loadBuiltinScripts(): readonly BuiltinScript[] {
  if (loaded) {
    return loaded;
  }
  loaded = BUILTIN_MANIFEST.map((entry) => {
    const body = readFileSync(
      new URL(`./builtin/${entry.name}.sh`, import.meta.url),
      'utf8',
    ).replaceAll('\r\n', '\n');
    const header = HEADER.exec(body);
    if (header?.[1] !== entry.name || Number(header[2]) !== entry.version) {
      throw new Error(
        `The built-in script file ${entry.name}.sh must say "# swellwright-script: ${entry.name} v${String(entry.version)}" in its header.`,
      );
    }
    return {
      ...entry,
      body,
      bodySha256: createHash('sha256').update(body, 'utf8').digest('hex'),
    };
  });
  return loaded;
}
