import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];
export type Sql = ReturnType<typeof postgres>;

/**
 * `DATABASE_URL` apunta al pooler de Supabase en modo transaction (docs/08),
 * que no soporta sentencias preparadas: cada conexión del pool puede servir a
 * una transacción distinta. De ahí `prepare: false`.
 */
export const createDb = (databaseUrl: string, options: { max?: number } = {}) => {
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: options.max ?? 10,
    onnotice: () => {},
  });

  return { sql, db: drizzle(sql, { schema }) };
};

export { schema };
