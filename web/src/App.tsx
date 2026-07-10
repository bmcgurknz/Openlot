import { useCallback, useEffect, useState } from 'react';
import { api, STATIC_EDITION } from './api';
import type { Lot, LotStatus } from './api';
import { ClaimsPage } from './pages/ClaimsPage';
import { DataPage } from './pages/DataPage';
import { ImportWizardPage } from './pages/ImportWizardPage';
import { LotDetailPage } from './pages/LotDetailPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReportsPage } from './pages/ReportsPage';

/**
 * Dependency-free hash routing:
 *   #/lots            register
 *   #/lots/LOT-EW-0014 lot dossier
 *   #/claims          claim periods & gate
 *
 * Project ID resolution order: a `?project_id=` query param (how Procore's
 * embedded-app launch is expected to pass the current project — confirm
 * the exact param name your Configuration Builder launch URL produces and
 * adjust here if it differs), then VITE_PROJECT_ID, then the demo project.
 */
function resolveProjectId(): number {
  const fromQuery = new URLSearchParams(window.location.search).get('project_id');
  if (fromQuery && !Number.isNaN(Number(fromQuery))) return Number(fromQuery);
  return Number(import.meta.env.VITE_PROJECT_ID ?? 316);
}

export const PROJECT_ID = resolveProjectId();

export function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || '#/lots');
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash || '#/lots');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

/**
 * True when running inside Procore's embedded-app iframe (full-screen or
 * side-panel launch) rather than the standalone edition. Procore's own
 * login page refuses to render inside an iframe, so the "Connect to
 * Procore" flow below opens a popup instead of navigating this window —
 * see /auth/procore and /auth/procore/callback in src/server.ts.
 */
export const EMBEDDED = typeof window !== 'undefined' && window.self !== window.top;

/* Shared presentational pieces ---------------------------------------- */

const ORDER: LotStatus[] = ['open', 'work_complete', 'conformed', 'closed'];

export function LotBar({ status }: { status: LotStatus }): JSX.Element {
  if (status === 'superseded') {
    return (
      <span className="lotbar superseded" role="img" aria-label="Superseded">
        {ORDER.map((s) => (
          <i key={s} />
        ))}
      </span>
    );
  }
  const reached = ORDER.indexOf(status);
  return (
    <span className="lotbar" role="img" aria-label={`Status: ${status.replace('_', ' ')}`}>
      {ORDER.map((s, i) => (
        <i key={s} className={i <= reached ? (s === 'conformed' || s === 'closed' ? 'conform done' : 'done') : ''} />
      ))}
    </span>
  );
}

export function fmtQty(lot: Lot): string {
  if (lot.quantity == null || !lot.uom) return '—';
  return `${lot.quantity.toLocaleString()} ${lot.uom}`;
}

/* App shell -------------------------------------------------------------- */

export default function App(): JSX.Element {
  const route = useHashRoute();
  const [conn, setConn] = useState<string>('');
  const [connected, setConnected] = useState<boolean | null>(null); // null = static/demo — no connect action to offer

  const refreshConnection = useCallback(async () => {
    try {
      if (STATIC_EDITION) {
        setConn('Static edition — data stored in this browser');
        setConnected(null);
        return;
      }
      const health = await api.health();
      if (health.demoMode) {
        setConn('Demo mode — sample data');
        setConnected(null);
        return;
      }
      const c = await api.connection();
      setConn(c.connected ? `Procore: ${c.companyName}` : 'Not connected to Procore');
      setConnected(c.connected);
    } catch {
      setConn('API unreachable');
      setConnected(null);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  // The embedded-app popup OAuth flow (see EMBEDDED above) posts a message
  // back to this window when it finishes instead of navigating anywhere;
  // pick that up and refresh the connection status.
  useEffect(() => {
    function onMessage(e: MessageEvent): void {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string } | null;
      if (data?.source !== 'openlot-oauth') return;
      void refreshConnection();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshConnection]);

  const connectToProcore = (): void => {
    if (EMBEDDED) {
      window.open('/auth/procore?popup=1', 'openlot-connect', 'width=520,height=650');
    } else {
      window.location.href = '/auth/procore';
    }
  };

  const section = route.startsWith('#/claims')
    ? 'claims'
    : route.startsWith('#/reports')
      ? 'reports'
      : route.startsWith('#/import')
        ? 'import'
        : route.startsWith('#/data')
          ? 'data'
          : 'lots';
  const lotMatch = /^#\/lots\/([^/]+)$/.exec(route);

  return (
    <>
      <header className="titleblock">
        {!EMBEDDED && (
          <div className="brand">
            <h1>
              PROC<span className="dot">O</span>RE <span className="mono">| OpenLot</span>
            </h1>
            <p>Lot conformance register — ATS 1120 aligned</p>
          </div>
        )}
        <nav aria-label="Sections">
          <button aria-current={section === 'lots'} onClick={() => navigate('#/lots')}>
            Lot register
          </button>
          <button aria-current={section === 'claims'} onClick={() => navigate('#/claims')}>
            Progress claims
          </button>
          <button aria-current={section === 'import'} onClick={() => navigate('#/import')}>
            Import
          </button>
          {!STATIC_EDITION && (
            <button aria-current={section === 'reports'} onClick={() => navigate('#/reports')}>
              Reports
            </button>
          )}
          {STATIC_EDITION && (
            <button aria-current={section === 'data'} onClick={() => navigate('#/data')}>
              Your data
            </button>
          )}
        </nav>
        <div className="conn">
          {conn}
          {connected === false && (
            <button className="btn small" style={{ marginLeft: 10 }} onClick={connectToProcore}>
              Connect to Procore
            </button>
          )}
        </div>
      </header>
      <main>
        {lotMatch ? (
          <LotDetailPage lotId={decodeURIComponent(lotMatch[1]!)} />
        ) : section === 'claims' ? (
          <ClaimsPage />
        ) : section === 'import' ? (
          <ImportWizardPage />
        ) : section === 'reports' ? (
          <ReportsPage />
        ) : section === 'data' ? (
          <DataPage />
        ) : (
          <RegisterPage />
        )}
      </main>
    </>
  );
}
