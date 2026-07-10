import pg from 'pg';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { PgRepository } from './db/pg-repository.js';
import { MemoryRepository, type Repository } from './db/repository.js';
import { migrationsDir } from './lib/paths.js';
import { buildApp } from './server.js';
import { seedDemoData } from './services/demo.js';

async function main(): Promise<void> {
  const config = loadConfig();
  let repo: Repository;

  if (config.DEMO_MODE) {
    const memory = new MemoryRepository();
    await seedDemoData(memory);
    repo = memory;
    console.log('DEMO_MODE: in-memory repository with sample Kestrel Ridge Stage 2 data. Nothing persists.');
  } else {
    const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
    const applied = await runMigrations(pool, migrationsDir(import.meta.url));
    if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);
    repo = new PgRepository(pool);
  }

  const app = buildApp({ config, repo });
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`OpenLot listening on ${config.APP_BASE_URL} (port ${config.PORT})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
