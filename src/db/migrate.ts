import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from '../config.js';
import { migrationsDir as migrationsDirOf } from '../lib/paths.js';

const migrationsDirFromHere = (): string => migrationsDirOf(import.meta.url);

/**
 * Minimal forward-only SQL migration runner. Files in /migrations are
 * applied in filename order inside a transaction and recorded in
 * _migrations so re-runs are idempotent.
 */
export async function runMigrations(pool: pg.Pool, migrationsDir: string): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT filename FROM _migrations');
  const done = new Set(rows.map((r) => r.filename as string));
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

// CLI entry: npm run migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = loadConfig();
  const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL });
  runMigrations(pool, migrationsDirFromHere())
    .then((applied) => {
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
