import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, STATIC_EDITION } from '../api';
import type { ClaimLine, ClaimPeriod, ClaimableLot } from '../api';
import { navigate, PROJECT_ID } from '../App';

export function ClaimsPage(): JSX.Element {
  const [periods, setPeriods] = useState<ClaimPeriod[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.claims(PROJECT_ID);
      setPeriods(list);
      setSelected((cur) => cur ?? list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load claim periods.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const period = periods?.find((p) => p.id === selected) ?? null;

  return (
    <>
      <div className="register-head">
        <h2>Progress claims</h2>
        <span className="count">Only conformed lots can enter a claim, and only once.</span>
      </div>
      {error && <div className="error-band">{error}</div>}

      <div className="dossier">
        <div>
          {period ? <PeriodDetail period={period} onChanged={load} /> : <p className="dim">No claim period selected.</p>}
        </div>
        <div>
          <section className="card">
            <header>Claim periods</header>
            <div className="body">
              {periods && periods.length > 0 ? (
                <table>
                  <tbody>
                    {periods.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="btn small"
                            style={selected === p.id ? { background: 'var(--ink)', color: '#fff' } : {}}
                            onClick={() => setSelected(p.id)}
                          >
                            {p.label}
                          </button>
                        </td>
                        <td className="mono dim">
                          {p.periodStart} → {p.periodEnd}
                        </td>
                        <td>
                          <span className={`chip ${p.status === 'open' ? 'pending' : 'neutral'}`}>{p.status}</span>
                        </td>
                        <td className="dim" style={{ fontSize: 11 }}>
                          {new Date(p.createdAt).toLocaleDateString()}
                          {p.createdBy && <> · {p.createdBy}</>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="dim" style={{ margin: 0 }}>
                  No claim periods yet.
                </p>
              )}
            </div>
          </section>
          <NewPeriodForm onCreated={load} />
        </div>
      </div>
    </>
  );
}

function PeriodDetail({ period, onChanged }: { period: ClaimPeriod; onChanged: () => Promise<void> }): JSX.Element {
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [claimable, setClaimable] = useState<ClaimableLot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([
        api.claimLines(PROJECT_ID, period.id),
        api.claimable(PROJECT_ID, period.id)
      ]);
      setLines(l);
      setClaimable(c);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the claim.');
    }
  }, [period.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = (lotId: string): void => {
    const actor = window.prompt('Your name / role (recorded in the lot history):') ?? undefined;
    void api
      .addLotToClaim(PROJECT_ID, period.id, lotId, actor?.trim() || undefined)
      .then(load)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not add the lot.'));
  };

  const onClaim = new Set(lines.map((l) => l.lotId));
  const candidates = claimable.filter((c) => !onClaim.has(c.lot.id) && c.lot.status !== 'closed');

  return (
    <>
      {error && <div className="error-band">{error}</div>}
      <p className="dim" style={{ fontSize: 12, margin: '0 0 10px' }}>
        Created {new Date(period.createdAt).toLocaleString()}
        {period.createdBy && <> by {period.createdBy}</>}
      </p>
      <section className="card">
        <header>
          {period.label} — lots on this claim ({lines.length})
          <span>
            {STATIC_EDITION ? (
              <>
                <button
                  className="btn small"
                  onClick={() =>
                    void api.extractCsv(period.id).then((csv: string) => {
                      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${period.label.replace(/\s+/g, '-')}-claim-extract.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                  }
                >
                  CSV extract
                </button>{' '}
                <button
                  className="btn small"
                  onClick={() =>
                    void api.extractHtml(period.id).then((html: string) => {
                      const w = window.open('', '_blank');
                      if (w) {
                        w.document.write(html);
                        w.document.close();
                      }
                    })
                  }
                >
                  Substantiation report
                </button>
              </>
            ) : (
              <>
                <a className="btn small" href={`/api/projects/${PROJECT_ID}/claims/${period.id}/extract.csv`}>
                  CSV extract
                </a>{' '}
                <a
                  className="btn small"
                  href={`/api/projects/${PROJECT_ID}/claims/${period.id}/extract.html`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Substantiation report
                </a>
              </>
            )}{' '}
            {period.status === 'open' && (
              <button
                className="btn small primary"
                onClick={() => {
                  const actor = window.prompt('Your name / role (recorded in the lot history):') ?? undefined;
                  void api
                    .issueClaim(PROJECT_ID, period.id, actor?.trim() || undefined)
                    .then(() => onChanged())
                    .then(load)
                    .catch((err: unknown) =>
                      setError(err instanceof ApiError ? err.message : 'Could not issue the claim.')
                    );
                }}
              >
                Issue claim
              </button>
            )}
          </span>
        </header>
        <div className="body">
          {lines.length === 0 ? (
            <p className="dim" style={{ margin: 0 }}>
              No lots on this claim yet. Add conformed lots from the list below.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Description</th>
                  <th>Cost code</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>Conformed</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">
                      <a
                        href={`#/lots/${l.lotId}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`#/lots/${l.lotId}`);
                        }}
                      >
                        {l.lotId}
                      </a>
                    </td>
                    <td>{l.lot?.description}</td>
                    <td className="mono dim">{l.costCode ?? '—'}</td>
                    <td className="num">
                      {l.quantity.toLocaleString()} {l.uom}
                    </td>
                    <td className="mono dim">{l.conformedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {period.status === 'open' && (
        <section className="card">
          <header>The gate — lots and why they can or cannot be claimed</header>
          <div className="body">
            <table>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.lot.id}>
                    <td className="mono">{c.lot.id}</td>
                    <td>{c.lot.description}</td>
                    <td>
                      {c.claimable ? (
                        <button className="btn small conform" onClick={() => add(c.lot.id)}>
                          Add to claim
                        </button>
                      ) : (
                        <span className="chip open-ncr" title={c.reason ?? ''}>
                          blocked
                        </span>
                      )}
                    </td>
                    <td className="dim" style={{ fontSize: 12 }}>
                      {c.reason ?? 'Conformed and unclaimed — ready.'}
                    </td>
                  </tr>
                ))}
                {candidates.length === 0 && (
                  <tr>
                    <td className="empty" colSpan={4}>
                      Nothing left to consider — every lot is on a claim or superseded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function NewPeriodForm({ onCreated }: { onCreated: () => Promise<void> }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card">
      <header>New claim period</header>
      <div className="body">
        {error && <div className="error-band">{error}</div>}
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const form = e.currentTarget;
            void api
              .createClaim(PROJECT_ID, {
                label: String(data.get('label')),
                periodStart: String(data.get('periodStart')),
                periodEnd: String(data.get('periodEnd')),
                createdBy: String(data.get('createdBy')) || null
              })
              .then(() => {
                form.reset();
                setError(null);
                return onCreated();
              })
              .catch((err: unknown) =>
                setError(err instanceof ApiError ? err.message : 'Could not create the claim period.')
              );
          }}
        >
          <label>
            Label
            <input name="label" required placeholder="PC-15 2026-08" />
          </label>
          <label>
            From
            <input name="periodStart" type="date" required />
          </label>
          <label>
            To
            <input name="periodEnd" type="date" required />
          </label>
          <label>
            Created by
            <input name="createdBy" placeholder="A. Contract Administrator" />
          </label>
          <button className="btn primary" type="submit">
            Create period
          </button>
        </form>
      </div>
    </section>
  );
}
