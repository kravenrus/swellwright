import 'reflect-metadata';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Database } from '@swellwright/db';

import { AuditService } from './audit/audit.service.js';
import { checkpointKey, checkpointSignatureValid, parseCheckpoint } from './audit/checkpoint.js';
import { findEventHash, verifyExportText } from './audit/export-file.js';
import type { RequestMeta } from './auth/context.js';
import { loadCatalogue } from './artifacts/catalogue.js';
import { type AppConfig, loadConfig } from './config.js';
import { UsersService } from './users/users.service.js';

/**
 * Commands for the person who runs the server (ADR 0016): the way back in when nobody can sign in. They work
 * on the database directly, with the same environment as the server, and trust whoever can run them as much
 * as the database does. Not the remote `sw` client of the design: that one talks to the API with a token.
 */
export interface AdminIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

const HELP = `Usage: node dist/admin.js <command>

  users                          List the accounts: login name, role, state.
  reset-credentials <login>      Delete the password, authenticator and recovery codes of an account,
                                 end its sessions and print a one-time invitation to set new ones.
  audit-checkpoint               Note the head of the audit chain with a signature (needs SW_AUTH_KEY) and
                                 print it. Keep the text outside the database, for example from a cron job.
  audit-verify <file> [--checkpoint <text>]
                                 Check an exported audit log without the database: every number, link and
                                 hash, and, with a checkpoint, that the file reaches it and agrees with it.
  artifacts                      List the built-in artifacts with their SHA-256 checked against the manifest
                                 (SW_ARTIFACTS_DIR); exits 1 when one is broken or there is none.
  help                           This text.

Run it with the environment of the server (SW_DATABASE_URL, and SW_AUTH_KEY in production). The commands
audit-verify and artifacts need no database.`;

const NO_REQUEST: RequestMeta = { ip: undefined, userAgent: undefined, requestId: undefined };

async function listUsers(users: UsersService, io: AdminIo): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  do {
    const page = await users.list({ limit: 200, ...(cursor === undefined ? {} : { cursor }) });
    for (const user of page.users) {
      io.out(`${user.username.padEnd(34)}${user.role.padEnd(10)}${user.state}`);
      count += 1;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  if (count === 0) {
    io.out('There are no accounts yet. Start the server and open the console to create the owner.');
  }
  return 0;
}

async function resetCredentials(
  users: UsersService,
  username: string | undefined,
  io: AdminIo,
): Promise<number> {
  if (!username) {
    io.err('Name the account: reset-credentials <login name>');
    return 2;
  }
  const id = await users.idOf(username);
  if (!id) {
    io.err(`There is no account named "${username}".`);
    return 1;
  }
  const { user, invitation } = await users.resetCredentials(null, id, NO_REQUEST, 'cli');
  io.out(`Credentials of "${user.username}" were reset.`);
  io.out('The password, authenticator and recovery codes are gone and every session has ended.');
  io.out(
    `Give this invitation to the person who uses the account. It is shown once and works until ${invitation.expiresAt}.`,
  );
  io.out(
    'Add it to the address of the console, or enter the part after "=" on the invitation screen:',
  );
  io.out('');
  io.out(`  #invite=${invitation.token}`);
  return 0;
}

/** Checks an exported audit log. Needs no database; with the instance key it also checks a checkpoint's signature. */
export async function auditVerify(
  args: readonly string[],
  io: AdminIo,
  authKey: Buffer | undefined,
): Promise<number> {
  const file = args[0];
  const flag = args.indexOf('--checkpoint');
  const checkpointText = flag >= 0 ? args[flag + 1] : undefined;
  if (!file || file.startsWith('--') || (flag >= 0 && !checkpointText)) {
    io.err('Usage: audit-verify <file> [--checkpoint <text>]');
    return 2;
  }
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    io.err(`Cannot read "${file}".`);
    return 2;
  }
  const result = verifyExportText(text);
  if (result.error) {
    io.err(result.error);
    return 1;
  }
  if (!result.ok && result.problem) {
    io.out(
      `NOT INTACT. ${String(result.checked)} event(s) were fine; the first problem is at number ${String(result.problem.seq)} (${result.problem.reason}).`,
    );
    return 1;
  }
  io.out(
    `The file is intact: ${String(result.checked)} event(s), numbers ${String(result.first)} to ${String(result.last)}, every link and hash checks out.`,
  );
  if (result.head) {
    io.out(`Last event: ${String(result.head.seq)} ${result.head.hash}`);
  }
  if (checkpointText === undefined) {
    return 0;
  }
  const checkpoint = parseCheckpoint(checkpointText);
  if (!checkpoint) {
    io.err('That is not a checkpoint.');
    return 1;
  }
  if (authKey) {
    if (!checkpointSignatureValid(checkpointKey(authKey), checkpoint)) {
      io.out('CHECKPOINT NOT OURS: its signature is wrong (another instance, or made up).');
      return 1;
    }
    io.out('The checkpoint signature is valid.');
  } else {
    io.out('The signature of the checkpoint was not checked: SW_AUTH_KEY is not set.');
  }
  const atCheckpoint = findEventHash(text, checkpoint.seq);
  if (atCheckpoint === null) {
    const reaches = result.last !== null && result.last >= checkpoint.seq;
    io.out(
      reaches
        ? `The file does not contain event ${String(checkpoint.seq)}: it starts after it.`
        : `The file ends at ${String(result.last)}, before the checkpoint (${String(checkpoint.seq)}): the log was cut short, or the file is old.`,
    );
    return 1;
  }
  if (atCheckpoint !== checkpoint.hash) {
    io.out(
      `HISTORY DIFFERS: event ${String(checkpoint.seq)} in the file is not the one the checkpoint saw.`,
    );
    return 1;
  }
  io.out(
    `The file agrees with the checkpoint (event ${String(checkpoint.seq)}, noted ${checkpoint.issuedAt.toISOString()}).`,
  );
  return 0;
}

async function auditCheckpoint(
  audit: AuditService,
  authKey: Buffer | undefined,
  io: AdminIo,
): Promise<number> {
  if (!authKey) {
    io.err(
      'SW_AUTH_KEY is not set: a checkpoint would carry a signature this server cannot check later.',
    );
    return 1;
  }
  const checkpoint = await audit.createCheckpoint(null, NO_REQUEST);
  io.out(`Event ${String(checkpoint.seq)} at ${checkpoint.issuedAt}:`);
  io.out(checkpoint.checkpoint);
  return 0;
}

/** Lists the artifact catalogue as the server would see it at start: each file hashed against its manifest. */
export async function artifactsCheck(config: AppConfig, io: AdminIo): Promise<number> {
  const entries = await loadCatalogue(config.artifacts.directory, config.artifacts.maxBytes);
  if (entries.length === 0) {
    io.err(`There is no artifact in ${config.artifacts.directory}.`);
    return 1;
  }
  let broken = 0;
  for (const entry of entries) {
    const manifest = entry.manifest;
    io.out(
      [
        (manifest?.name ?? entry.directory).padEnd(24),
        (manifest?.version ?? '-').padEnd(12),
        entry.state.padEnd(8),
        manifest ? manifest.sha256.slice(0, 12) : '-'.padEnd(12),
        manifest ? `${String(manifest.size)} bytes` : '',
      ]
        .join(' ')
        .trimEnd(),
    );
    if (entry.state === 'broken') {
      broken += 1;
      io.out(`  ${entry.problem ?? 'unknown problem'}`);
    }
  }
  return broken === 0 ? 0 : 1;
}

/** Runs one command against a database. Returns the exit code. */
export async function runAdmin(
  args: readonly string[],
  database: Database,
  io: AdminIo,
  authKey?: Buffer,
): Promise<number> {
  const [command, ...rest] = args;
  const audit = new AuditService(database, authKey ? { authKey } : undefined);
  const users = new UsersService(database, audit);
  switch (command) {
    case 'audit-checkpoint':
      return auditCheckpoint(audit, authKey, io);
    case 'audit-verify':
      return auditVerify(rest, io, authKey);
    case 'users':
      return listUsers(users, io);
    case 'reset-credentials':
      return resetCredentials(users, rest[0], io);
    case 'help':
    case '--help':
    case undefined:
      io.out(HELP);
      return command === undefined ? 2 : 0;
    default:
      io.err(`Unknown command "${command}".`);
      io.err(HELP);
      return 2;
  }
}

async function main(): Promise<void> {
  const io: AdminIo = {
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
  };
  const wanted = process.argv[2];
  if (wanted === undefined || wanted === 'help' || wanted === '--help') {
    io.out(HELP);
    process.exitCode = wanted === undefined ? 2 : 0;
    return;
  }
  const config = loadConfig(process.env, 'admin');
  const authKey = config.authKeyEphemeral ? undefined : config.authKey;
  if (wanted === 'audit-verify') {
    // A file needs no database.
    process.exitCode = await auditVerify(process.argv.slice(3), io, authKey);
    return;
  }
  if (wanted === 'artifacts') {
    process.exitCode = await artifactsCheck(config, io);
    return;
  }
  if (!config.databaseUrl) {
    io.err('SW_DATABASE_URL is not set: there is no database to work on.');
    process.exitCode = 2;
    return;
  }
  const database = new Database({ url: config.databaseUrl, poolSize: 2 });
  try {
    await database.assertReady();
    process.exitCode = await runAdmin(process.argv.slice(2), database, io, authKey);
  } catch (error) {
    io.err(error instanceof Error ? error.message : 'The command failed.');
    process.exitCode = 1;
  } finally {
    await database.close();
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
