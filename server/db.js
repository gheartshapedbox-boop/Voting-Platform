import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SETTINGS = {
  event_title: 'Strategy Prioritisation Workshop',
  x_label: 'Feasibility',
  y_label: 'Impact',
  x_hint: 'How realistic is it for us to actually deliver this?',
  y_hint: 'How much difference would this make if we did deliver it?',
};

/**
 * Opens (and migrates) the SQLite database. `:memory:` is supported for tests.
 */
export function openDb(file = process.env.DB_FILE ?? path.join(here, '..', 'data', 'voting.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  // Foreign keys are OFF by default in SQLite -- without this the ON DELETE
  // CASCADE rules above are silently decorative.
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

  const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) seed.run(key, value);

  return db;
}
