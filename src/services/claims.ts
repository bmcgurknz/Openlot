import { randomUUID } from '../lib/uuid.js';
import type { Repository } from '../db/repository.js';
import { LotServiceError } from './lots.js';
import type { ClaimLine, ClaimPeriod, Lot } from '../types.js';

/** Records claim-lifecycle events (add / issue) into the per-lot history trail. */
async function recordClaimHistory(
  repo: Repository,
  projectId: number,
  lotId: string,
  actor: string | undefined,
  previousValue: string | null,
  newValue: string | null
): Promise<void> {
  await repo.appendHistory({
    id: randomUUID(),
    projectId,
    lotId,
    at: new Date().toISOString(),
    user: actor?.trim() || 'unspecified',
    field: 'Progress claim',
    previousValue,
    newValue
  });
}

/**
 * Claims service — the conformance-to-claim gate.
 *
 * Only lots in `conformed` (or `closed`, i.e. conformed then archived)
 * status may enter a progress-claim period, and only once each. The
 * substantiation extract (CSV + printable HTML) is what the contract
 * administrator attaches to the claim: principals' representatives
 * certify faster when conformance evidence arrives unasked.
 */

export interface ClaimableLot {
  lot: Lot;
  alreadyClaimedIn: string[]; // labels of prior claim periods
  claimable: boolean;
  reason: string | null;
}

export class ClaimService {
  constructor(private repo: Repository) {}

  async createPeriod(input: {
    createdBy?: string | null;
    projectId: number;
    label: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<ClaimPeriod> {
    if (!input.label?.trim()) throw new LotServiceError('label is required');
    if (input.periodEnd < input.periodStart) {
      throw new LotServiceError('periodEnd must be on or after periodStart');
    }
    return this.repo.createClaimPeriod({
      id: randomUUID(),
      projectId: input.projectId,
      label: input.label.trim(),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'open',
      issuedAt: null,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy ?? null
    });
  }

  listPeriods(projectId: number): Promise<ClaimPeriod[]> {
    return this.repo.listClaimPeriods(projectId);
  }

  /** Lots eligible for a period: conformed/closed, not claimed before. */
  async claimableLots(projectId: number, claimPeriodId: string): Promise<ClaimableLot[]> {
    const period = await this.requirePeriod(claimPeriodId);
    const lots = await this.repo.listLots(projectId);
    const out: ClaimableLot[] = [];
    for (const lot of lots) {
      if (lot.status === 'superseded') continue;
      const priorPeriods = (await this.repo.lotClaimedIn(lot.id)).filter((p) => p.id !== period.id);
      const conformed = lot.status === 'conformed' || lot.status === 'closed';
      let reason: string | null = null;
      if (!conformed) reason = `Lot is ${lot.status.replace(/_/g, ' ')} — only conformed lots can be claimed.`;
      else if (priorPeriods.length > 0) reason = `Already claimed in ${priorPeriods.map((p) => p.label).join(', ')}.`;
      else if (lot.quantity == null || !lot.uom) reason = 'Lot has no quantity/UoM recorded.';
      out.push({
        lot,
        alreadyClaimedIn: priorPeriods.map((p) => p.label),
        claimable: reason === null,
        reason
      });
    }
    return out;
  }

  /**
   * Add a lot to a claim period. Refuses non-conformed and double-claimed
   * lots — this refusal IS the product.
   */
  async addLot(projectId: number, claimPeriodId: string, lotId: string, actor?: string): Promise<ClaimLine> {
    const period = await this.requirePeriod(claimPeriodId);
    if (period.status !== 'open') {
      throw new LotServiceError(`Claim period "${period.label}" is ${period.status} and cannot be modified.`, 422);
    }
    const lot = await this.repo.getLot(projectId, lotId);
    if (!lot) throw new LotServiceError(`Lot ${lotId} not found`, 404);
    if (lot.status !== 'conformed' && lot.status !== 'closed') {
      throw new LotServiceError(
        `Lot ${lotId} is "${lot.status.replace(/_/g, ' ')}". Only conformed lots may enter a progress claim — ` +
          'resolve the conformance blockers first (GET /api/projects/:projectId/lots/:lotId/evaluation).',
        422
      );
    }
    if (!lot.conformedAt) {
      throw new LotServiceError(`Lot ${lotId} has no conformed date recorded.`, 422);
    }
    if (lot.quantity == null || !lot.uom) {
      throw new LotServiceError(`Lot ${lotId} has no quantity/UoM — record the lot quantity before claiming.`, 422);
    }
    const prior = (await this.repo.lotClaimedIn(lotId)).filter((p) => p.id !== period.id);
    if (prior.length > 0) {
      throw new LotServiceError(
        `Lot ${lotId} was already claimed in ${prior.map((p) => p.label).join(', ')}. Lots are claimed once.`,
        409
      );
    }
    const existing = await this.repo.listClaimLines(period.id);
    if (existing.some((l) => l.lotId === lotId)) {
      throw new LotServiceError(`Lot ${lotId} is already on this claim.`, 409);
    }
    const line = await this.repo.addClaimLine({
      id: randomUUID(),
      claimPeriodId: period.id,
      lotId,
      quantity: lot.quantity,
      uom: lot.uom,
      costCode: lot.costCode,
      conformedAt: lot.conformedAt,
      createdAt: new Date().toISOString()
    });
    await recordClaimHistory(this.repo, projectId, lotId, actor, null, `Added to ${period.label}`);
    return line;
  }

  /** Add every claimable lot conformed within the period window. */
  async addAllConformedInPeriod(projectId: number, claimPeriodId: string, actor?: string): Promise<ClaimLine[]> {
    const period = await this.requirePeriod(claimPeriodId);
    const candidates = await this.claimableLots(projectId, claimPeriodId);
    const added: ClaimLine[] = [];
    for (const c of candidates) {
      if (!c.claimable || !c.lot.conformedAt) continue;
      if (c.lot.conformedAt < period.periodStart || c.lot.conformedAt > period.periodEnd) continue;
      added.push(await this.addLot(projectId, claimPeriodId, c.lot.id, actor));
    }
    return added;
  }

  /** Mark the period issued — freezes its lines. */
  async issuePeriod(claimPeriodId: string, actor?: string): Promise<ClaimPeriod> {
    const period = await this.requirePeriod(claimPeriodId);
    if (period.status !== 'open') {
      throw new LotServiceError(`Claim period is already ${period.status}.`, 422);
    }
    const issued = await this.repo.updateClaimPeriod({ ...period, status: 'issued', issuedAt: new Date().toISOString() });
    const lines = await this.repo.listClaimLines(period.id);
    for (const line of lines) {
      await recordClaimHistory(this.repo, period.projectId, line.lotId, actor, `Added to ${period.label}`, `${period.label} issued`);
    }
    return issued;
  }

  /* ---- Substantiation extracts ------------------------------------- */

  async extractRows(claimPeriodId: string): Promise<Array<ClaimLine & { lot: Lot | null }>> {
    const period = await this.requirePeriod(claimPeriodId);
    const lines = await this.repo.listClaimLines(period.id);
    const rows: Array<ClaimLine & { lot: Lot | null }> = [];
    for (const line of lines) {
      rows.push({ ...line, lot: await this.repo.getLot(period.projectId, line.lotId) });
    }
    return rows.sort((a, b) => a.lotId.localeCompare(b.lotId));
  }

  /** CSV extract for the claim backup / import into the claim workbook. */
  async extractCsv(claimPeriodId: string): Promise<string> {
    const period = await this.requirePeriod(claimPeriodId);
    const rows = await this.extractRows(claimPeriodId);
    // Columns follow ATS 1120 cl 13.6 (measurement per conforming lot),
    // cl 13.8(g) (pavement lot geo-reference) and cl 10.1(e) (payment item).
    const header = [
      'Lot ID', 'Description', 'Work Type', 'Spec/ITP Ref', 'Cost Code', 'Payment Item',
      'Quantity', 'UoM', 'Conformed Date', 'Hold Point Released By', 'Hold Point Released',
      'Geo Start (lat,long)', 'Geo End (lat,long)', 'Datum', 'Date Added to Claim',
      'Claim Period', 'Claim Created', 'Claim Created By'
    ];
    const esc = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const lines = rows.map((r) =>
      [
        r.lotId, r.lot?.description ?? '', r.lot?.workType ?? '', r.lot?.specReference ?? '',
        r.costCode ?? '', r.lot?.paymentItemNumber ?? '', r.quantity, r.uom, r.conformedAt,
        r.lot?.holdPointReleasedBy ?? '', r.lot?.holdPointReleasedAt ?? '',
        r.lot?.geoStart ?? '', r.lot?.geoEnd ?? '', r.lot?.geoDatum ?? '', r.createdAt,
        period.label, period.createdAt, period.createdBy ?? ''
      ].map(esc).join(',')
    );
    return [header.join(','), ...lines].join('\n') + '\n';
  }

  /** Printable HTML substantiation report (attach to the claim as PDF via print). */
  async extractHtml(claimPeriodId: string): Promise<string> {
    const period = await this.requirePeriod(claimPeriodId);
    const rows = await this.extractRows(claimPeriodId);
    const esc = (s: unknown): string =>
      String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const body = rows
      .map(
        (r) => `<tr>
  <td class="mono">${esc(r.lotId)}</td><td>${esc(r.lot?.description)}${
    r.lot?.geoStart ? `<br><span class="geo">${esc(r.lot.geoStart)} → ${esc(r.lot.geoEnd)} (${esc(r.lot.geoDatum)})</span>` : ''
  }</td>
  <td>${esc(r.lot?.specReference)}</td><td class="mono">${esc(r.costCode)}</td>
  <td class="mono">${esc(r.lot?.paymentItemNumber)}</td>
  <td class="num">${esc(r.quantity)}</td><td>${esc(r.uom)}</td><td class="mono">${esc(r.conformedAt)}</td>
  <td>${esc(r.lot?.holdPointReleasedBy)}${r.lot?.holdPointReleasedAt ? ` <span class="mono">${esc(r.lot.holdPointReleasedAt)}</span>` : ''}</td>
  <td class="mono">${esc(new Date(r.createdAt).toLocaleDateString())}</td>
</tr>`
      )
      .join('\n');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(period.label)} — Conformance substantiation</title>
<style>
  body{font:13px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14202e;margin:2.5rem}
  h1{font-size:1.25rem;margin:0 0 .25rem} .sub{color:#5a6b7d;margin:0 0 1.5rem}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #c8d2dc;padding:.4rem .6rem;text-align:left;vertical-align:top}
  th{background:#eef2f6;font-weight:600} .mono{font-family:ui-monospace,Menlo,Consolas,monospace} .num{text-align:right}
  .geo{color:#5a6b7d;font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace}
  footer{margin-top:1.5rem;color:#5a6b7d;font-size:11px}
  @media print{body{margin:1rem}}
</style></head><body>
<h1>Conformance substantiation — ${esc(period.label)}</h1>
<p class="sub">Period ${esc(period.periodStart)} to ${esc(period.periodEnd)} ·
Lots conformed and claimed this period: ${rows.length} · Status: ${esc(period.status)}<br>
Claim period created ${esc(new Date(period.createdAt).toLocaleString())}${period.createdBy ? ` by ${esc(period.createdBy)}` : ''}</p>
<table>
<thead><tr><th>Lot ID</th><th>Description</th><th>Spec/ITP ref</th><th>Cost code</th>
<th>Pay item</th><th>Qty</th><th>UoM</th><th>Conformed</th><th>Hold point released</th><th>Added to claim</th></tr></thead>
<tbody>
${body || '<tr><td colspan="10">No lots on this claim yet.</td></tr>'}
</tbody></table>
<footer>Generated by Procore OpenLot on ${esc(new Date().toISOString())}. Every lot listed passed all
linked ITP inspections, has zero open NCRs, all test results received and passing, and hold points
released by the Principal's authorised person at the time of conformance (ATS 1120 cl 11). Pavement lots
carry start/end geo-references per ATS 1120 cl 10.4. The full evidence trail (Records per ATS 1120 cl 13)
is retained in Procore and the Procore OpenLot register and identified against this payment claim per
cl 13.11.</footer>
</body></html>`;
  }

  private async requirePeriod(id: string): Promise<ClaimPeriod> {
    const period = await this.repo.getClaimPeriod(id);
    if (!period) throw new LotServiceError(`Claim period ${id} not found`, 404);
    return period;
  }
}
