import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { ReportSummary, ReportToolResult } from '../api';
import { PROJECT_ID } from '../App';

/**
 * Cross-tool reporting dashboard: pulls live from Procore (Inspections,
 * Observations, Incidents, Punch List, Daily Log, RFIs, Submittals,
 * Budget) and renders one card per tool with a link back to the source
 * record in Procore. Server edition + an active Procore connection only
 * (see ReportingService) — there is nothing for the static edition to
 * pull from.
 */
export function ReportsPage(): JSX.Element {
  const [qualitySafety, setQualitySafety] = useState<ReportSummary | null>(null);
  const [fieldProductivity, setFieldProductivity] = useState<ReportSummary | null>(null);
  const [projectControls, setProjectControls] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qs, fp, pc] = await Promise.all([
        api.reportsQualitySafety(PROJECT_ID),
        api.reportsFieldProductivity(PROJECT_ID),
        api.reportsProjectControls(PROJECT_ID)
      ]);
      setQualitySafety(qs);
      setFieldProductivity(fp);
      setProjectControls(pc);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load the reporting dashboard. Is this project connected to Procore?'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="register-head">
        <h2>Reports</h2>
        <span className="count">
          Live from Procore — nothing here is stored by OpenLot. Every row links back to the source record.
        </span>
        <span className="spacer" />
        <button className="btn" disabled={loading} onClick={() => void load()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-band">{error}</div>}

      <ReportSection title="Quality &amp; Safety" summary={qualitySafety} />
      <ReportSection title="Field Productivity" summary={fieldProductivity} />
      <ReportSection title="Project Controls" summary={projectControls} />
    </>
  );
}

function ReportSection({ title, summary }: { title: string; summary: ReportSummary | null }): JSX.Element {
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>{title}</h3>
      {!summary ? (
        <p className="dim">Loading…</p>
      ) : (
        <div className="report-grid">
          {summary.tools.map((tool) => (
            <ToolCard key={tool.tool} tool={tool} />
          ))}
        </div>
      )}
    </section>
  );
}

function ToolCard({ tool }: { tool: ReportToolResult }): JSX.Element {
  return (
    <div>
      <section className="card">
        <header>
          {tool.tool} ({tool.items.length})
        </header>
        <div className="body">
          {!tool.ok ? (
            <p style={{ margin: 0, color: 'var(--ncr)', fontSize: 13 }}>
              Couldn't load this tool: {tool.error}. This usually means the endpoint path needs adjusting for
              your Procore API version — see the comments in src/procore/client.ts.
            </p>
          ) : tool.items.length === 0 ? (
            <p className="dim" style={{ margin: 0 }}>
              Nothing to show.
            </p>
          ) : (
            <table>
              <tbody>
                {tool.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <a href={item.procoreUrl} target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                      {item.detail && (
                        <>
                          <br />
                          <span className="dim" style={{ fontSize: 12 }}>
                            {item.detail}
                          </span>
                        </>
                      )}
                    </td>
                    {item.status && (
                      <td>
                        <span className="chip neutral">{item.status.replace(/_/g, ' ')}</span>
                      </td>
                    )}
                    {item.date && <td className="mono dim">{item.date.slice(0, 10)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
