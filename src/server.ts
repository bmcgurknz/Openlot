import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Repository } from './db/repository.js';
import { ProcoreClient } from './procore/client.js';
import { ClaimService } from './services/claims.js';
import { LotService, LotServiceError } from './services/lots.js';
import { ReportingService } from './services/reporting.js';
import { SyncService, type ProcoreWebhookPayload } from './services/sync.js';
import { WORK_TYPES, type LotStatus } from './types.js';

export interface AppDeps {
  config: Config;
  repo: Repository;
  procore?: ProcoreClient;
}

const lotStatusSchema = z.enum(['open', 'work_complete', 'conformed', 'closed', 'superseded']);

/**
 * Tiny self-closing page the OAuth popup lands on after /auth/procore/callback
 * finishes, for the embedded-app connect flow. Procore's own login page
 * refuses to render inside an iframe, so the "Connect to Procore" button
 * in the embedded app opens the whole OAuth round trip in a popup instead
 * of navigating the iframe; this page hands the result back to the iframe
 * via postMessage (same-origin only) and closes itself. The iframe app
 * (web/src/App.tsx) listens for this message and refreshes its connection
 * status — no page reload, no ever navigating the embedded iframe away
 * from Procore's own chrome.
 */
function popupCloseHtml({ ok, message }: { ok: boolean; message?: string }): string {
  const payload = JSON.stringify({ source: 'openlot-oauth', ok, message: message ?? null });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Procore connection</title></head>
<body style="font:14px -apple-system,Segoe UI,sans-serif;padding:2rem;color:#1e2b37">
<p>${ok ? 'Connected. This window will close automatically…' : `Connection failed: ${message ?? 'unknown error'}`}</p>
<script>
  (function () {
    var payload = ${payload};
    if (window.opener) {
      try { window.opener.postMessage(payload, window.location.origin); } catch (e) {}
    }
    setTimeout(function () { window.close(); }, 1200);
  })();
</script>
</body></html>`;
}

export function buildApp({ config, repo, procore }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });
  const client = procore ?? new ProcoreClient(config, repo);
  const lots = new LotService(repo);
  const claims = new ClaimService(repo);
  const sync = new SyncService(repo, client);
  const reporting = new ReportingService(client);

  void app.register(cors, { origin: true, credentials: true });
  void app.register(cookie);
  // No @fastify/helmet or other X-Frame-Options/CSP frame-ancestors header
  // is set here — deliberately, so Procore can embed this app in its
  // iframe (see docs/reporting-app.md, "Embedded app support"). If you add
  // helmet later, its defaults set X-Frame-Options: SAMEORIGIN, which
  // would silently break the embedded launch — scope any CSP
  // frame-ancestors to Procore's domains instead of disabling embedding.

  // Serve the built web UI when present (single-container/single-service
  // deployment, e.g. Render, Docker). This file compiles to
  // dist/src/server.js (tsconfig's rootDir is the project root, so the
  // output mirrors src/ under dist/src/), and the built frontend lives at
  // web/dist — a sibling of dist/, not a child of it. So from
  // dist/src/server.js this needs TWO levels up (dist/src -> dist ->
  // project root) before descending into web/dist. Confirmed against the
  // Dockerfile, which copies the frontend build to /app/web/dist
  // alongside /app/dist — a single '../web/dist' here previously resolved
  // to dist/web/dist, which never exists, so the web UI silently never
  // got served in any real single-process deployment (this was
  // undetected until an actual deploy was attempted).
  const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    void app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/webhooks')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof LotServiceError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
    }
    app.log.error(err);
    const e = err as { statusCode?: number; message?: string };
    const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
    return reply.code(status).send({ error: status === 500 ? 'Internal server error' : e.message ?? 'Error' });
  });

  /* ---- Health & meta ------------------------------------------------ */

  app.get('/api/health', async () => ({ status: 'ok', version: '1.0.0', demoMode: config.DEMO_MODE }));
  app.get('/api/work-types', async () => WORK_TYPES);

  app.get('/api/connection', async () => {
    const conn = await repo.getConnection();
    if (!conn) return { connected: false };
    return {
      connected: true,
      companyId: conn.companyId,
      companyName: conn.companyName,
      tokenExpiresAt: conn.expiresAt
    };
  });

  /* ---- OAuth (Authorization Code) ----------------------------------- */

  app.get('/auth/procore', async (req, reply) => {
    const state = randomBytes(16).toString('hex');
    reply.setCookie('openlot_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.APP_BASE_URL.startsWith('https'),
      maxAge: 600,
      path: '/'
    });
    // Embedded launch (Procore's iframe) can't render Procore's own login
    // page inside an iframe, so the "Connect to Procore" button in that
    // context opens this route in a popup window instead of navigating the
    // iframe. Remember that so the callback can close the popup and notify
    // the iframe via postMessage rather than redirecting a window nobody
    // is looking at (see /auth/procore/callback below).
    const { popup } = z.object({ popup: z.string().optional() }).parse(req.query);
    if (popup === '1') {
      reply.setCookie('openlot_oauth_popup', '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.APP_BASE_URL.startsWith('https'),
        maxAge: 600,
        path: '/'
      });
    }
    return reply.redirect(client.authorizeUrl(state));
  });

  app.get('/auth/procore/callback', async (req, reply) => {
    const q = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    if (q.state !== req.cookies['openlot_oauth_state']) {
      return reply.code(403).send({ error: 'OAuth state mismatch — restart the connection from /auth/procore.' });
    }
    const isPopup = req.cookies['openlot_oauth_popup'] === '1';
    reply.clearCookie('openlot_oauth_popup', { path: '/' });

    const tokens = await client.exchangeCode(q.code);
    // Resolve the company: configured id, or the only company on the token.
    // Store tokens temporarily (unscoped) so listCompanies can authenticate.
    await client.storeTokens(tokens, config.PROCORE_COMPANY_ID ?? 0, 'pending');
    const companies = await client.listCompanies();
    const company = config.PROCORE_COMPANY_ID
      ? companies.find((c) => c.id === config.PROCORE_COMPANY_ID)
      : companies[0];
    if (!company) {
      const message = `No accessible Procore company found${config.PROCORE_COMPANY_ID ? ` with id ${config.PROCORE_COMPANY_ID}` : ''}.`;
      if (isPopup) return reply.type('text/html').send(popupCloseHtml({ ok: false, message }));
      return reply.code(400).send({ error: message });
    }
    await client.storeTokens(tokens, company.id, company.name);
    if (isPopup) return reply.type('text/html').send(popupCloseHtml({ ok: true }));
    return reply.redirect('/?connected=1');
  });

  app.get('/api/projects', async () => {
    const conn = await repo.getConnection();
    if (!conn) throw new LotServiceError('Not connected to Procore', 409);
    return client.listProjects(conn.companyId);
  });

  /* ---- Lots ---------------------------------------------------------- */

  const projectParams = z.object({ projectId: z.coerce.number().int().positive() });
  const lotParams = projectParams.extend({ lotId: z.string() });

  app.get('/api/projects/:projectId/lots', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    const q = z
      .object({ status: lotStatusSchema.optional(), workType: z.string().optional() })
      .parse(req.query);
    return lots.list(projectId, q);
  });

  app.post('/api/projects/:projectId/lots', async (req, reply) => {
    const { projectId } = projectParams.parse(req.params);
    const body = z
      .object({
        workType: z.string().min(2).max(2),
        description: z.string().min(1),
        specReference: z.string().nullish(),
        costCode: z.string().nullish(),
        quantity: z.number().nullish(),
        uom: z.string().nullish(),
        openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        paymentItemNumber: z.string().nullish(),
        geoStart: z.string().nullish(),
        geoEnd: z.string().nullish(),
        geoDatum: z.string().nullish(),
        builder: z.string().nullish(),
        stage: z.string().nullish(),
        owner: z.string().nullish(),
        notes: z.string().nullish(),
        createdBy: z.string().nullish(),
        sequence: z.number().int().positive().max(9999).optional()
      })
      .parse(req.body);
    const lot = await lots.create({ projectId, ...body });
    return reply.code(201).send(lot);
  });

  app.get('/api/projects/:projectId/lots/:lotId', async (req) => {
    const { projectId, lotId } = lotParams.parse(req.params);
    const [lot, inspections, ncrs, tests, quantities, claimedIn, history] = await Promise.all([
      lots.get(projectId, lotId),
      repo.listInspections(projectId, lotId),
      repo.listNcrs(projectId, lotId),
      repo.listTests(projectId, lotId),
      repo.listQuantities(projectId, lotId),
      repo.lotClaimedIn(lotId),
      repo.listHistory(projectId, lotId)
    ]);
    return { lot, inspections, ncrs, tests, quantities, claimedIn, history };
  });

  app.get('/api/projects/:projectId/lots/:lotId/history', async (req) => {
    const { projectId, lotId } = lotParams.parse(req.params);
    return lots.listHistory(projectId, lotId);
  });

  app.get('/api/projects/:projectId/lots/:lotId/evaluation', async (req) => {
    const { projectId, lotId } = lotParams.parse(req.params);
    return lots.evaluate(projectId, lotId);
  });

  app.post('/api/projects/:projectId/lots/:lotId/transition', async (req) => {
    const { projectId, lotId } = lotParams.parse(req.params);
    const body = z
      .object({
        to: lotStatusSchema,
        supersededBy: z.string().optional(),
        actor: z.string().optional()
      })
      .parse(req.body);
    return lots.transition(projectId, lotId, body.to as LotStatus, body);
  });

  app.post('/api/projects/:projectId/lots/:lotId/hold-point', async (req) => {
    const { projectId, lotId } = lotParams.parse(req.params);
    const body = z.object({ released: z.boolean(), actor: z.string().optional() }).parse(req.body);
    return lots.releaseHoldPoint(projectId, lotId, body.released, body.actor);
  });

  app.patch('/api/projects/:projectId/lots/:lotId', async (req) => {
    const { projectId, lotId } = lotParams.parse(req.params);
    const body = z
      .object({
        description: z.string().min(1).optional(),
        specReference: z.string().nullish(),
        costCode: z.string().nullish(),
        quantity: z.number().nullish(),
        uom: z.string().nullish(),
        paymentItemNumber: z.string().nullish(),
        geoStart: z.string().nullish(),
        geoEnd: z.string().nullish(),
        geoDatum: z.string().nullish(),
        builder: z.string().nullish(),
        stage: z.string().nullish(),
        owner: z.string().nullish(),
        notes: z.string().nullish(),
        actor: z.string().optional()
      })
      .parse(req.body);
    const { actor, ...fields } = body;
    return lots.update(projectId, lotId, fields, actor);
  });

  app.post('/api/projects/:projectId/lots/:lotId/tests', async (req, reply) => {
    const { projectId, lotId } = lotParams.parse(req.params);
    const body = z
      .object({ testType: z.string().min(1), labReference: z.string().nullish(), notes: z.string().nullish() })
      .parse(req.body);
    return reply.code(201).send(await lots.addTest(projectId, lotId, body));
  });

  app.patch('/api/tests/:testId', async (req) => {
    const { testId } = z.object({ testId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        status: z.enum(['requested', 'sampled', 'results_received', 'passed', 'failed']),
        labReference: z.string().nullish(),
        documentUrl: z.string().url().nullish(),
        notes: z.string().nullish()
      })
      .parse(req.body);
    return lots.updateTestStatus(testId, body.status, body);
  });

  /* ---- Claims -------------------------------------------------------- */

  app.get('/api/projects/:projectId/claims', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    return claims.listPeriods(projectId);
  });

  app.post('/api/projects/:projectId/claims', async (req, reply) => {
    const { projectId } = projectParams.parse(req.params);
    const body = z
      .object({
        label: z.string().min(1),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        createdBy: z.string().nullish()
      })
      .parse(req.body);
    return reply.code(201).send(await claims.createPeriod({ projectId, ...body }));
  });

  const claimParams = projectParams.extend({ claimId: z.string().uuid() });

  app.get('/api/projects/:projectId/claims/:claimId/claimable', async (req) => {
    const { projectId, claimId } = claimParams.parse(req.params);
    return claims.claimableLots(projectId, claimId);
  });

  app.get('/api/projects/:projectId/claims/:claimId/lines', async (req) => {
    const { claimId } = claimParams.parse(req.params);
    return claims.extractRows(claimId);
  });

  app.post('/api/projects/:projectId/claims/:claimId/lots', async (req, reply) => {
    const { projectId, claimId } = claimParams.parse(req.params);
    const body = z.object({ lotId: z.string(), actor: z.string().optional() }).parse(req.body);
    return reply.code(201).send(await claims.addLot(projectId, claimId, body.lotId, body.actor));
  });

  app.post('/api/projects/:projectId/claims/:claimId/add-all-conformed', async (req) => {
    const { projectId, claimId } = claimParams.parse(req.params);
    const body = z.object({ actor: z.string().optional() }).parse(req.body ?? {});
    return claims.addAllConformedInPeriod(projectId, claimId, body.actor);
  });

  app.post('/api/projects/:projectId/claims/:claimId/issue', async (req) => {
    const { claimId } = claimParams.parse(req.params);
    const body = z.object({ actor: z.string().optional() }).parse(req.body ?? {});
    return claims.issuePeriod(claimId, body.actor);
  });

  app.get('/api/projects/:projectId/claims/:claimId/extract.csv', async (req, reply) => {
    const { claimId } = claimParams.parse(req.params);
    const csv = await claims.extractCsv(claimId);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="claim-${claimId}.csv"`)
      .send(csv);
  });

  app.get('/api/projects/:projectId/claims/:claimId/extract.html', async (req, reply) => {
    const { claimId } = claimParams.parse(req.params);
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(await claims.extractHtml(claimId));
  });

  /* ---- Reports (cross-tool reporting dashboard) ------------------------
   * Read live from Procore on every request — see src/services/reporting.ts
   * for why there's no caching/schema here. Requires an active Procore
   * connection (unlike the lot register, which also works in demo mode). */

  async function requireProcoreConnection(): Promise<void> {
    const conn = await repo.getConnection();
    if (!conn) {
      throw new LotServiceError('Not connected to Procore. Complete the OAuth flow at /auth/procore first.', 409);
    }
  }

  app.get('/api/projects/:projectId/reports/quality-safety', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await requireProcoreConnection();
    return reporting.qualitySafety(projectId);
  });

  app.get('/api/projects/:projectId/reports/field-productivity', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await requireProcoreConnection();
    return reporting.fieldProductivity(projectId);
  });

  app.get('/api/projects/:projectId/reports/project-controls', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await requireProcoreConnection();
    return reporting.projectControls(projectId);
  });

  app.get('/api/projects/:projectId/reports/summary', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await requireProcoreConnection();
    const [qualitySafety, fieldProductivity, projectControls] = await Promise.all([
      reporting.qualitySafety(projectId),
      reporting.fieldProductivity(projectId),
      reporting.projectControls(projectId)
    ]);
    return { qualitySafety, fieldProductivity, projectControls };
  });

  /* ---- Sync & webhooks ------------------------------------------------ */

  app.post('/api/projects/:projectId/sync', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    return sync.fullSync(projectId);
  });

  app.post('/api/webhooks/register', async () => {
    const conn = await repo.getConnection();
    if (!conn) throw new LotServiceError('Not connected to Procore', 409);
    return sync.registerWebhooks(conn.companyId);
  });

  app.get('/api/webhooks/events', async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    return repo.listWebhookEvents(q.limit);
  });

  app.post('/webhooks/procore', async (req, reply) => {
    if (config.WEBHOOK_SHARED_SECRET) {
      const provided = req.headers['x-openlot-webhook-secret'];
      if (provided !== config.WEBHOOK_SHARED_SECRET) {
        return reply.code(401).send({ error: 'Invalid webhook secret' });
      }
    }
    const payload = z
      .object({
        resource_name: z.string(),
        event_type: z.string(),
        resource_id: z.coerce.number(),
        project_id: z.coerce.number().nullable().default(null),
        company_id: z.coerce.number().optional(),
        timestamp: z.string().optional()
      })
      .parse(req.body) as ProcoreWebhookPayload;
    // Acknowledge fast; Procore retries on non-2xx. Processing is awaited
    // here because a single fetch is quick; move to a queue at scale.
    const outcome = await sync.handleWebhook(payload);
    return reply.code(200).send({ outcome });
  });

  return app;
}
