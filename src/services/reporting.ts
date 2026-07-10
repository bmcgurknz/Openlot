import type {
  ProcoreClient,
  ProcoreIncident,
  ProcoreInspection,
  ProcoreObservation,
  ProcorePunchItem,
  ProcoreQuantityLog,
  ProcoreRfi,
  ProcoreSubmittal
} from '../procore/client.js';
import type { ReportItem, ReportSummary, ReportToolResult } from '../types.js';

/**
 * Cross-tool reporting dashboard — the "reporting mechanism" layer.
 *
 * Deliberately different from LotService/SyncService: it reads live from
 * Procore on every request rather than storing a projection, because the
 * whole point is to reflect exactly what's already in Procore's tools —
 * not maintain a second, potentially-stale copy of Inspections/RFIs/etc.
 * See docs/reporting-app.md for the reasoning and the future path to
 * caching if/when live-pull latency becomes a problem at scale.
 *
 * Every Procore tool is fetched independently via `pull()`/`budgetTool()`
 * and wrapped in try/catch, so one endpoint that needs adjusting for your
 * Procore API version (see the version note atop src/procore/client.ts)
 * shows up as a single failed section with its error message, not a
 * broken dashboard. Paths and field names were verified 2026-07-10
 * against the combined public+private Procore OpenAPI spec — see
 * CHANGELOG 1.4.0 and docs/reporting-app.md §1 for what was wrong in the
 * first draft and got fixed. The one thing that spec can't confirm is the
 * `webUrl()` deep-link paths (it documents the REST API, not the web app),
 * so those remain best-guess.
 */
export class ReportingService {
  constructor(private procore: ProcoreClient) {}

  async qualitySafety(projectId: number): Promise<ReportSummary> {
    const tools = await Promise.all([
      this.pull('Inspections', () => this.procore.listInspections(projectId), (i: ProcoreInspection) => ({
        id: `inspection:${i.id}`,
        tool: 'Inspections',
        title: i.name,
        status: i.status,
        date: i.inspection_date,
        procoreUrl: this.procore.webUrl(projectId, 'checklist/lists', i.id),
        detail: i.list_template_name ?? null
      })),
      this.pull('Observations', () => this.procore.listObservations(projectId), (o: ProcoreObservation) => ({
        id: `observation:${o.id}`,
        tool: 'Observations',
        title: o.name,
        status: o.status,
        date: o.due_date ?? o.created_at,
        procoreUrl: this.procore.webUrl(projectId, 'observations/items', o.id),
        detail: o.type?.name ?? null
      })),
      this.pull('Incidents', () => this.procore.listIncidents(projectId), (i: ProcoreIncident) => ({
        id: `incident:${i.id}`,
        tool: 'Incidents',
        title: i.title ?? (i.number != null ? `Incident #${i.number}` : `Incident #${i.id}`),
        status: i.status,
        date: i.event_date ?? null,
        procoreUrl: this.procore.webUrl(projectId, 'incidents', i.id),
        detail: i.recordable ? 'Recordable' : null
      }))
    ]);
    return this.summarize('quality_safety', projectId, tools);
  }

  async fieldProductivity(projectId: number): Promise<ReportSummary> {
    const tools = await Promise.all([
      this.pull('Punch List', () => this.procore.listPunchItems(projectId), (p: ProcorePunchItem) => ({
        id: `punch:${p.id}`,
        tool: 'Punch List',
        title: p.name ?? `Punch item #${p.id}`,
        status: p.status,
        date: p.due_date ?? null,
        procoreUrl: this.procore.webUrl(projectId, 'punch_items', p.id),
        detail: p.assignees?.length ? p.assignees.map((a) => a.name).join(', ') : null
      })),
      this.pull(
        'Daily Log — Quantities',
        () => this.procore.listQuantityLogs(projectId),
        (q: ProcoreQuantityLog) => ({
          id: `quantity:${q.id}`,
          tool: 'Daily Log — Quantities',
          title: `${q.quantity} ${q.unit}${q.cost_code ? ` (${q.cost_code.name})` : ''}`,
          status: null,
          date: q.date,
          // Daily Log entries have no documented per-record deep link — this
          // resolves to the tool's list page (see webUrl()'s fallback).
          procoreUrl: this.procore.webUrl(projectId, 'daily_log'),
          detail: q.description
        })
      )
      // Photos deliberately out of scope for v1 — the Photos API is keyed
      // off individual daily logs/albums rather than one project-level
      // list call, so it needs its own iteration strategy. See
      // docs/reporting-app.md "Not yet built" for the follow-up.
    ]);
    return this.summarize('field_productivity', projectId, tools);
  }

  async projectControls(projectId: number): Promise<ReportSummary> {
    const tools = await Promise.all([
      this.pull('RFIs', () => this.procore.listRfis(projectId), (r: ProcoreRfi) => ({
        id: `rfi:${r.id}`,
        tool: 'RFIs',
        title: r.number ? `#${r.number} — ${r.subject}` : r.subject,
        status: r.status,
        date: r.due_date ?? null,
        procoreUrl: this.procore.webUrl(projectId, 'rfi', r.id),
        detail: r.ball_in_courts?.length ? r.ball_in_courts.map((p) => p.name).join(', ') : null
      })),
      this.pull('Submittals', () => this.procore.listSubmittals(projectId), (s: ProcoreSubmittal) => ({
        id: `submittal:${s.id}`,
        tool: 'Submittals',
        title: s.number ? `#${s.number} — ${s.title}` : s.title,
        // status is an object ({id, name, status}) — `name` is the workflow
        // step (e.g. "In Review", "Approved"), which is what Procore's own
        // Submittal Log shows as the status column.
        status: s.status?.name ?? s.status?.status ?? null,
        date: s.due_date ?? null,
        procoreUrl: this.procore.webUrl(projectId, 'submittals', s.id),
        detail: s.submittal_manager?.name ?? null
      })),
      this.budgetTool(projectId)
      // Change Orders deliberately out of scope for v1 — Commitment Change
      // Order Line Items are nested under individual Commitments, which
      // means enumerating commitments first (a 3rd fetch level). See
      // docs/reporting-app.md "Not yet built" for the follow-up.
    ]);
    return this.summarize('project_controls', projectId, tools);
  }

  /**
   * Budget is a two-step fetch (list the project's budget views, then
   * pull one view's detail rows) so it doesn't fit `pull()`'s single-call
   * shape. Uses the first budget view returned — most projects only have
   * one "Budget" view; if yours has several, this is the spot to add a
   * view-selector rather than guessing which one to show.
   */
  private async budgetTool(projectId: number): Promise<ReportToolResult> {
    try {
      const views = await this.procore.listBudgetViews(projectId);
      const primary = views[0];
      if (!primary) return { tool: 'Budget', ok: true, error: null, items: [] };
      const rows = await this.procore.listBudgetDetailRows(primary.id, projectId);
      // cost_code is a plain string on this resource (not an object), and
      // there is no computed "projected over/under" field on a detail row —
      // those are view-configurable columns Procore computes elsewhere, not
      // fixed row data. Show only what's actually on the row: the cost code,
      // the original budget amount, and the forecast amount if set.
      const items: ReportItem[] = rows.map((r, i) => ({
        id: `budget:${primary.id}:${i}`,
        tool: 'Budget',
        title: r.cost_code ?? `Line ${i + 1}`,
        status: null,
        date: null,
        procoreUrl: this.procore.webUrl(projectId, 'budgeting'),
        detail:
          r.original_budget_amount != null
            ? `Original budget: ${r.original_budget_amount}${r.budget_forecast?.amount ? ` • Forecast: ${r.budget_forecast.amount}` : ''}`
            : null
      }));
      return { tool: 'Budget', ok: true, error: null, items };
    } catch (err) {
      return { tool: 'Budget', ok: false, error: err instanceof Error ? err.message : 'Budget fetch failed', items: [] };
    }
  }

  private async pull<T>(
    tool: string,
    fetcher: () => Promise<T[]>,
    mapper: (record: T) => ReportItem
  ): Promise<ReportToolResult> {
    try {
      const records = await fetcher();
      return { tool, ok: true, error: null, items: records.map(mapper) };
    } catch (err) {
      return { tool, ok: false, error: err instanceof Error ? err.message : 'Fetch failed', items: [] };
    }
  }

  private summarize(
    category: ReportSummary['category'],
    projectId: number,
    tools: ReportToolResult[]
  ): ReportSummary {
    return { category, projectId, generatedAt: new Date().toISOString(), tools };
  }
}
