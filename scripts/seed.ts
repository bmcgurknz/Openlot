import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { runMigrations } from '../src/db/migrate.js';
import { migrationsDir } from '../src/lib/paths.js';
import { PgRepository } from '../src/db/pg-repository.js';
import { seedDemoData, DEMO_PROJECT_ID } from '../src/services/demo.js';

/**
 * Seed the PostgreSQL database with the Kestrel Ridge Stage 2 sample
 * dataset. Intended for evaluation environments only:
 *   npm run seed
 */
const cfg = loadConfig();
const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL });
await runMigrations(pool, migrationsDir(import.meta.url));
await seedDemoData(new PgRepository(pool));
console.log(`Seeded sample data into project ${DEMO_PROJECT_ID}.`);
await pool.end();
