import {
  SERVER_FACTS_SCHEMA_VERSION,
  type ServerFacts,
  ServerFactsSchema,
} from '@swellwright/contracts';

/**
 * What the facts script printed, turned into typed facts (ADR 0037). The parser is strict about types and lenient
 * about everything else: text it does not know is ignored, a section that is missing or malformed makes that field
 * null (with a warning when the section was there but unreadable), and nothing here throws, so one bad section never
 * loses the rest.
 */

export interface ParseContext {
  /** When the output was complete, in epoch milliseconds: the clock skew is measured against it. */
  readonly receivedAtMs: number;
  /** The script ran through `sudo` (the login is not root). Only used to tell `sudo` from `root`. */
  readonly viaSudo: boolean;
  /** The output was longer than the cap and was cut. */
  readonly truncated: boolean;
}

export interface ParsedFacts {
  readonly facts: ServerFacts;
  /** The output had the header and the footer of this script version: its sections can be trusted to be whole. */
  readonly recognised: boolean;
}

const MAX_WARNINGS = 50;
const MAX_LINES_PER_SECTION = 600;
const MAX_LINE = 1000;

const SECTION_NAMES = new Set([
  'user',
  'os',
  'kernel',
  'uptime',
  'loadavg',
  'cpu',
  'memory',
  'disks',
  'time',
  'systemd',
  'reboot',
  'ports',
  'services',
  'versions',
  'containers',
  'ufw',
  'sshd',
  'updates',
]);

/** Control characters out, whitespace trimmed, cut to length; null when nothing is left. */
function clean(value: string | undefined, max: number): string | null {
  if (value === undefined) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim();
  return text === '' ? null : text.slice(0, max);
}

function integer(value: string | undefined, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (value === undefined || !/^[0-9]{1,16}$/u.test(value.trim())) {
    return null;
  }
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

/** `KEY=value` and `KEY="value"` lines: the first occurrence of a key wins. */
function keyValues(lines: readonly string[], separator = '='): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of lines) {
    const at = line.indexOf(separator);
    if (at < 1) {
      continue;
    }
    const key = line.slice(0, at).trim();
    if (!/^[A-Za-z0-9_.-]{1,64}$/u.test(key) || out.has(key)) {
      continue;
    }
    let value = line.slice(at + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value.replace(/\\(["\\$`])/gu, '$1');
      }
    }
    out.set(key, value);
  }
  return out;
}

interface Sections {
  readonly scriptVersion: number | null;
  readonly finished: boolean;
  readonly sections: ReadonlyMap<string, readonly string[]>;
}

function splitSections(output: string, warn: (text: string) => void): Sections {
  const sections = new Map<string, string[]>();
  let scriptVersion: number | null = null;
  let finished = false;
  let open: { name: string; lines: string[]; known: boolean } | null = null;
  for (const raw of output.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('@@swf ')) {
      const parts = line.slice(6).trim().split(/\s+/u);
      const [word, name] = parts;
      if (word === 'script') {
        scriptVersion ??= integer(name);
        continue;
      }
      if (word === 'done') {
        finished = true;
        continue;
      }
      if (word === 'begin' && name !== undefined) {
        if (open?.known) {
          warn(`The section "${open.name}" was not closed.`);
        }
        const known = SECTION_NAMES.has(name);
        if (known && sections.has(name)) {
          warn(`The section "${name}" came twice; the first one is used.`);
        }
        open = { name, lines: [], known: known && !sections.has(name) };
        continue;
      }
      if (word === 'end' && name !== undefined) {
        if (open?.name === name) {
          if (open.known) {
            sections.set(name, open.lines);
          }
          open = null;
        }
        continue;
      }
    }
    if (open?.known && line.trim() !== '' && open.lines.length < MAX_LINES_PER_SECTION) {
      open.lines.push(line.slice(0, MAX_LINE));
    }
  }
  if (open?.known) {
    warn(`The output ended inside the section "${open.name}".`);
  }
  return { scriptVersion, finished, sections };
}

const MARKER_ABSENT = '!absent';
const MARKER_ERROR = '!error';

/** True for a section that says the tool is not installed or could not be used: the fact is unknown. */
const unusable = (lines: readonly string[]): boolean =>
  lines.some((line) => line === MARKER_ABSENT || line === MARKER_ERROR);

function parseImage(image: string): { name: string; tag: string | null } {
  const at = image.indexOf('@');
  const base = at >= 0 ? image.slice(0, at) : image;
  const colon = base.indexOf(':', base.lastIndexOf('/') + 1);
  if (colon < 0) {
    return { name: base, tag: null };
  }
  return { name: base.slice(0, colon), tag: clean(base.slice(colon + 1), 128) };
}

const SERVICE_ORDER = ['ssh', 'docker', 'haproxy', 'nginx', 'fail2ban', 'ufw'] as const;

function serviceState(load: string | undefined, active: string | undefined) {
  if (load === 'not-found') {
    return 'not_installed' as const;
  }
  switch (active) {
    case 'active':
    case 'inactive':
    case 'failed':
    case 'activating':
    case 'deactivating':
      return active;
    case 'reloading':
      return 'active' as const;
    case 'maintenance':
      return 'inactive' as const;
    default:
      return null;
  }
}

function emptyFacts(warnings: string[]): ServerFacts {
  return {
    schemaVersion: SERVER_FACTS_SCHEMA_VERSION,
    collectedAs: null,
    os: null,
    kernel: null,
    hostname: null,
    uptimeSeconds: null,
    bootedAt: null,
    cpuCount: null,
    loadAverage: null,
    memory: null,
    disks: null,
    time: null,
    systemd: null,
    rebootRequired: null,
    listeningPorts: null,
    services: null,
    versions: null,
    containers: null,
    firewall: null,
    sshd: null,
    updates: null,
    warnings,
  };
}

/** The facts of a server with nothing known, for a record that cannot be read. */
export function unreadableFacts(reason: string): ServerFacts {
  return emptyFacts([reason.slice(0, 200)]);
}

export function parseFacts(output: string, context: ParseContext): ParsedFacts {
  const warnings: string[] = [];
  const warn = (text: string): void => {
    if (warnings.length < MAX_WARNINGS) {
      warnings.push(text.slice(0, 200));
    }
  };
  if (context.truncated) {
    warn('The output was longer than the limit and was cut off.');
  }
  const { scriptVersion, finished, sections } = splitSections(output, warn);
  const recognised = scriptVersion === 1 && sections.size > 0;
  if (!recognised) {
    warn('The server printed nothing that looks like the output of the facts script.');
    return { facts: emptyFacts(warnings), recognised: false };
  }
  if (!finished) {
    warn('The output ended before the script was done; what came after that is missing.');
  }

  const facts: ServerFacts = emptyFacts(warnings);
  const lines = (name: string): readonly string[] | undefined => sections.get(name);

  // --- time first: other facts are measured against the server's clock.
  let serverEpoch: number | null = null;
  const timeLines = lines('time');
  if (timeLines) {
    const kv = keyValues(timeLines);
    serverEpoch = integer(kv.get('epoch'), 1, 4_102_444_800);
    const timezone = clean(kv.get('Timezone') ?? kv.get('timezone'), 64);
    const sync = kv.get('NTPSynchronized');
    const ntp = sync === 'yes' ? true : sync === 'no' ? false : null;
    if (serverEpoch === null && kv.has('epoch')) {
      warn('The server clock could not be read.');
    }
    facts.time = {
      utc: serverEpoch === null ? null : new Date(serverEpoch * 1000).toISOString(),
      skewSeconds:
        serverEpoch === null ? null : Math.round(serverEpoch - context.receivedAtMs / 1000),
      timezone,
      ntpSynchronized: ntp,
    };
  }

  // --- who ran it.
  const userLines = lines('user');
  if (userLines) {
    const uid = integer(keyValues(userLines).get('uid'));
    if (uid !== null) {
      facts.collectedAs = uid === 0 ? (context.viaSudo ? 'sudo' : 'root') : 'user';
    }
  }

  // --- the system.
  const osLines = lines('os');
  if (osLines && !unusable(osLines)) {
    const kv = keyValues(osLines);
    const os = {
      id: clean(kv.get('ID'), 64),
      versionId: clean(kv.get('VERSION_ID'), 64),
      prettyName: clean(kv.get('PRETTY_NAME'), 128),
    };
    if (os.id === null && os.versionId === null && os.prettyName === null) {
      warn('The operating system release file could not be read.');
    } else {
      facts.os = os;
    }
  }

  const kernelLines = lines('kernel');
  if (kernelLines) {
    const kv = keyValues(kernelLines);
    const kernel = {
      name: clean(kv.get('name'), 32),
      release: clean(kv.get('release'), 128),
      arch: clean(kv.get('arch'), 32),
    };
    if (kernel.name !== null || kernel.release !== null || kernel.arch !== null) {
      facts.kernel = kernel;
    }
    facts.hostname = clean(kv.get('hostname'), 255);
    if (kernel.name !== null && kernel.name !== 'Linux') {
      warn(`The server runs ${kernel.name}, not Linux: most facts will be missing.`);
    }
  }

  const uptimeLines = lines('uptime');
  if (uptimeLines && !unusable(uptimeLines)) {
    const match = /^([0-9]{1,12})(?:\.[0-9]+)?\s+[0-9.]+/u.exec(uptimeLines[0] ?? '');
    if (match?.[1] === undefined) {
      warn('The uptime could not be read.');
    } else {
      const seconds = integer(match[1]);
      facts.uptimeSeconds = seconds;
      if (seconds !== null && serverEpoch !== null && serverEpoch - seconds > 0) {
        facts.bootedAt = new Date((serverEpoch - seconds) * 1000).toISOString();
      }
    }
  }

  const loadLines = lines('loadavg');
  if (loadLines && !unusable(loadLines)) {
    const match = /^([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)/u.exec(
      loadLines[0] ?? '',
    );
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
      warn('The load average could not be read.');
    } else {
      facts.loadAverage = [Number(match[1]), Number(match[2]), Number(match[3])];
    }
  }

  const cpuLines = lines('cpu');
  if (cpuLines && !unusable(cpuLines)) {
    facts.cpuCount = integer(keyValues(cpuLines).get('cpus'), 1, 100_000);
    if (facts.cpuCount === null) {
      warn('The number of processors could not be read.');
    }
  }

  const memoryLines = lines('memory');
  if (memoryLines && !unusable(memoryLines)) {
    const kv = keyValues(memoryLines, ':');
    const bytes = (key: string): number | null => {
      const match = /^([0-9]{1,15})\s*kB$/iu.exec(kv.get(key) ?? '');
      return match?.[1] === undefined ? null : Number(match[1]) * 1024;
    };
    const memory = {
      totalBytes: bytes('MemTotal'),
      availableBytes: bytes('MemAvailable'),
      swapTotalBytes: bytes('SwapTotal'),
      swapFreeBytes: bytes('SwapFree'),
    };
    if (Object.values(memory).every((value) => value === null)) {
      warn('The memory figures could not be read.');
    } else {
      facts.memory = memory;
    }
  }

  const diskLines = lines('disks');
  if (diskLines && !unusable(diskLines)) {
    const disks: NonNullable<ServerFacts['disks']> = [];
    let skipped = 0;
    for (const line of diskLines) {
      if (line.startsWith('Filesystem')) {
        continue;
      }
      const tokens = line.trim().split(/\s+/u);
      const [device, total, used, available, capacity, ...mount] = tokens;
      const totalKib = integer(total);
      const usedKib = integer(used);
      const availableKib = integer(available);
      if (
        device === undefined ||
        capacity === undefined ||
        !capacity.endsWith('%') ||
        totalKib === null ||
        usedKib === null ||
        availableKib === null ||
        mount.length === 0
      ) {
        skipped += 1;
        continue;
      }
      const mountPoint = mount.join(' ');
      // `/` and real block devices; not tmpfs, snaps (loop devices), overlays or the like.
      const real = device.startsWith('/dev/') && !device.startsWith('/dev/loop');
      if (mountPoint !== '/' && !real) {
        continue;
      }
      if (disks.length < 32) {
        disks.push({
          mount: mountPoint.slice(0, 256),
          device: device.slice(0, 256),
          totalBytes: totalKib * 1024,
          usedBytes: usedKib * 1024,
          availableBytes: availableKib * 1024,
        });
      }
    }
    if (skipped > 0) {
      warn(`${String(skipped)} line(s) of the disk table could not be read.`);
    }
    facts.disks = disks;
  }

  const systemdLines = lines('systemd');
  if (systemdLines && !unusable(systemdLines)) {
    const kv = keyValues(systemdLines);
    const state = /^[a-z-]{1,32}$/u.test(kv.get('state') ?? '') ? (kv.get('state') ?? null) : null;
    const failedUnits: string[] = [];
    for (const line of systemdLines) {
      const unit = /^failed:\s+(?:[●*]\s+)?([A-Za-z0-9@._:\\-]{1,128})(?:\s|$)/u.exec(line)?.[1];
      if (unit !== undefined && failedUnits.length < 20) {
        failedUnits.push(unit);
      }
    }
    facts.systemd = { state, failedUnits };
  }

  const rebootLines = lines('reboot');
  if (rebootLines) {
    const required = keyValues(rebootLines).get('required');
    facts.rebootRequired = required === 'yes' ? true : required === 'no' ? false : null;
  }

  const portLines = lines('ports');
  if (portLines && !unusable(portLines)) {
    const found = new Map<string, NonNullable<ServerFacts['listeningPorts']>[number]>();
    let skipped = 0;
    for (const line of portLines) {
      const tokens = line.trim().split(/\s+/u);
      // State, Recv-Q, Send-Q, Local Address:Port, Peer Address:Port, [Process].
      const [state, , , local] = tokens;
      if (state !== 'LISTEN' || local === undefined) {
        skipped += 1;
        continue;
      }
      const colon = local.lastIndexOf(':');
      const port = integer(colon < 0 ? undefined : local.slice(colon + 1), 0, 65535);
      const address = colon < 1 ? '' : local.slice(0, colon).replace(/^\[|\]$/gu, '');
      if (port === null || address === '' || address.length > 64) {
        skipped += 1;
        continue;
      }
      const names = [
        ...new Set(
          [...line.matchAll(/\("([^"]{1,64})",pid=/gu)].flatMap((match) =>
            match[1] === undefined ? [] : [match[1]],
          ),
        ),
      ];
      const process = clean(names.join(', '), 64);
      found.set(`${address}|${String(port)}`, { address, port, process });
    }
    if (skipped > 0) {
      warn(`${String(skipped)} line(s) of the listening sockets could not be read.`);
    }
    facts.listeningPorts = [...found.values()]
      .sort(
        (a, b) => a.port - b.port || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0),
      )
      .slice(0, 200);
  }

  const serviceLines = lines('services');
  if (serviceLines && !unusable(serviceLines)) {
    const units = new Map<string, Map<string, string>>();
    let current: Map<string, string> | undefined;
    for (const line of serviceLines) {
      const unit = /^unit=([a-z0-9]{1,32})$/u.exec(line)?.[1];
      if (unit !== undefined) {
        current = new Map();
        units.set(unit, current);
      } else if (current) {
        const [key, ...rest] = line.split('=');
        if (key !== undefined && rest.length > 0 && !current.has(key)) {
          current.set(key, rest.join('='));
        }
      }
    }
    const stateOf = (unit: string) => {
      const found = units.get(unit);
      return found ? serviceState(found.get('LoadState'), found.get('ActiveState')) : null;
    };
    const services: NonNullable<ServerFacts['services']> = [];
    for (const name of SERVICE_ORDER) {
      const state: ReturnType<typeof stateOf> =
        name === 'ssh'
          ? // Debian calls the unit `ssh`, Red Hat `sshd`: the one that exists is the one that counts.
            ([stateOf('ssh'), stateOf('sshd')].find(
              (candidate) => candidate !== null && candidate !== 'not_installed',
            ) ??
            stateOf('ssh') ??
            stateOf('sshd'))
          : stateOf(name);
      services.push({ name, state });
    }
    facts.services = services;
  }

  const versionLines = lines('versions');
  if (versionLines) {
    const kv = keyValues(versionLines);
    const version = (key: string, pattern: RegExp): string | null => {
      const text = kv.get(key);
      if (text === undefined) {
        return null;
      }
      const found = pattern.exec(text)?.[1];
      if (found === undefined) {
        warn(`The ${key} version could not be read.`);
        return null;
      }
      return found.slice(0, 64);
    };
    facts.versions = {
      docker: version('docker', /\bversion\s+v?([0-9][0-9A-Za-z.+~:_-]*)/iu),
      haproxy: version('haproxy', /\bversion\s+v?([0-9][0-9A-Za-z.+~:_-]*)/iu),
      nginx: version('nginx', /nginx\/([0-9][0-9A-Za-z.+~_-]*)/iu),
      fail2ban: version('fail2ban', /\bv?([0-9]+(?:\.[0-9]+)+[0-9A-Za-z.+~_-]*)/u),
    };
  }

  const containerLines = lines('containers');
  if (containerLines && !unusable(containerLines)) {
    const containers: NonNullable<ServerFacts['containers']> = [];
    let skipped = 0;
    for (const line of containerLines) {
      const [name, image, state, ...status] = line.split('|');
      if (
        name === undefined ||
        image === undefined ||
        state === undefined ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(name) ||
        !/^[^\s]{1,256}$/u.test(image) ||
        !/^[a-z]{1,16}$/u.test(state)
      ) {
        skipped += 1;
        continue;
      }
      const parsed = parseImage(image);
      if (containers.length < 200) {
        containers.push({
          name,
          image,
          imageName: parsed.name.slice(0, 256),
          imageTag: parsed.tag,
          state,
          status: clean(status.join('|'), 128) ?? '',
        });
      }
    }
    if (skipped > 0) {
      warn(`${String(skipped)} line(s) of the container list could not be read.`);
    }
    facts.containers = containers;
  }

  const ufwLines = lines('ufw');
  if (ufwLines) {
    let ufw: 'active' | 'inactive' | null = null;
    if (!unusable(ufwLines)) {
      const status = /^Status:\s*(active|inactive)\s*$/iu.exec(ufwLines[0] ?? '')?.[1];
      if (status === undefined) {
        warn('The firewall status could not be read.');
      } else {
        ufw = status.toLowerCase() === 'active' ? 'active' : 'inactive';
      }
    }
    facts.firewall = { ufw };
  }

  const sshdLines = lines('sshd');
  if (sshdLines && !unusable(sshdLines)) {
    const kv = keyValues(sshdLines, ' ');
    const flag = (key: string): boolean | null => {
      const value = kv.get(key);
      return value === 'yes' ? true : value === 'no' ? false : null;
    };
    const login = kv.get('permitrootlogin');
    facts.sshd = {
      port: integer(kv.get('port'), 1, 65535),
      passwordAuthentication: flag('passwordauthentication'),
      permitRootLogin: login !== undefined && /^[a-z-]{1,32}$/u.test(login) ? login : null,
    };
  }

  const updateLines = lines('updates');
  if (updateLines && !unusable(updateLines)) {
    const kv = keyValues(updateLines);
    const upgradable = integer(kv.get('upgradable'));
    if (kv.get('manager') === 'apt' && upgradable !== null) {
      facts.updates = { manager: 'apt', upgradable };
    } else {
      warn('The count of package updates could not be read.');
    }
  }

  const checked = ServerFactsSchema.safeParse(facts);
  if (!checked.success) {
    // A defect of the parser, not of the server: keep what is certain (nothing) and say so.
    return {
      facts: emptyFacts(
        [...warnings, 'The facts did not match their schema.'].slice(0, MAX_WARNINGS),
      ),
      recognised: true,
    };
  }
  return { facts: checked.data, recognised: true };
}
