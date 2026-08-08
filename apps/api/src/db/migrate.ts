import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadDotEnvIfPresent } from '../config.js';
import { createDb } from './client.js';

/** `pnpm db:migrate` de docs/08. */
const main = async (): Promise<void> => {
  loadDotEnvIfPresent();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL. Ver docs/08.');

  const { sql, db } = createDb(databaseUrl, { max: 1 });
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../drizzle',
  );

  await migrate(db, { migrationsFolder });
  await sql.end();
  console.log('Migraciones aplicadas.');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
