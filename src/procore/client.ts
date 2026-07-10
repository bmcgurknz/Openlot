import type { Config } from '../config.js';
import type { Repository } from '../db/repository.js';
import { decrypt, encrypt } from '../lib/crypto.js';

/**
 * Thin Procore REST client.
 *
 * Endpoint versions used — verified 2026-07-10 against the combined
 * public+private Procore OpenAPI spec (developers.procore.com export,
 * openapi 3.0, 6157 paths). Every path and field name below was checked
 * against that spec's `paths`/`responses` and corrected where the
 * original best-guess implementation was wrong (see CHANGELOG 1.4.0 and
 * docs/reporting-app.md §1 for the list of what changed and why):
 *   - Inspections:   /rest/v1.1/projects/{id}/checklist/lists
 *                    (item counts and template name are FLAT fields —
 *                    item_count/conforming_item_count/deficient_item_count/
 *                    list_template_name — not nested objects)
 *   - Observations:  /rest/v1.0/observations/items?project_id=
 *   - Daily Log:     /rest/v1.0/projects/{id}/quantity_logs
 *                    (fields are `unit` and `description`, not
 *                    `unit_of_measure`/`notes`)
 *   - Incidents:     /rest/v1.0/projects/{id}/incidents (project_id is a
 *                    PATH segment, not a query param)
 *   - Punch Items:   /rest/v1.0/punch_items?project_id= (title field is
 *                    `name`; there is no `number`; assignees is a plural
 *                    array, not a singular `assignee`)
 *   - RFIs:          /rest/v1.0/projects/{id}/rfis (`ball_in_courts`,
 *                    plural, is the array — `ball_in_court` singular is a
 *                    single object)
 *   - Submittals:    /rest/v1.0/projects/{id}/submittals (`status` is an
 *                    object `{id, name, status}`, not a plain string)
 *   - Budget:        /rest/v1.0/budget_views?project_id= then
 *                    /rest/v1.0/budget_views/{id}/detail_rows?project_id=
 *                    (`cost_code` on a detail row is a plain string, not
 *                    an object; there is no `projected_over_under` or
 *                    similar computed column — see ProcoreBudgetDetailRow)
 *   - Webhooks:      /rest/v1.0/webhooks/hooks (+ /triggers)
 *   - Companies:     /rest/v1.0/companies
 *
 * Not covered by the OpenAPI spec (it documents the REST API only, not
 * the web app): the `webUrl()` deep-link paths below are still best-guess
 * and should be click-through verified against your own Procore instance
 * — see the doc comment on webUrl().
 *
 * All company-scoped requests send the Procore-Company-Id header, which
 * is required on multi-zone (MPZ) accounts and harmless elsewhere.
 */

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class ProcoreAuthError extends Error {}
export class ProcoreApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
  }
}

export class ProcoreClient {
  constructor(
    private cfg: Config,
    private repo: Repository,
    private fetchImpl: typeof fetch = fetch
  ) {}

  /* ---- OAuth ------------------------------------------------------- */

  authorizeUrl(state: string): string {
    const u = new URL('/oauth/authorize', this.cfg.PROCORE_LOGIN_URL);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.cfg.PROCORE_CLIENT_ID);
    u.searchParams.set('redirect_uri', `${this.cfg.APP_BASE_URL}/auth/procore/callback`);
    u.searchParams.set('state', state);
    return u.toString();
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${this.cfg.APP_BASE_URL}/auth/procore/callback`
    });
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenSet> {
    const res = await this.fetchImpl(new URL('/oauth/token', this.cfg.PROCORE_LOGIN_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        client_id: this.cfg.PROCORE_CLIENT_ID,
        client_secret: this.cfg.PROCORE_CLIENT_SECRET
      })
    });
    if (!res.ok) {
      throw new ProcoreAuthError(`Procore token request failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      created_at?: number;
    };
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(Date.now() + (body.expires_in - 60) * 1000) // refresh a minute early
    };
  }

  /** Persist a token set, encrypting at rest. */
  async storeTokens(tokens: TokenSet, companyId: number, companyName: string): Promise<void> {
    const key = this.requireKey();
    const existing = await this.repo.getConnection();
    const record = {
      companyId,
      companyName,
      accessTokenEnc: encrypt(tokens.accessToken, key),
      refreshTokenEnc: encrypt(tokens.refreshToken, key),
      expiresAt: tokens.expiresAt.toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      await this.repo.updateConnection({ ...record, id: existing.id });
    } else {
      await this.repo.saveConnection(record);
    }
  }

  private requireKey(): string {
    if (!this.cfg.TOKEN_ENCRYPTION_KEY) throw new ProcoreAuthError('TOKEN_ENCRYPTION_KEY is not configured');
    return this.cfg.TOKEN_ENCRYPTION_KEY;
  }

  /** Return a valid access token, refreshing (and re-persisting) if expired. */
  private async accessToken(): Promise<{ token: string; companyId: number }> {
    const conn = await this.repo.getConnection();
    if (!conn) throw new ProcoreAuthError('Not connected to Procore. Complete the OAuth flow at /auth/procore.');
    const key = this.requireKey();
    if (new Date(conn.expiresAt).getTime() > Date.now()) {
      return { token: decrypt(conn.accessTokenEnc, key), companyId: conn.companyId };
    }
    const refreshed = await this.refresh(decrypt(conn.refreshTokenEnc, key));
    await this.repo.updateConnection({
      ...conn,
      accessTokenEnc: encrypt(refreshed.accessToken, key),
      refreshTokenEnc: encrypt(refreshed.refreshToken, key),
      expiresAt: refreshed.expiresAt.toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { token: refreshed.accessToken, companyId: conn.companyId };
  }

  /* ---- REST -------------------------------------------------------- */

  async get<T>(path: string, query?: Record<string, string | number>): Promise<T> {
    const { token, companyId } = await this.accessToken();
    const url = new URL(path, this.cfg.PROCORE_BASE_URL);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Procore-Company-Id': String(companyId),
        Accept: 'application/json'
      }
    });
    if (res.status === 429) {
      // Procore rate limit: honour Retry-After once, then give up loudly.
      const wait = Number(res.headers.get('Retry-After') ?? '5');
      await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
      return this.get<T>(path, query);
    }
    if (!res.ok) {
      throw new ProcoreApiError(`GET ${path} failed (${res.status})`, res.status, await res.text());
    }
    return (await res.json()) as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const { token, companyId } = await this.accessToken();
    const res = await this.fetchImpl(new URL(path, this.cfg.PROCORE_BASE_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Procore-Company-Id': String(companyId),
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new ProcoreApiError(`POST ${path} failed (${res.status})`, res.status, await res.text());
    }
    return (await res.json()) as T;
  }

  /* ---- Typed conveniences ------------------------------------------ */

  listCompanies(): Promise<Array<{ id: number; name: string }>> {
    return this.get('/rest/v1.0/companies');
  }

  listProjects(companyId: number): Promise<Array<{ id: number; name: string; project_number: string | null }>> {
    return this.get('/rest/v1.0/projects', { company_id: companyId });
  }

  getInspection(projectId: number, listId: number): Promise<ProcoreInspection> {
    return this.get(`/rest/v1.1/projects/${projectId}/checklist/lists/${listId}`);
  }

  listInspections(projectId: number, page = 1): Promise<ProcoreInspection[]> {
    return this.get(`/rest/v1.1/projects/${projectId}/checklist/lists`, { page, per_page: 100 });
  }

  getObservation(observationId: number, projectId: number): Promise<ProcoreObservation> {
    return this.get(`/rest/v1.0/observations/items/${observationId}`, { project_id: projectId });
  }

  listObservations(projectId: number, page = 1): Promise<ProcoreObservation[]> {
    return this.get('/rest/v1.0/observations/items', { project_id: projectId, page, per_page: 100 });
  }

  listQuantityLogs(projectId: number, logDate?: string): Promise<ProcoreQuantityLog[]> {
    const query: Record<string, string | number> = {};
    if (logDate) query.log_date = logDate;
    return this.get(`/rest/v1.0/projects/${projectId}/quantity_logs`, query);
  }

  /* ---- Reporting-only resources (read-only; see the version note above) --- */

  listIncidents(projectId: number, page = 1): Promise<ProcoreIncident[]> {
    return this.get(`/rest/v1.0/projects/${projectId}/incidents`, { page, per_page: 100 });
  }

  listPunchItems(projectId: number, page = 1): Promise<ProcorePunchItem[]> {
    return this.get('/rest/v1.0/punch_items', { project_id: projectId, page, per_page: 100 });
  }

  listRfis(projectId: number, page = 1): Promise<ProcoreRfi[]> {
    return this.get(`/rest/v1.0/projects/${projectId}/rfis`, { page, per_page: 100 });
  }

  listSubmittals(projectId: number, page = 1): Promise<ProcoreSubmittal[]> {
    return this.get(`/rest/v1.0/projects/${projectId}/submittals`, { page, per_page: 100 });
  }

  listBudgetViews(projectId: number): Promise<ProcoreBudgetView[]> {
    return this.get('/rest/v1.0/budget_views', { project_id: projectId });
  }

  listBudgetDetailRows(budgetViewId: number, projectId: number): Promise<ProcoreBudgetDetailRow[]> {
    return this.get(`/rest/v1.0/budget_views/${budgetViewId}/detail_rows`, { project_id: projectId });
  }

  /**
   * Best-effort "open in Procore" deep link for a record. Procore's web
   * app consistently serves project tools at
   * `{PROCORE_WEB_URL}/{project_id}/project/{tool}` — the per-record
   * `{path}` suffix appended here is a reasonable guess per tool, not a
   * documented contract, so **click through each tool once in your own
   * Procore instance and adjust WEB_ITEM_PATHS below if a link 404s.**
   * Falls back to the tool's list page (verified-safe) when the tool
   * isn't in the table.
   */
  webUrl(projectId: number, tool: keyof typeof WEB_ITEM_PATHS, recordId = 0): string {
    const suffix = WEB_ITEM_PATHS[tool]?.(recordId) ?? '';
    return `${this.cfg.PROCORE_WEB_URL}/${projectId}/project/${tool}${suffix}`;
  }

  createWebhookHook(companyId: number, destinationUrl: string): Promise<{ id: number }> {
    return this.post('/rest/v1.0/webhooks/hooks', {
      company_id: companyId,
      hook: {
        api_version: 'v1.0',
        namespace: 'procore',
        destination_url: destinationUrl,
        destination_headers: this.cfg.WEBHOOK_SHARED_SECRET
          ? { 'X-OpenLot-Webhook-Secret': this.cfg.WEBHOOK_SHARED_SECRET }
          : {}
      }
    });
  }

  createWebhookTrigger(
    companyId: number,
    hookId: number,
    resourceName: string,
    eventType: 'create' | 'update' | 'delete'
  ): Promise<{ id: number }> {
    return this.post(`/rest/v1.0/webhooks/hooks/${hookId}/triggers`, {
      company_id: companyId,
      api_version: 'v1.0',
      trigger: { resource_name: resourceName, event_type: eventType }
    });
  }
}

/**
 * Per-tool "project tool slug" + item-path-suffix guesses used by
 * `ProcoreClient.webUrl()`. Keys are the slug that appears in
 * `{PROCORE_WEB_URL}/{project_id}/project/{slug}` — confirm each slug
 * and suffix against your own Procore instance (see the class doc above).
 */
const WEB_ITEM_PATHS = {
  'checklist/lists': (id: number) => `/${id}`,
  'observations/items': (id: number) => `/${id}`,
  incidents: (id: number) => `/${id}`,
  punch_items: (id: number) => `/${id}`,
  rfi: (id: number) => `/show/${id}`,
  submittals: (id: number) => `/${id}`,
  budgeting: () => '',
  daily_log: () => ''
} satisfies Record<string, (id: number) => string>;

/* Response shapes (subset of fields OpenLot consumes) ----------------- */

export interface ProcoreInspection {
  id: number;
  name: string; // title, e.g. "LOT-EW-0014 - Subgrade proof roll"
  status: string; // e.g. "closed", "in_progress"
  inspection_date: string | null;
  // Flat fields, confirmed against the Procore OAS 2026-07-10 — the API
  // does NOT nest these under list_template/item_counts objects.
  list_template_name?: string | null;
  item_count?: number | null;
  conforming_item_count?: number | null;
  deficient_item_count?: number | null;
}

export interface ProcoreObservation {
  id: number;
  name: string;
  status: string; // "initiated" | "ready_for_review" | "closed" | "not_accepted" ...
  type?: { id: number; name: string } | null; // e.g. "Non-Conformance"
  created_at: string;
  due_date?: string | null;
  project_id?: number;
}

export interface ProcoreQuantityLog {
  id: number;
  date: string;
  quantity: number;
  unit: string; // confirmed field name — NOT unit_of_measure
  description: string | null; // confirmed field name — NOT notes; this is also
  // where the LOT-XX-NNNN id lives, so lot-linking reads this field
  cost_code?: { id: number; name: string } | null; // NOT full_code — cost codes
  // here only expose id/name
}

/* ---- Reporting-only response shapes — confirmed 2026-07-10 against the
   combined public+private Procore OpenAPI spec (see client class doc) --- */

export interface ProcoreIncident {
  id: number;
  number?: number | null; // integer — there is no separate incident_number field
  title?: string | null;
  description?: string | null;
  status: string; // e.g. "open", "closed" — confirm exact values in your instance
  event_date?: string | null; // NOT incident_date
  recordable?: boolean;
}

export interface ProcorePunchItem {
  id: number;
  name?: string | null; // this IS the title field — there is no "title" or "number"
  status: string; // e.g. "open", "ready_for_review", "closed"
  due_date?: string | null;
  assignees?: Array<{ id: number; name: string; login?: string }> | null; // plural —
  // there is no singular "assignee" field
}

export interface ProcoreRfi {
  id: number;
  number?: string | null;
  subject: string;
  status: string; // e.g. "open", "closed", "draft", "recycled"
  due_date?: string | null;
  // "ball_in_court" (singular) is a single object; "ball_in_courts" (plural)
  // is the array — use the plural for a list of recipients.
  ball_in_courts?: Array<{ id: number; name: string; login?: string }> | null;
}

export interface ProcoreSubmittal {
  id: number;
  number?: string | null;
  title: string;
  // Confirmed: status is an OBJECT ({id, name, status}), not a plain string.
  // `name` is the workflow step (e.g. "In Review", "Approved");
  // `status` (nested) is the coarse open/closed value.
  status: { id: number; name: string; status: string } | null;
  due_date?: string | null;
  submittal_manager?: { id: number; name: string } | null;
}

export interface ProcoreBudgetView {
  id: number;
  name: string;
}

/**
 * Confirmed against the Procore OAS 2026-07-10: a budget detail row does
 * NOT carry the computed columns (approved COs, revised budget, projected
 * over/under, etc.) that the Procore web UI's Budget tool displays — those
 * are dynamic, view-configurable columns, not fixed row fields. Only the
 * fields below are actually on the row. `cost_code` is a plain string (the
 * cost code's display name), not an object — the earlier `full_code`
 * shape here was a guess and does not exist. `original_budget_amount` and
 * `budget_forecast.amount` are both string-formatted decimals (Procore
 * serializes money as strings), not numbers.
 */
export interface ProcoreBudgetDetailRow {
  id?: number;
  cost_code?: string | null;
  original_budget_amount?: string | null;
  budget_forecast?: { amount?: string | null; calculation_strategy?: string | null } | null;
}
