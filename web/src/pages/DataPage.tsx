import { useRef, useState } from 'react';
import { ApiError } from '../api';
import { localData } from '../local';
import { PROJECT_ID } from '../App';

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataPage(): JSX.Element {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<string>) => (): void => {
    setError(null);
    setNotice(null);
    void fn()
      .then(setNotice)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : String(err)));
  };

  const readFile = (input: HTMLInputElement | null): Promise<string> =>
    new Promise((resolve, reject) => {
      const file = input?.files?.[0];
      if (!file) return reject(new ApiError('Choose a file first.', 400));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new ApiError('Could not read the file.', 400));
      reader.readAsText(file);
    });

  return (
    <>
      <div className="register-head">
        <h2>Your data</h2>
        <span className="count">
          Everything lives in this browser — nothing is sent to any server. Back it up.
        </span>
      </div>

      {error && <div className="error-band">{error}</div>}
      {notice && <div className="notice-band">{notice}</div>}

      <div className="dossier">
        <div>
          <section className="card">
            <header>Backup &amp; restore</header>
            <div className="body">
              <p style={{ marginTop: 0 }}>
                Download the full register — lots, evidence, tests, claims — as a single JSON file.
                Store it with your project records; restoring it on any machine recreates the register
                exactly. <strong>Browser storage is per-browser and per-device</strong>, so regular
                backups are your responsibility in this edition.
              </p>
              <button
                className="btn primary"
                onClick={run(async () => {
                  download(
                    `openlot-register-${new Date().toISOString().slice(0, 10)}.json`,
                    localData.exportJson(),
                    'application/json'
                  );
                  return 'Backup downloaded.';
                })}
              >
                Download backup
              </button>
              <div style={{ marginTop: 14 }}>
                <input ref={jsonInput} type="file" accept=".json,application/json" />
                <button
                  className="btn"
                  onClick={run(async () => {
                    const text = await readFile(jsonInput.current);
                    if (!window.confirm('Restoring replaces everything currently in this browser. Continue?')) {
                      return 'Restore cancelled.';
                    }
                    await localData.importJson(text);
                    return 'Register restored from backup.';
                  })}
                >
                  Restore from backup
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <header>Import an existing lot register (CSV)</header>
            <div className="body">
              <p style={{ marginTop: 0 }}>
                Migrate a "lot lite" spreadsheet in one step. Required columns: <span className="mono">Lot ID</span>,{' '}
                <span className="mono">Description</span>, <span className="mono">Work Type</span>; recognised
                extras: Spec/ITP Ref, Cost Code, Pay Item, Qty, UoM, Status, Notes (see{' '}
                <span className="mono">examples/sample-lot-register.csv</span>). Lots arrive as Open or Work
                complete only — conformed status is never imported, because conformance must be earned through
                the evidence rules, not asserted by a spreadsheet.
              </p>
              <input ref={csvInput} type="file" accept=".csv,text/csv" />
              <button
                className="btn"
                onClick={run(async () => {
                  const text = await readFile(csvInput.current);
                  const result = await localData.importRegisterCsv(text, PROJECT_ID);
                  return (
                    `Imported ${result.imported} lot${result.imported === 1 ? '' : 's'}.` +
                    (result.skipped.length ? ` Skipped: ${result.skipped.join('; ')}` : '')
                  );
                })}
              >
                Import register CSV
              </button>
            </div>
          </section>
        </div>

        <div>
          <section className="card">
            <header>Sample project</header>
            <div className="body">
              <p style={{ marginTop: 0 }}>
                Load <em>Kestrel Ridge Stage 2</em> — a worked example with lots in every state, including a
                blocked stormwater lot and a pavement lot missing its ATS 1120 geo-reference. Replaces current
                data.
              </p>
              <button
                className="btn"
                onClick={run(async () => {
                  if (!window.confirm('Loading the sample replaces everything currently in this browser. Continue?')) {
                    return 'Cancelled.';
                  }
                  await localData.loadSample();
                  return 'Sample project loaded.';
                })}
              >
                Load sample project
              </button>
            </div>
          </section>

          <section className="card">
            <header>Start fresh</header>
            <div className="body">
              <p style={{ marginTop: 0 }}>Wipe this browser's register completely. Download a backup first.</p>
              <button
                className="btn"
                onClick={run(async () => {
                  if (!window.confirm('This permanently deletes the register in this browser. Continue?')) {
                    return 'Cancelled.';
                  }
                  await localData.wipe();
                  return 'Register wiped.';
                })}
              >
                Wipe register
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
