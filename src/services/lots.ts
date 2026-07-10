import { randomUUID } from '../lib/uuid.js';
import type { Repository } from '../db/repository.js';
import { buildLotId, isKnownWorkType } from '../lib/lot-id.js';
import { canTransition, evaluateConformance, transitionError } from './conformance.js';
import type {
  ConformanceEvaluation,
  Lot,
  LotHistoryEntry,
  LotStatus,
  TestRecord,
  WorkTypeCode
} from '../types.js';

export interface CreateLotInput {
  projectId: number;
  workType: string;
  description: string;
  specReference?: string | null;
  costCode?: string | null;
  quantity?: number | null;
  uom?: string | null;
  openedAt?: string;
  paymentItemNumber?: string | null;
  geoStart?: string | null;
  geoEnd?: string | null;
  geoDatum?: string | null;
  builder?: string | null;
  stage?: string | null;
  owner?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  /** Optional explicit sequence; otherwise next available for the work type. */
  sequence?: number;
}

export class LotServiceError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
  }
}

export class LotService {
  constructor(private repo: Repository) {}

  async create(input: CreateLotInput): Promise<Lot> {
    const wt = input.workType.toUpperCase();
    if (!isKnownWorkType(wt)) {
      throw new LotServiceError(`Unknown work type "${input.workType}"`);
    }
    if (!input.description?.trim()) {
      throw new LotServiceError('Description is required (include chainage/extent — the ID stays clean).');
    }
    const sequence = input.sequence ?? (await this.repo.nextSequence(input.projectId, wt));
    const id = buildLotId(wt, sequence);
    if (await this.repo.getLot(input.projectId, id)) {
      throw new LotServiceError(`Lot ${id} already exists. Sequences are never reused.`, 409);
    }
    const now = new Date();
    return this.repo.createLot({
      id,
      projectId: input.projectId,
      description: input.description.trim(),
      workType: wt as WorkTypeCode,
      specReference: input.specReference ?? null,
      costCode: input.costCode ?? null,
      quantity: input.quantity ?? null,
      uom: input.uom ?? null,
      status: 'open',
      openedAt: input.openedAt ?? now.toISOString().slice(0, 10),
      workCompleteAt: null,
      conformedAt: null,
      closedAt: null,
      supersededBy: null,
      holdPointReleased: false,
      holdPointReleasedBy: null,
      holdPointReleasedAt: null,
      paymentItemNumber: input.paymentItemNumber ?? null,
      geoStart: input.geoStart ?? null,
      geoEnd: input.geoEnd ?? null,
      geoDatum: input.geoDatum ?? null,
      builder: input.builder ?? null,
      stage: input.stage ?? null,
      owner: input.owner ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  }

  async get(projectId: number, lotId: string): Promise<Lot> {
    const lot = await this.repo.getLot(projectId, lotId);
    if (!lot) throw new LotServiceError(`Lot ${lotId} not found in project ${projectId}`, 404);
    return lot;
  }

  list(projectId: number, filter?: { status?: LotStatus; workType?: string }): Promise<Lot[]> {
    return this.repo.listLots(projectId, filter);
  }

  /** Evaluate conformance readiness without changing anything. */
  async evaluate(projectId: number, lotId: string): Promise<ConformanceEvaluation> {
    const lot = await this.get(projectId, lotId);
    const [inspections, ncrs, tests] = await Promise.all([
      this.repo.listInspections(projectId, lotId),
      this.repo.listNcrs(projectId, lotId),
      this.repo.listTests(projectId, lotId)
    ]);
    return evaluateConformance(lot, inspections, ncrs, tests);
  }

  /**
   * Move a lot between statuses. Transition to `conformed` runs the
   * conformance engine and is refused while blockers remain — this is
   * the gate that spreadsheet registers cannot enforce.
   */
  async transition(
    projectId: number,
    lotId: string,
    to: LotStatus,
    opts: { supersededBy?: string; actor?: string } = {}
  ): Promise<{ lot: Lot; evaluation?: ConformanceEvaluation }> {
    const lot = await this.get(projectId, lotId);
    if (!canTransition(lot.status, to)) {
      throw new LotServiceError(transitionError(lot.status, to), 422);
    }

    let evaluation: ConformanceEvaluation | undefined;
    if (to === 'conformed') {
      evaluation = await this.evaluate(projectId, lotId);
      if (!evaluation.eligible) {
        throw new LotServiceError(
          `Lot ${lotId} cannot be conformed:\n` +
            evaluation.blockers.map((b) => `  - ${b.message}`).join('\n'),
          422
        );
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const next: Lot = { ...lot, status: to, updatedAt: new Date().toISOString() };
    if (to === 'work_complete') next.workCompleteAt = lot.workCompleteAt ?? today;
    if (to === 'conformed') next.conformedAt = today;
    if (to === 'closed') next.closedAt = today;
    if (to === 'open') {
      next.workCompleteAt = null;
      next.conformedAt = null;
    }
    if (to === 'work_complete' && lot.status === 'conformed') {
      // Reverting conformance (e.g. post-conformance NCR): clear the date,
      // keep an audit note.
      next.conformedAt = null;
      next.notes = [lot.notes, `Conformance reverted ${today}${opts.actor ? ` by ${opts.actor}` : ''}`]
        .filter(Boolean)
        .join('\n');
    }
    if (to === 'superseded') {
      if (!opts.supersededBy) {
        throw new LotServiceError('supersededBy (the replacement lot ID) is required when superseding a lot.');
      }
      next.supersededBy = opts.supersededBy;
    }

    const saved = await this.repo.updateLot(next);
    if (lot.status !== to) {
      await this.recordHistory(projectId, lotId, opts.actor, 'Status', lot.status, to);
    }
    if (to === 'superseded' && opts.supersededBy) {
      await this.recordHistory(projectId, lotId, opts.actor, 'Superseded by', lot.supersededBy, opts.supersededBy);
    }
    return { lot: saved, evaluation };
  }

  /**
   * Record a hold/witness point release or reinstatement.
   *
   * ATS 1120 cl 11.1 requires the release to be recorded and cl 11.6
   * requires it to be made by the Principal's authorised person — so a
   * release without a named authoriser is refused.
   */
  async releaseHoldPoint(projectId: number, lotId: string, released: boolean, actor?: string): Promise<Lot> {
    const lot = await this.get(projectId, lotId);
    if (released && !actor?.trim()) {
      throw new LotServiceError(
        "Hold point release must record the Principal's authorised person (ATS 1120 cl 11.6). Provide 'actor'."
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    const note = `Hold point ${released ? 'released' : 'reinstated'} ${today}${actor ? ` by ${actor}` : ''}`;
    const saved = await this.repo.updateLot({
      ...lot,
      holdPointReleased: released,
      holdPointReleasedBy: released ? actor!.trim() : null,
      holdPointReleasedAt: released ? today : null,
      notes: [lot.notes, note].filter(Boolean).join('\n'),
      updatedAt: new Date().toISOString()
    });
    const previousLabel = lot.holdPointReleased ? `Released by ${lot.holdPointReleasedBy ?? 'unknown'}` : 'Not released';
    const newLabel = released ? `Released by ${actor!.trim()}` : 'Not released';
    await this.recordHistory(projectId, lotId, actor, 'Hold point', previousLabel, newLabel);
    return saved;
  }

  /**
   * Update the editable fields of a lot. Redefining the description
   * (the lot's bounds/extent) appends an audit note preserving the
   * previous bounds, per ATS 1120 cl 10.3. Builder/owner/stage and notes
   * changes, along with the bounds redefinition itself, are recorded as
   * real history entries (requirement #3) in addition to the legacy
   * notes-string audit trail kept for backwards compatibility.
   */
  async update(
    projectId: number,
    lotId: string,
    fields: Partial<
      Pick<
        Lot,
        | 'description'
        | 'specReference'
        | 'costCode'
        | 'quantity'
        | 'uom'
        | 'paymentItemNumber'
        | 'geoStart'
        | 'geoEnd'
        | 'geoDatum'
        | 'builder'
        | 'stage'
        | 'owner'
        | 'notes'
      >
    >,
    actor?: string
  ): Promise<Lot> {
    const lot = await this.get(projectId, lotId);
    let notes = fields.notes !== undefined ? fields.notes : lot.notes;
    const boundsChanged =
      fields.description !== undefined &&
      fields.description.trim() &&
      fields.description.trim() !== lot.description;
    if (boundsChanged) {
      const audit = `Bounds redefined ${new Date().toISOString().slice(0, 10)} (was: ${lot.description})`;
      notes = [notes, audit].filter(Boolean).join('\n');
    }
    const saved = await this.repo.updateLot({
      ...lot,
      description: fields.description?.trim() || lot.description,
      specReference: fields.specReference !== undefined ? fields.specReference : lot.specReference,
      costCode: fields.costCode !== undefined ? fields.costCode : lot.costCode,
      quantity: fields.quantity !== undefined ? fields.quantity : lot.quantity,
      uom: fields.uom !== undefined ? fields.uom : lot.uom,
      paymentItemNumber:
        fields.paymentItemNumber !== undefined ? fields.paymentItemNumber : lot.paymentItemNumber,
      geoStart: fields.geoStart !== undefined ? fields.geoStart : lot.geoStart,
      geoEnd: fields.geoEnd !== undefined ? fields.geoEnd : lot.geoEnd,
      geoDatum: fields.geoDatum !== undefined ? fields.geoDatum : lot.geoDatum,
      builder: fields.builder !== undefined ? fields.builder : lot.builder,
      stage: fields.stage !== undefined ? fields.stage : lot.stage,
      owner: fields.owner !== undefined ? fields.owner : lot.owner,
      notes,
      updatedAt: new Date().toISOString()
    });

    if (boundsChanged) {
      await this.recordHistory(projectId, lotId, actor, 'Description', lot.description, fields.description!.trim());
    }
    if (fields.builder !== undefined && fields.builder !== lot.builder) {
      await this.recordHistory(projectId, lotId, actor, 'Builder', lot.builder, fields.builder);
    }
    if (fields.owner !== undefined && fields.owner !== lot.owner) {
      await this.recordHistory(projectId, lotId, actor, 'Owner', lot.owner, fields.owner);
    }
    if (fields.stage !== undefined && fields.stage !== lot.stage) {
      await this.recordHistory(projectId, lotId, actor, 'Stage', lot.stage, fields.stage);
    }
    if (fields.notes !== undefined && fields.notes !== lot.notes) {
      await this.recordHistory(projectId, lotId, actor, 'Notes', lot.notes, fields.notes);
    }
    return saved;
  }

  /** Append one lot-history audit entry. `user` defaults to 'unspecified' when no actor is supplied. */
  private async recordHistory(
    projectId: number,
    lotId: string,
    actor: string | undefined,
    field: string,
    previousValue: string | null,
    newValue: string | null
  ): Promise<void> {
    await this.repo.appendHistory({
      id: randomUUID(),
      projectId,
      lotId,
      at: new Date().toISOString(),
      user: actor?.trim() || 'unspecified',
      field,
      previousValue,
      newValue
    });
  }

  async listHistory(projectId: number, lotId: string): Promise<LotHistoryEntry[]> {
    await this.get(projectId, lotId); // 404 if missing
    return this.repo.listHistory(projectId, lotId);
  }

  async addTest(
    projectId: number,
    lotId: string,
    input: { testType: string; labReference?: string | null; notes?: string | null }
  ): Promise<TestRecord> {
    await this.get(projectId, lotId); // 404 if missing
    if (!input.testType?.trim()) throw new LotServiceError('testType is required');
    return this.repo.createTest({
      id: randomUUID(),
      lotId,
      projectId,
      testType: input.testType.trim(),
      labReference: input.labReference ?? null,
      status: 'requested',
      requestedAt: new Date().toISOString().slice(0, 10),
      resultAt: null,
      documentUrl: null,
      notes: input.notes ?? null,
      updatedAt: new Date().toISOString()
    });
  }

  async updateTestStatus(
    testId: string,
    status: TestRecord['status'],
    fields: { labReference?: string | null; documentUrl?: string | null; notes?: string | null } = {}
  ): Promise<TestRecord> {
    const test = await this.repo.getTest(testId);
    if (!test) throw new LotServiceError(`Test ${testId} not found`, 404);
    return this.repo.updateTest({
      ...test,
      status,
      resultAt: ['results_received', 'passed', 'failed'].includes(status)
        ? test.resultAt ?? new Date().toISOString().slice(0, 10)
        : test.resultAt,
      labReference: fields.labReference ?? test.labReference,
      documentUrl: fields.documentUrl ?? test.documentUrl,
      notes: fields.notes ?? test.notes,
      updatedAt: new Date().toISOString()
    });
  }
}
