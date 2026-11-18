import { defineConfig } from 'prisma/config';

// The connection string comes from the environment, never from a file in the repository.
// Offline commands (generate, validate, format) work without it.
const url = process.env.SW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
