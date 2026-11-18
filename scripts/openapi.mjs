// Writes (or checks) docs/api/openapi.json from the route registry. Run `pnpm run build` first.
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

import { buildOpenApi } from '../packages/contracts/dist/index.js';

const target = new URL('../docs/api/openapi.json', import.meta.url);
const text = `${JSON.stringify(buildOpenApi(), null, 2)}\n`;

if (argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // a missing file is reported below
  }
  if (current !== text) {
    console.error('docs/api/openapi.json is out of date. Run: pnpm run openapi');
    exit(1);
  }
  console.log('docs/api/openapi.json is up to date');
} else {
  writeFileSync(target, text);
  console.log('wrote docs/api/openapi.json');
}
