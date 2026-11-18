import 'reflect-metadata';

import { resolve } from 'node:path';

import { Database } from '@swellwright/db';

import { AuditService } from './audit/audit.service.js';
import type { RequestMeta } from './auth/context.js';
import { loadConfig } from './config.js';
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
  help                           This text.

Run it with the environment of the server (SW_DATABASE_URL, and SW_AUTH_KEY in production).`;

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

/** Runs one command against a database. Returns the exit code. */
export async function runAdmin(
  args: readonly string[],
  database: Database,
  io: AdminIo,
): Promise<number> {
  const [command, ...rest] = args;
  const users = new UsersService(database, new AuditService(database));
  switch (command) {
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
  if (!config.databaseUrl) {
    io.err('SW_DATABASE_URL is not set: there is no database to work on.');
    process.exitCode = 2;
    return;
  }
  const database = new Database({ url: config.databaseUrl, poolSize: 2 });
  try {
    await database.assertReady();
    process.exitCode = await runAdmin(process.argv.slice(2), database, io);
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
