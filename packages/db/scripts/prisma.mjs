// Runs the Prisma CLI for this package.
//
// The schema engine (the native binary behind `migrate`) is not installed by a lifecycle script: the CLI
// downloads it on first use, so `pnpm install --ignore-scripts` does not cover it. Before any command that
// can run the binary, this wrapper compares it with the checksum pinned in engine-checksums.json (ADR 0013).
// `generate`, `validate` and `format` do not execute the binary and run without the check.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromPackage = createRequire(join(packageDir, 'package.json'));
const cliPath = requireFromPackage.resolve('prisma/build/index.js');
const requireFromCli = createRequire(requireFromPackage.resolve('prisma/package.json'));
const enginesPackage = requireFromCli.resolve('@prisma/engines/package.json');
const enginesDir = dirname(enginesPackage);

const OFFLINE_COMMANDS = new Set(['generate', 'validate', 'format']);

function fail(message) {
  console.error(`prisma wrapper: ${message}`);
  process.exit(1);
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function findEngineFile() {
  return readdirSync(enginesDir).find((name) => name.startsWith('schema-engine-'));
}

/** The engine commit the installed Prisma packages were built against. */
function installedEngineHash() {
  const versionPackage = createRequire(enginesPackage).resolve(
    '@prisma/engines-version/package.json',
  );
  const version = JSON.parse(readFileSync(versionPackage, 'utf8')).version;
  return String(version).split('.').at(-1);
}

function verifyEngine() {
  if (process.env.PRISMA_SCHEMA_ENGINE_BINARY) {
    fail('PRISMA_SCHEMA_ENGINE_BINARY is set; it would bypass the checksum check. Unset it.');
  }
  const pins = JSON.parse(readFileSync(join(packageDir, 'engine-checksums.json'), 'utf8'));
  const installed = installedEngineHash();
  if (installed !== pins.engine) {
    fail(
      `the installed Prisma uses engine ${installed} but engine-checksums.json pins ${pins.engine}. ` +
        'After upgrading Prisma, pin the new binaries (see packages/db/README.md).',
    );
  }

  let file = findEngineFile();
  if (!file) {
    // `generate` makes the CLI fetch the engine without running it.
    const code = runCli(['generate']);
    if (code !== 0) {
      process.exit(code);
    }
    file = findEngineFile();
  }
  if (!file) {
    fail('the schema engine is missing after download.');
  }

  const platform = file.replace(/^schema-engine-/u, '').replace(/\.exe$/u, '');
  const actual = createHash('sha256')
    .update(readFileSync(join(enginesDir, file)))
    .digest('hex');
  const expected = pins.sha256[platform];
  if (expected === undefined) {
    if (process.env.CI || process.env.SW_ALLOW_UNPINNED_PRISMA_ENGINE !== '1') {
      fail(
        `no pinned checksum for the platform "${platform}" (sha256 ${actual}). Pin it after verifying it, ` +
          'or set SW_ALLOW_UNPINNED_PRISMA_ENGINE=1 for a local run outside CI.',
      );
    }
    console.warn(`prisma wrapper: platform "${platform}" is not pinned, continuing (local run).`);
    return;
  }
  if (actual !== expected) {
    rmSync(join(enginesDir, file), { force: true });
    fail(
      `the schema engine for "${platform}" does not match the pinned checksum ` +
        `(expected ${expected}, got ${actual}). The file was removed.`,
    );
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  fail('usage: node scripts/prisma.mjs <prisma command and arguments>');
}
if (!OFFLINE_COMMANDS.has(args[0])) {
  // Without a datasource Prisma 7 prints nothing and exits 0 for some commands, which would pass a check
  // that did not run.
  if (!process.env.SW_DATABASE_URL) {
    fail('SW_DATABASE_URL is not set.');
  }
  verifyEngine();
}
process.exit(runCli(args));
