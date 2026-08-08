import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Postgres de desarrollo sin Docker ni permisos de administrador.
 *
 * `@electric-sql/pglite` es Postgres real compilado a WASM; este script solo
 * lo expone por el protocolo de cable de Postgres para que `postgres.js` (y
 * cualquier cliente normal, `psql` incluido) se conecte igual que a un
 * servidor de verdad. Los datos persisten en `.pglite-data/`, ignorado por
 * git — no es el Supabase de producción, es un reemplazo local para
 * `pnpm db:migrate` / `db:seed` / `dev` mientras no haya credenciales reales
 * de Supabase (docs/08).
 *
 * Deja esta terminal abierta: el proceso ES el servidor. `db:migrate`,
 * `db:seed` y `dev` van en otra terminal, apuntando a `DATABASE_URL` de
 * `.env` (ver `.env.example`).
 */
const PORT = 55432;
const HOST = '127.0.0.1';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pglite-data');

const main = async (): Promise<void> => {
  const db = new PGlite(dataDir);
  await db.waitReady;

  const server = new PGLiteSocketServer({ db, port: PORT, host: HOST, maxConnections: 10 });
  await server.start();

  console.log(`Postgres local (pglite) escuchando en ${HOST}:${PORT}`);
  console.log(`Datos en: ${dataDir}`);
  console.log(`DATABASE_URL=postgresql://postgres:postgres@${HOST}:${PORT}/postgres`);
  console.log('Deja esto corriendo. En otra terminal: db:migrate, db:seed, dev.');

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
