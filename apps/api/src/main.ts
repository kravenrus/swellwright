import 'reflect-metadata';

import { readFileSync } from 'node:fs';

import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const config = loadConfig(process.env, pkg.version);

const app = await createApp(config);
await app.listen(config.port, config.host);
