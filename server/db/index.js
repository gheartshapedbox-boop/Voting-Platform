import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');

export const DEFAULT_SESSION_ID = 'default';

/**
 * One SQL dialect (PostgreSQL) with two drivers:
 *   - `pg`     when DATABASE_URL is set  -> Vercel / Neon / any hosted Postgres
 *   - PGlite   otherwise                 -> local dev and tests, zero setup
 *
 * Both speak the same SQL and the same `$1` placeholders, so there is no
 * dialect fork anywhere above this file.
 */
/**
 * Hosted-Postgres integrations disagree on the variable name: Neon and most
 * providers set DATABASE_URL, Vercel Postgres sets POSTGRES_URL. Accept either
 * so a correctly provisioned database is never missed over a naming detail.
 */
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

async function createDriver() {
  const url = databaseUrl();

  // PGlite is per-process and (without DB_DIR) in-memory. On a serverless host
  // that means every lambda gets its own empty database and participants see
  // each other's data vanish at random. Fail loudly instead of half-working.
  if (!url && process.env.VERCEL) {
    throw new Error(
      'No DATABASE_URL (or POSTGRES_URL). A serverless deployment needs a hosted Postgres -- ' +
      'add one in the Vercel dashboard (Storage -> Postgres) and redeploy.',
    );
  }

  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
      max: 3,
    });
    return {
      query: (text, params = []) => pool.query(text, params),
      exec: (text) => pool.query(text),
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  // DB_DIR unset => in-memory, which is what tests want.
  const dir = process.env.DB_DIR;
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = new PGlite(dir);
  await lite.waitReady;
  return {
    query: (text, params = []) => lite.query(text, params),
    exec: (text) => lite.exec(text),
    close: () => lite.close(),
  };
}

export async function openDb() {
  const driver = await createDriver();
  await driver.exec(SCHEMA);
  await driver.query(
    `INSERT INTO voting_sessions (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_SESSION_ID, 'Strategy prioritisation'],
  );
  return driver;
}

// Serverless-safe singleton: a warm Vercel lambda reuses the same pool.
let shared = null;
export function getDb() {
  if (!shared) shared = openDb();
  return shared;
}
