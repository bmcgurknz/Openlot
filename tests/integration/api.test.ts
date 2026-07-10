import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { MemoryRepository } from '../../src/db/repository.js';
import { ProcoreClient } from '../../src/procore/client.js';
import { buildApp } from '../../src/server.js';
import { seedDemoData, DEMO_PROJECT_ID } from '../../src/services/demo.js';
import { encrypt } from '../../src/lib/crypto.js';

const KEY = 'a'.repeat(64);

function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DEMO_MODE: 'true',
    TOKEN_ENCRYPTION_KEY: KEY,
    WEBHOOK_SHARED_SECRET: 'test-secret',
    ...overrides
  });
}

/** Stub Procore API: serves canned JSON for the endpoints the sync touches. */
function stubFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const key = url.pathname;
    if (key in routes) {
      return new Response(JSON.stringify(routes[key]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: `no stub for ${key}` }), { status: 404 });
  }) as typeof fetch;
}

async function connect(repo: MemoryRepository): Promise<void> {
  await repo.saveConnection({
    companyId: 4001,
    companyName: 'Kestrel Civil Pty Ltd',
    accessTokenEnc: encrypt('access-token', KEY),
    refreshTokenEnc: encrypt('refresh-token', KEY),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

describe('API integration', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;

  beforeEach(async () => {
    repo = new MemoryRepository();
    await seedDemoData(repo);
    app = buildApp({ config: testConfig(), repo });
    await app.ready();
  });

  afterEach(() => app.close());

  it('serves health and work types', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok' });
    const wt = await app.inject({ method: 'GET', url: '/api/work-types' });
    expect(wt.json()).toHaveProperty('EW', 'Earthworks');
  });

  it('lists and filters lots', async () => {
    const all = await app.inject({ method: 'GET', url: `/api/projects/${DEMO_PROJECT_ID}/lots` });
    expect(all.statusCode).toBe(200);
    expect(all.json().length).toBeGreaterThanOrEqual(5);
    const conformed = await app.inject({
      method: 'GET',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots?status=conformed`
    });
    expect(conformed.json().map((l: { id: string }) => l.id)).toEqual(['LOT-EW-0012']);
  });

  it('creates a lot and rejects bad work types', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots`,
      payload: { workType: 'KF', description: 'Road 2 kerb Ch 0–120 LHS', quantity: 120, uom: 'lm' }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().id).toBe('LOT-KF-0001');
    const bad = await app.inject({
      method: 'POST',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots`,
      payload: { workType: 'ZZ', description: 'nope' }
    });
    expect(bad.statusCode).toBe(400);
  });

  it('returns the full lot dossier with linked evidence', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots/LOT-SW-0007`
    });
    const body = res.json();
    expect(body.lot.status).toBe('work_complete');
    expect(body.inspections).toHaveLength(1);
    expect(body.ncrs).toHaveLength(1);
  });

  it('explains conformance blockers via the evaluation endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots/LOT-SW-0007/evaluation`
    });
    const evaln = res.json();
    expect(evaln.eligible).toBe(false);
    const codes = evaln.blockers.map((b: { code: string }) => b.code);
    expect(codes).toContain('OPEN_NCR');
    expect(codes).toContain('INSPECTION_NOT_PASSED');
  });

  it('refuses to conform a blocked lot over HTTP with 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots/LOT-SW-0007/transition`,
      payload: { to: 'conformed' }
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/cannot be conformed/);
  });

  it('walks a lot to conformed and onto a claim, then blocks double claiming', async () => {
    // LOT-EW-0014 has a passed inspection + released hold point; the
    // sampled compaction test is the last blocker.
    const dossier = await app.inject({
      method: 'GET',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots/LOT-EW-0014`
    });
    const testId = dossier.json().tests[0].id;
    await app.inject({ method: 'PATCH', url: `/api/tests/${testId}`, payload: { status: 'passed' } });

    const conform = await app.inject({
      method: 'POST',
      url: `/api/projects/${DEMO_PROJECT_ID}/lots/LOT-EW-0014/transition`,
      payload: { to: 'conformed' }
    });
    expect(conform.statusCode).toBe(200);

    const period = await app.inject({
      method: 'POST',
      url: `/api/projects/${DEMO_PROJECT_ID}/claims`,
      payload: { label: 'PC-14 2026-07', periodStart: '2026-07-01', periodEnd: '2026-07-31' }
    });
    const claimId = period.json().id;

    const add = await app.inject({
      method: 'POST',
      url: `/api/projects/${DEMO_PROJECT_ID}/claims/${claimId}/lots`,
      payload: { lotId: 'LOT-EW-0014' }
    });
    expect(add.statusCode).toBe(201);

    // LOT-EW-0012 was claimed in the seeded PC-13 — gate must refuse it.
    const dup = await app.inject({
      method: 'POST',
      url: `/api/projects/${DEMO_PROJECT_ID}/claims/${claimId}/lots`,
      payload: { lotId: 'LOT-EW-0012' }
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toMatch(/already claimed in PC-13/);

    const csv = await app.inject({
      method: 'GET',
      url: `/api/projects/${DEMO_PROJECT_ID}/claims/${claimId}/extract.csv`
    });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('LOT-EW-0014');
  });
});

describe('webhook ingestion', () => {
  let app: FastifyInstance;
  let repo: MemoryRepository;

  beforeEach(async () => {
    repo = new MemoryRepository();
    await connect(repo);
    const config = testConfig();
    const procore = new ProcoreClient(
      config,
      repo,
      stubFetch({
        '/rest/v1.1/projects/316/checklist/lists/900555': {
          id: 900555,
          name: 'LOT-PV-0003 - Subbase depth & density check',
          status: 'closed',
          inspection_date: '2026-07-05',
          list_template_name: 'ITP - Pavements - MRTS05',
          item_count: 9,
          conforming_item_count: 9,
          deficient_item_count: 0
        },
        '/rest/v1.0/observations/items/770099': {
          id: 770099,
          name: 'LOT-PV-0003 - Subbase contamination near Ch 0110',
          status: 'initiated',
          type: { id: 2, name: 'Non-Conformance' },
          created_at: '2026-07-05T01:00:00Z'
        }
      })
    );
    app = buildApp({ config, repo, procore });
    await app.ready();
  });

  afterEach(() => app.close());

  it('rejects deliveries without the shared secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/procore',
      payload: { resource_name: 'Checklist Lists', event_type: 'update', resource_id: 900555, project_id: 316 }
    });
    expect(res.statusCode).toBe(401);
  });

  it('links an inspection webhook to its lot via the title prefix', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/procore',
      headers: { 'x-openlot-webhook-secret': 'test-secret' },
      payload: { resource_name: 'Checklist Lists', event_type: 'update', resource_id: 900555, project_id: 316 }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().outcome).toBe('linked');
    const linked = await repo.listInspections(316, 'LOT-PV-0003');
    expect(linked).toHaveLength(1);
    expect(linked[0]?.status).toBe('passed');
  });

  it('links an NCR observation and records the audit trail', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/procore',
      headers: { 'x-openlot-webhook-secret': 'test-secret' },
      payload: { resource_name: 'Observations', event_type: 'create', resource_id: 770099, project_id: 316 }
    });
    expect(res.json().outcome).toBe('linked');
    const ncrs = await repo.listNcrs(316, 'LOT-PV-0003');
    expect(ncrs[0]?.status).toBe('open');
    const events = await repo.listWebhookEvents(10);
    expect(events[0]).toMatchObject({ resourceName: 'Observations', outcome: 'linked' });
  });

  it('logs but ignores records without a lot ID', async () => {
    const config = testConfig();
    const procore = new ProcoreClient(
      config,
      repo,
      stubFetch({
        '/rest/v1.1/projects/316/checklist/lists/900777': {
          id: 900777,
          name: 'Weekly site safety walk',
          status: 'closed',
          inspection_date: '2026-07-05',
          item_count: 5,
          conforming_item_count: 5,
          deficient_item_count: 0
        }
      })
    );
    const app2 = buildApp({ config, repo, procore });
    await app2.ready();
    const res = await app2.inject({
      method: 'POST',
      url: '/webhooks/procore',
      headers: { 'x-openlot-webhook-secret': 'test-secret' },
      payload: { resource_name: 'Checklist Lists', event_type: 'update', resource_id: 900777, project_id: 316 }
    });
    expect(res.json().outcome).toBe('ignored_no_lot_id');
    await app2.close();
  });
});
