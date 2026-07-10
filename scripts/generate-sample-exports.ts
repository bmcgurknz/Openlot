/**
 * Regenerates /exports sample files from the demo dataset, in-process
 * (no server, no database): walks LOT-EW-0014 to conformed, adds it to a
 * fresh PC-14 claim period, and writes the CSV + HTML extracts.
 *
 *   npx tsx scripts/generate-sample-exports.ts
 */
import { writeFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { MemoryRepository } from '../src/db/repository.js';
import { buildApp } from '../src/server.js';
import { seedDemoData, DEMO_PROJECT_ID as P } from '../src/services/demo.js';

const repo = new MemoryRepository();
await seedDemoData(repo);
const app = buildApp({
  config: loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'true', TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) }),
  repo
});
await app.ready();

const dossier = (await app.inject({ method: 'GET', url: `/api/projects/${P}/lots/LOT-EW-0014` })).json() as {
  tests: { id: string }[];
};
await app.inject({ method: 'PATCH', url: `/api/tests/${dossier.tests[0]!.id}`, payload: { status: 'passed' } });
await app.inject({
  method: 'POST',
  url: `/api/projects/${P}/lots/LOT-EW-0014/transition`,
  payload: { to: 'conformed' }
});

const period = (
  await app.inject({
    method: 'POST',
    url: `/api/projects/${P}/claims`,
    payload: { label: 'PC-14 2026-07', periodStart: '2026-07-01', periodEnd: '2026-07-31' }
  })
).json() as { id: string };

const add = await app.inject({
  method: 'POST',
  url: `/api/projects/${P}/claims/${period.id}/lots`,
  payload: { lotId: 'LOT-EW-0014' }
});
console.log('add conformed lot →', add.statusCode);

const dup = await app.inject({
  method: 'POST',
  url: `/api/projects/${P}/claims/${period.id}/lots`,
  payload: { lotId: 'LOT-EW-0012' }
});
console.log('double-claim refusal →', dup.statusCode, (dup.json() as { error: string }).error);

const csv = await app.inject({ method: 'GET', url: `/api/projects/${P}/claims/${period.id}/extract.csv` });
const html = await app.inject({ method: 'GET', url: `/api/projects/${P}/claims/${period.id}/extract.html` });
await writeFile('exports/sample-claim-extract.csv', csv.body);
await writeFile('exports/sample-substantiation-report.html', html.body);
console.log('wrote exports/sample-claim-extract.csv and exports/sample-substantiation-report.html');
await app.close();
