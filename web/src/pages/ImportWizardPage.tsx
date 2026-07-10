import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import type { Lot } from '../api';
import { navigate, PROJECT_ID } from '../App';
import { runImportPlan } from '../importRunner';
import { autoMapColumns } from '../../../src/lib/import/fields.js';
import { detectFormat } from '../../../src/lib/import/detect.js';
import { parseCsvTable } from '../../../src/lib/import/csv.js';
import { existingLotIdSet, planImport } from '../../../src/lib/import/plan.js';
import { IMPORT_FIELDS } from '../../../src/lib/import/types.js';
import type { FieldMapping, ImportField, ImportRowPlan, ParsedTable } from '../../../src/lib/import/types.js';
import type { ImportRunResult } from '../importRunner';

type Step = 'upload' | 'mapping' | 'preview' | 'summary';

/**
 * Guided import for Procore lot-register exports (CSV or XLSX):
 * upload → detect format → validate → preview → resolve issues → confirm
 * → summary. Mapping is auto-detected from common header spellings with
 * manual override; existing Lot IDs update in place (create-or-update),
 * new ones are created. Runs through the shared `api` client so it works
 * identically in both editions.
 */
export function ImportWizardPage(): JSX.Element {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [existingLots, setExistingLots] = useState<Lot[] | null>(null);
  const [plans, setPlans] = useState<ImportRowPlan[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [createdBy, setCreatedBy] = useState('');
  const [result, setResult] = useState<ImportRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .lots(PROJECT_ID)
      .then(setExistingLots)
      .catch(() => setExistingLots([]));
  }, []);

  const reset = (): void => {
    setStep('upload');
    setFileName('');
    setTable(null);
    setMapping({});
    setPlans([]);
    setResult(null);
    setError(null);
  };

  const onFile = async (file: File): Promise<void> => {
    setError(null);
    setFileName(file.name);
    try {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const format = detectFormat(file.name, head);
      let parsed: ParsedTable;
      if (format === 'xlsx') {
        const buf = await file.arrayBuffer();
        const { parseXlsx } = await import('../../../src/lib/import/xlsx.js');
        parsed = parseXlsx(buf);
      } else {
        const text = await file.text();
        parsed = parseCsvTable(text);
      }
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError('Could not find any rows in that file. Check it has a header row and at least one data row.');
        return;
      }
      setTable(parsed);
      setMapping(autoMapColumns(parsed.headers));
      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? `Could not read "${file.name}": ${err.message}` : 'Could not read the file.');
    }
  };

  const lotIdMapped = Object.values(mapping).includes('lotId');

  const goToPreview = (): void => {
    if (!table) return;
    const existing = existingLotIdSet(existingLots ?? []);
    setPlans(planImport(table.rows, mapping, existing));
    setStep('preview');
  };

  const counts = useMemo(() => {
    const c = { create: 0, update: 0, skip: 0, excluded: 0 };
    for (const p of plans) {
      if (!p.included) c.excluded++;
      else if (p.action === 'create') c.create++;
      else if (p.action === 'update') c.update++;
      else c.skip++;
    }
    return c;
  }, [plans]);

  const toggleRow = (i: number): void => {
    setPlans((prev) => prev.map((p, idx) => (idx === i ? { ...p, included: !p.included } : p)));
  };

  const runImport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const r = await runImportPlan(PROJECT_ID, plans, { createdBy: createdBy.trim() || undefined, updateExisting });
      setResult(r);
      setStep('summary');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="register-head">
        <h2>Import from a Procore export</h2>
        <span className="count">
          {(['upload', 'mapping', 'preview', 'summary'] as Step[]).map((s, i) => (
            <span key={s} className={`wizard-step${step === s ? ' active' : ''}`}>
              {i + 1}. {s === 'upload' ? 'Upload' : s === 'mapping' ? 'Map fields' : s === 'preview' ? 'Preview & confirm' : 'Summary'}
            </span>
          ))}
        </span>
      </div>

      {error && <div className="error-band">{error}</div>}

      {step === 'upload' && (
        <section className="card">
          <header>Step 1 — Upload a register export</header>
          <div className="body">
            <p style={{ marginTop: 0 }}>
              CSV or XLSX. The format is auto-detected from the file extension (falling back to its content
              if the extension is missing or wrong). Existing Lot IDs are updated in place; new ones are
              created — nothing is deleted.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </div>
        </section>
      )}

      {step === 'mapping' && table && (
        <section className="card">
          <header>Step 2 — Map columns ({fileName})</header>
          <div className="body">
            <p style={{ marginTop: 0 }} className="dim">
              Columns are auto-mapped from common header names; adjust any that guessed wrong. A Lot ID
              column is required — everything else is optional.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Source column</th>
                  <th>Sample value</th>
                  <th>Maps to</th>
                </tr>
              </thead>
              <tbody>
                {table.headers.map((h, i) => (
                  <tr key={i}>
                    <td className="mono">{h || `Column ${i + 1}`}</td>
                    <td className="dim">{table.rows[0]?.[i] ?? ''}</td>
                    <td>
                      <select
                        value={mapping[i] ?? ''}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [i]: e.target.value as ImportField | '' }))
                        }
                      >
                        <option value="">— Ignore this column —</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.field} value={f.field}>
                            {f.label}
                            {f.required ? ' (required)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!lotIdMapped && (
              <p style={{ color: 'var(--ncr)', fontSize: 13 }}>Map a column to Lot ID to continue.</p>
            )}
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={reset}>
                Start over
              </button>{' '}
              <button className="btn primary" disabled={!lotIdMapped} onClick={goToPreview}>
                Preview import
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'preview' && (
        <>
          <section className="card">
            <header>Step 3 — Preview, resolve issues &amp; confirm</header>
            <div className="body">
              <p style={{ marginTop: 0 }}>
                <span className="chip pass">{counts.create} to create</span>{' '}
                <span className="chip neutral">{counts.update} to update</span>{' '}
                <span className="chip pending">{counts.excluded} excluded</span>{' '}
                <span className="chip fail">{counts.skip} blocked</span>
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>Row</th>
                    <th>Lot ID</th>
                    <th>Action</th>
                    <th>Description</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          checked={p.included}
                          disabled={p.issues.some((iss) => iss.level === 'error')}
                          onChange={() => toggleRow(i)}
                        />
                      </td>
                      <td className="mono dim">{p.row}</td>
                      <td className="mono">{p.lotId ?? '—'}</td>
                      <td>
                        <span
                          className={`chip ${p.action === 'create' ? 'pass' : p.action === 'update' ? 'neutral' : 'fail'}`}
                        >
                          {p.action}
                        </span>
                      </td>
                      <td className="dim" style={{ fontSize: 12 }}>
                        {String(p.fields.description ?? '')}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.issues.map((iss, j) => (
                          <div key={j} style={{ color: iss.level === 'error' ? 'var(--ncr)' : 'var(--hold)' }}>
                            {iss.message}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {plans.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No data rows found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <header>Confirm</header>
            <div className="body">
              <form className="inline" onSubmit={(e) => e.preventDefault()}>
                <label>
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    style={{ minWidth: 'auto' }}
                  />{' '}
                  Update existing lots with matching IDs
                </label>
                <label>
                  Recorded as (your name / role)
                  <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} placeholder="A. Engineer" />
                </label>
              </form>
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={reset}>
                  Start over
                </button>{' '}
                <button className="btn" onClick={() => setStep('mapping')}>
                  Back to mapping
                </button>{' '}
                <button className="btn primary" disabled={busy} onClick={() => void runImport()}>
                  {busy ? 'Importing…' : `Run import (${counts.create + counts.update} lot${counts.create + counts.update === 1 ? '' : 's'})`}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {step === 'summary' && result && (
        <section className="card">
          <header>Step 4 — Summary</header>
          <div className="body">
            <p style={{ marginTop: 0 }}>
              <span className="chip pass">{result.created} created</span>{' '}
              <span className="chip neutral">{result.updated} updated</span>{' '}
              <span className="chip pending">{result.skipped} skipped</span>{' '}
              {result.failed.length > 0 && <span className="chip fail">{result.failed.length} failed</span>}
            </p>
            {result.failed.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Lot ID</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failed.map((f, i) => (
                    <tr key={i}>
                      <td className="mono dim">{f.row}</td>
                      <td className="mono">{f.lotId ?? '—'}</td>
                      <td>{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => navigate('#/lots')}>
                Go to lot register
              </button>{' '}
              <button className="btn" onClick={reset}>
                Import another file
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
