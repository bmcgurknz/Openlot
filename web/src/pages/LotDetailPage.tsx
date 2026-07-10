import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, STATIC_EDITION, STATUS_LABELS, WORK_TYPE_NAMES } from '../api';
import type { ConformanceEvaluation, LotDossier, LotHistoryEntry, TestRecord } from '../api';
import { fmtQty, LotBar, navigate, PROJECT_ID } from '../App';

export function LotDetailPage({ lotId }: { lotId: string }): JSX.Element {
  const [dossier, setDossier] = useState<LotDossier | null>(null);
  const [evaln, setEvaln] = useState<ConformanceEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'history'>('overview');

  const load = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([api.lot(PROJECT_ID, lotId), api.evaluation(PROJECT_ID, lotId)]);
      setDossier(d);
      setEvaln(e);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the lot.');
    }
  }, [lotId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = (fn: () => Promise<unknown>, done?: string) => (): void => {
    setError(null);
    setNotice(null);
    void fn()
      .then(() => {
        if (done) setNotice(done);
        return load();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Action failed.'));
  };

  if (!dossier) {
    return error ? <div className="error-band">{error}</div> : <p className="dim">Loading lot…</p>;
  }

  const { lot, inspections, ncrs, tests, quantities, claimedIn, history } = dossier;

  return (
    <>
      <div className="crumbs">
        <button onClick={() => navigate('#/lots')}>Lot register</button>
        <span className="dim"> / </span>
        <span className="mono">{lot.id}</span>
      </div>

      {error && <div className="error-band">{error}</div>}
      {notice && <div className="notice-band">{notice}</div>}

      <div className="register-head">
        <h2 className="mono">{lot.id}</h2>
        <LotBar status={lot.status} />
        <span className={`status-word${lot.status === 'conformed' ? ' conformed' : ''}`}>
          {STATUS_LABELS[lot.status]}
        </span>
        <span className="spacer" />
        {lot.status === 'open' && (
          <button className="btn" onClick={act(() => api.transition(PROJECT_ID, lot.id, 'work_complete'))}>
            Mark work complete
          </button>
        )}
        {lot.status === 'work_complete' && (
          <button
            className="btn conform"
            disabled={!evaln?.eligible}
            title={evaln?.eligible ? 'All conformance rules satisfied' : 'Resolve the blockers listed below first'}
            onClick={act(() => api.transition(PROJECT_ID, lot.id, 'conformed'), `${lot.id} conformed.`)}
          >
            Conform lot
          </button>
        )}
        {lot.status === 'conformed' && (
          <button className="btn" onClick={act(() => api.transition(PROJECT_ID, lot.id, 'closed'))}>
            Close lot
          </button>
        )}
      </div>

      <div className="dossier">
        <div>
          <section className={`card gate${evaln?.eligible ? ' eligible' : ''}`}>
            <header>Conformance check</header>
            <div className="body">
              {evaln?.eligible ? (
                <p style={{ margin: 0 }}>
                  All rules satisfied — inspections passed, no open NCRs, tests passed, hold point released.
                  This lot can be conformed.
                </p>
              ) : (
                <>
                  <p style={{ margin: 0 }}>
                    {evaln?.blockers.length ?? 0} blocker{(evaln?.blockers.length ?? 0) === 1 ? '' : 's'} before
                    this lot can be conformed:
                  </p>
                  <ul>
                    {evaln?.blockers.map((b, i) => (
                      <li key={i}>
                        {b.message}
                        <span className="blocker-code">{b.code}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <header>ITP inspections ({inspections.length})</header>
            <div className="body">
              {STATIC_EDITION && (
                <RecordInspection
                  lotId={lot.id}
                  onDone={() => {
                    void load();
                  }}
                  onError={setError}
                />
              )}
              {inspections.length === 0 ? (
                <p className="dim" style={{ margin: 0 }}>
                  {STATIC_EDITION
                    ? 'No inspections recorded yet. Record each ITP checkpoint result above as it is signed off.'
                    : `No inspections linked yet. In Procore, title the inspection with the lot ID prefix — ` +
                      `${lot.id} - Subgrade proof roll — and it links automatically.`}
                </p>
              ) : (
                <table>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.procoreId}>
                        <td>{i.title}</td>
                        <td className="dim">{i.templateName}</td>
                        <td className="mono dim">{i.inspectionDate ?? ''}</td>
                        <td className="num">
                          {i.itemsPassed}/{i.itemsTotal}
                        </td>
                        <td>
                          {STATIC_EDITION ? (
                            <select
                              aria-label={`Status for ${i.title}`}
                              value={i.status}
                              style={{ font: '12px var(--mono)' }}
                              onChange={(e) =>
                                act(() =>
                                  import('../local').then(({ localData }) =>
                                    localData.setInspectionStatus(i.procoreId, e.target.value as typeof i.status)
                                  )
                                )()
                              }
                            >
                              {(['open', 'in_progress', 'passed', 'failed', 'not_applicable'] as const).map((st) => (
                                <option key={st} value={st}>
                                  {st.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`chip ${i.status === 'passed' ? 'pass' : i.status === 'failed' ? 'fail' : 'pending'}`}>
                              {i.status.replace('_', ' ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="card">
            <header>NCRs ({ncrs.length})</header>
            <div className="body">
              {STATIC_EDITION && (
                <RecordNcr
                  lotId={lot.id}
                  onDone={() => {
                    void load();
                  }}
                  onError={setError}
                />
              )}
              {ncrs.length === 0 ? (
                <p className="dim" style={{ margin: 0 }}>
                  No non-conformances recorded against this lot.
                </p>
              ) : (
                <table>
                  <tbody>
                    {ncrs.map((n) => (
                      <tr key={n.procoreId}>
                        <td>{n.title}</td>
                        <td>
                          {STATIC_EDITION ? (
                            <select
                              aria-label={`Status for ${n.title}`}
                              value={n.status}
                              style={{ font: '12px var(--mono)' }}
                              onChange={(e) =>
                                act(() =>
                                  import('../local').then(({ localData }) =>
                                    localData.setNcrStatus(n.procoreId, e.target.value as typeof n.status)
                                  )
                                )()
                              }
                            >
                              {(['open', 'ready_for_review', 'closed', 'void'] as const).map((st) => (
                                <option key={st} value={st}>
                                  {st.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`chip ${n.status === 'closed' || n.status === 'void' ? 'neutral' : 'open-ncr'}`}>
                              {n.status.replace(/_/g, ' ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="card">
            <header>
              Tests ({tests.length})
              <AddTest onAdd={(testType) => act(() => api.addTest(PROJECT_ID, lot.id, testType))()} />
            </header>
            <div className="body">
              {tests.length === 0 ? (
                <p className="dim" style={{ margin: 0 }}>
                  No tests recorded. Add the tests the spec requires for this lot.
                </p>
              ) : (
                <table>
                  <tbody>
                    {tests.map((t) => (
                      <TestRow key={t.id} test={t} onChange={(status) => act(() => api.setTestStatus(t.id, status))()} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <div>
          <div className="tab-bar">
            <button className={`btn small${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>
              Overview
            </button>
            <button className={`btn small${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
              History / Activity ({history.length})
            </button>
          </div>

          {tab === 'history' ? (
            <HistoryPanel history={history} />
          ) : (
            <>
          <section className="card">
            <header>Lot details</header>
            <div className="body">
              <dl className="specs">
                <dt>Description</dt>
                <dd>{lot.description}</dd>
                <dt>Work type</dt>
                <dd>{WORK_TYPE_NAMES[lot.workType] ?? lot.workType}</dd>
                <dt>Spec / ITP ref</dt>
                <dd className="mono">{lot.specReference ?? '—'}</dd>
                <dt>Cost code</dt>
                <dd className="mono">{lot.costCode ?? '—'}</dd>
                <dt>Payment item</dt>
                <dd className="mono">{lot.paymentItemNumber ?? '—'}</dd>
                <dt>Quantity</dt>
                <dd className="mono">{fmtQty(lot)}</dd>
                <dt>Opened</dt>
                <dd className="mono">{lot.openedAt}</dd>
                <dt>Work complete</dt>
                <dd className="mono">{lot.workCompleteAt ?? '—'}</dd>
                <dt>Conformed</dt>
                <dd className="mono">{lot.conformedAt ?? '—'}</dd>
                <dt>Builder</dt>
                <dd>{lot.builder ?? '—'}</dd>
                <dt>Stage</dt>
                <dd>{lot.stage ?? '—'}</dd>
                <dt>Owner</dt>
                <dd>{lot.owner ?? '—'}</dd>
                <dt>Date created</dt>
                <dd className="mono">
                  {new Date(lot.createdAt).toLocaleString()}
                  {lot.createdBy && <span className="dim"> · {lot.createdBy}</span>}
                </dd>
                {lot.geoStart && (
                  <>
                    <dt>Geo-reference</dt>
                    <dd className="mono" style={{ fontSize: 12 }}>
                      {lot.geoStart} → {lot.geoEnd} ({lot.geoDatum})
                    </dd>
                  </>
                )}
                {lot.supersededBy && (
                  <>
                    <dt>Superseded by</dt>
                    <dd className="mono">{lot.supersededBy}</dd>
                  </>
                )}
              </dl>
            </div>
          </section>

          <section className="card">
            <header>Subdivision details</header>
            <div className="body">
              <form
                className="inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const actor = window.prompt('Your name / role (recorded in history):')?.trim();
                  act(
                    () =>
                      api.updateLot(
                        PROJECT_ID,
                        lot.id,
                        {
                          builder: String(data.get('builder')) || null,
                          stage: String(data.get('stage')) || null,
                          owner: String(data.get('owner')) || null
                        },
                        actor || undefined
                      ),
                    'Subdivision details saved.'
                  )();
                }}
              >
                <label>
                  Builder
                  <input name="builder" defaultValue={lot.builder ?? ''} placeholder="Hallmark Homes" />
                </label>
                <label>
                  Stage
                  <input name="stage" defaultValue={lot.stage ?? ''} placeholder="Stage 2" />
                </label>
                <label>
                  Owner
                  <input name="owner" defaultValue={lot.owner ?? ''} placeholder="J. & K. Smith" />
                </label>
                <button className="btn small" type="submit">
                  Save
                </button>
              </form>
            </div>
          </section>

          <section className="card">
            <header>Hold / witness point</header>
            <div className="body">
              <p style={{ marginTop: 0 }}>
                {lot.holdPointReleased ? (
                  <>
                    Released
                    {lot.holdPointReleasedBy && (
                      <>
                        {' '}by <strong>{lot.holdPointReleasedBy}</strong>
                      </>
                    )}
                    {lot.holdPointReleasedAt && (
                      <>
                        {' '}on <span className="mono">{lot.holdPointReleasedAt}</span>
                      </>
                    )}
                    . Release recorded per ATS 1120 cl 11.
                  </>
                ) : (
                  "Not released. ATS 1120 cl 11.6 requires the release to be recorded against the Principal's authorised person."
                )}
              </p>
              <button
                className="btn small"
                onClick={() => {
                  if (lot.holdPointReleased) {
                    act(() => api.holdPoint(PROJECT_ID, lot.id, false), 'Hold point reinstated.')();
                    return;
                  }
                  const actor = window.prompt(
                    "Principal's authorised person releasing this hold point (name / role):"
                  );
                  if (!actor?.trim()) return;
                  act(() => api.holdPoint(PROJECT_ID, lot.id, true, actor.trim()), 'Hold point released.')();
                }}
              >
                {lot.holdPointReleased ? 'Reinstate hold point' : 'Record release'}
              </button>
            </div>
          </section>

          {lot.workType === 'PV' && (
            <section className="card">
              <header>Geo-reference (ATS 1120 cl 10.4)</header>
              <div className="body">
                <p style={{ marginTop: 0, fontSize: 13 }} className="dim">
                  Pavement lots must record start and end latitude/longitude in decimal degrees and the
                  datum (±5 m) before conformance.
                </p>
                <form
                  className="inline"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    act(
                      () =>
                        api.updateLot(PROJECT_ID, lot.id, {
                          geoStart: String(data.get('geoStart')) || null,
                          geoEnd: String(data.get('geoEnd')) || null,
                          geoDatum: String(data.get('geoDatum')) || null
                        }),
                      'Geo-reference saved.'
                    )();
                  }}
                >
                  <label>
                    Start (lat, long)
                    <input name="geoStart" defaultValue={lot.geoStart ?? ''} placeholder="-27.46980, 153.02510" />
                  </label>
                  <label>
                    End (lat, long)
                    <input name="geoEnd" defaultValue={lot.geoEnd ?? ''} placeholder="-27.47120, 153.02760" />
                  </label>
                  <label>
                    Datum
                    <input name="geoDatum" defaultValue={lot.geoDatum ?? ''} placeholder="GDA2020" style={{ minWidth: 80 }} />
                  </label>
                  <button className="btn small" type="submit">
                    Save
                  </button>
                </form>
              </div>
            </section>
          )}

          <section className="card">
            <header>Quantities ({quantities.length})</header>
            <div className="body">
              {quantities.length === 0 ? (
                <p className="dim" style={{ margin: 0 }}>
                  No quantities linked. Daily-log quantity entries mentioning{' '}
                  <span className="mono">{lot.id}</span> sync automatically.
                </p>
              ) : (
                <table>
                  <tbody>
                    {quantities.map((q) => (
                      <tr key={q.id}>
                        <td className="mono dim">{q.date}</td>
                        <td className="num">
                          {q.quantity.toLocaleString()} {q.uom}
                        </td>
                        <td className="dim">{q.source === 'daily_log' ? 'Daily log' : 'Manual'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="card">
            <header>Claimed in</header>
            <div className="body">
              {claimedIn.length === 0 ? (
                <p className="dim" style={{ margin: 0 }}>
                  Not yet claimed. Conformed lots become claimable on the Progress claims page.
                </p>
              ) : (
                <p style={{ margin: 0 }} className="mono">
                  {claimedIn.map((p) => p.label).join(', ')}
                </p>
              )}
            </div>
          </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function HistoryPanel({ history }: { history: LotHistoryEntry[] }): JSX.Element {
  return (
    <section className="card">
      <header>Lot change history</header>
      <div className="body">
        {history.length === 0 ? (
          <p className="dim" style={{ margin: 0 }}>
            No changes recorded yet. Status transitions, hold point releases, builder/owner/stage
            updates, notes edits and progress-claim events are logged here as they happen.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Field</th>
                <th>From</th>
                <th>To</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="mono dim" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(h.at).toLocaleString()}
                  </td>
                  <td>{h.field}</td>
                  <td className="dim">{h.previousValue ?? '—'}</td>
                  <td>{h.newValue ?? '—'}</td>
                  <td className="dim">{h.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function AddTest({ onAdd }: { onAdd: (testType: string) => void }): JSX.Element {
  const [value, setValue] = useState('');
  return (
    <form
      className="inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value.trim());
        setValue('');
      }}
    >
      <input
        aria-label="Test type"
        placeholder="Compaction (AS 1289.5.4.1)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ font: '12px var(--mono)', padding: '3px 6px', border: '1px solid var(--line-strong)' }}
      />
      <button className="btn small" type="submit">
        Add test
      </button>
    </form>
  );
}

function TestRow({ test, onChange }: { test: TestRecord; onChange: (s: TestRecord['status']) => void }): JSX.Element {
  return (
    <tr>
      <td>{test.testType}</td>
      <td className="mono dim">{test.labReference ?? ''}</td>
      <td className="mono dim">{test.resultAt ?? test.requestedAt}</td>
      <td>
        <select
          aria-label={`Status for ${test.testType}`}
          value={test.status}
          onChange={(e) => onChange(e.target.value as TestRecord['status'])}
          style={{ font: '12px var(--mono)' }}
        >
          {(['requested', 'sampled', 'results_received', 'passed', 'failed'] as const).map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}


function RecordInspection({
  lotId,
  onDone,
  onError
}: {
  lotId: string;
  onDone: () => void;
  onError: (m: string) => void;
}): JSX.Element {
  return (
    <form
      className="inline"
      style={{ marginBottom: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const form = e.currentTarget;
        void import('../local')
          .then(({ localData }) =>
            localData.recordInspection(PROJECT_ID, lotId, {
              title: String(data.get('title')),
              templateName: String(data.get('template')) || undefined,
              status: String(data.get('status')) as 'passed' | 'failed' | 'in_progress',
              itemsTotal: Number(data.get('itemsTotal')) || 0,
              itemsPassed: Number(data.get('itemsPassed')) || 0,
              itemsFailed:
                (Number(data.get('itemsTotal')) || 0) - (Number(data.get('itemsPassed')) || 0)
            })
          )
          .then(() => {
            form.reset();
            onDone();
          })
          .catch((err: unknown) => onError(err instanceof ApiError ? err.message : 'Could not record the inspection.'));
      }}
    >
      <label style={{ flex: 1, minWidth: 180 }}>
        Checkpoint / ITP item
        <input name="title" required placeholder="Subgrade proof roll" />
      </label>
      <label>
        Template
        <input name="template" placeholder="ITP - Earthworks" />
      </label>
      <label>
        Items
        <input name="itemsTotal" type="number" min="0" defaultValue="1" style={{ minWidth: 55 }} />
      </label>
      <label>
        Passed
        <input name="itemsPassed" type="number" min="0" defaultValue="1" style={{ minWidth: 55 }} />
      </label>
      <label>
        Result
        <select name="status" defaultValue="passed">
          <option value="passed">passed</option>
          <option value="failed">failed</option>
          <option value="in_progress">in progress</option>
        </select>
      </label>
      <button className="btn small" type="submit">
        Record inspection
      </button>
    </form>
  );
}

function RecordNcr({
  lotId,
  onDone,
  onError
}: {
  lotId: string;
  onDone: () => void;
  onError: (m: string) => void;
}): JSX.Element {
  return (
    <form
      className="inline"
      style={{ marginBottom: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const form = e.currentTarget;
        void import('../local')
          .then(({ localData }) =>
            localData.recordNcr(PROJECT_ID, lotId, {
              title: String(data.get('title')),
              status: 'open'
            })
          )
          .then(() => {
            form.reset();
            onDone();
          })
          .catch((err: unknown) => onError(err instanceof ApiError ? err.message : 'Could not record the NCR.'));
      }}
    >
      <label style={{ flex: 1, minWidth: 220 }}>
        Non-conformance
        <input name="title" required placeholder="Soft spot at Ch 1310" />
      </label>
      <button className="btn small" type="submit">
        Raise NCR
      </button>
    </form>
  );
}
