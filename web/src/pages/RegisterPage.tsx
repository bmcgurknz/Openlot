import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, STATUS_LABELS, WORK_TYPE_NAMES } from '../api';
import type { Lot, LotStatus } from '../api';
import { fmtQty, LotBar, navigate, PROJECT_ID } from '../App';

type SortDir = 'asc' | 'desc';
type SortValue = string | number | null;

interface ColumnDef {
  key: string;
  label: string;
  accessor: (l: Lot) => SortValue;
  align?: 'right';
  render: (l: Lot) => JSX.Element | string;
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'Lot ID', accessor: (l) => l.id, className: 'mono', render: (l) => l.id },
  { key: 'description', label: 'Description', accessor: (l) => l.description, render: (l) => l.description },
  {
    key: 'workType',
    label: 'Work type',
    accessor: (l) => WORK_TYPE_NAMES[l.workType] ?? l.workType,
    render: (l) => WORK_TYPE_NAMES[l.workType] ?? l.workType
  },
  {
    key: 'specReference',
    label: 'Spec / ITP ref',
    accessor: (l) => l.specReference,
    className: 'mono dim',
    render: (l) => l.specReference ?? '—'
  },
  {
    key: 'costCode',
    label: 'Cost code',
    accessor: (l) => l.costCode,
    className: 'mono dim',
    render: (l) => l.costCode ?? '—'
  },
  { key: 'builder', label: 'Builder', accessor: (l) => l.builder, render: (l) => l.builder ?? '—' },
  { key: 'stage', label: 'Stage', accessor: (l) => l.stage, render: (l) => l.stage ?? '—' },
  { key: 'owner', label: 'Owner', accessor: (l) => l.owner, render: (l) => l.owner ?? '—' },
  {
    key: 'quantity',
    label: 'Qty',
    accessor: (l) => l.quantity,
    align: 'right',
    className: 'num',
    render: (l) => fmtQty(l)
  },
  {
    key: 'createdAt',
    label: 'Date created',
    accessor: (l) => l.createdAt,
    className: 'mono dim',
    render: (l) => (l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '—')
  },
  { key: 'status', label: 'Status', accessor: (l) => l.status, render: (l) => STATUS_LABELS[l.status] }
];

export function RegisterPage(): JSX.Element {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | LotStatus>('');
  const [showForm, setShowForm] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const load = useCallback(async () => {
    try {
      setLots(await api.lots(PROJECT_ID));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the lot register.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = (lots ?? []).filter((l) => !statusFilter || l.status === statusFilter);

  /** Click cycles a column through: default (register order) → asc → desc → default. */
  const toggleSort = (key: string): void => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const sortedVisible = useMemo(() => {
    if (!sort) return visible;
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return visible;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...visible].sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls sort last regardless of direction
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [visible, sort]);

  return (
    <>
      <div className="register-head">
        <h2>Lot register</h2>
        <span className="count">
          {lots ? `${visible.length} of ${lots.length} lots` : 'Loading…'}
        </span>
        <span className="spacer" />
        <form className="inline" onSubmit={(e) => e.preventDefault()}>
          <label>
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | LotStatus)}>
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </form>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Open new lot'}
        </button>
      </div>

      {error && <div className="error-band">{error}</div>}
      {showForm && (
        <NewLotForm
          onCreated={(lot) => {
            setShowForm(false);
            void load();
            navigate(`#/lots/${lot.id}`);
          }}
        />
      )}

      <table className="register">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  className={`sortable${active ? ' sort-active' : ''}`}
                  style={col.align === 'right' ? { textAlign: 'right' } : undefined}
                  onClick={() => toggleSort(col.key)}
                  title="Click to sort"
                >
                  {col.label}
                  <span className="sort-arrow">{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedVisible.map((lot) => (
            <tr
              key={lot.id}
              className={`clickable${lot.status === 'superseded' ? ' superseded' : ''}`}
              onClick={() => navigate(`#/lots/${lot.id}`)}
            >
              {COLUMNS.map((col) =>
                col.key === 'status' ? (
                  <td key={col.key}>
                    <LotBar status={lot.status} />
                    <span className={`status-word${lot.status === 'conformed' ? ' conformed' : ''}`}>
                      {STATUS_LABELS[lot.status]}
                    </span>
                  </td>
                ) : (
                  <td key={col.key} className={col.className}>
                    {col.render(lot)}
                  </td>
                )
              )}
            </tr>
          ))}
          {lots && visible.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="empty">
                No lots match this filter. Open a new lot to start the register.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function NewLotForm({ onCreated }: { onCreated: (lot: Lot) => void }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <header>Open new lot</header>
      <div className="body">
        {error && <div className="error-band">{error}</div>}
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            api
              .createLot(PROJECT_ID, {
                workType: String(data.get('workType')),
                description: String(data.get('description')),
                specReference: String(data.get('specReference')) || null,
                costCode: String(data.get('costCode')) || null,
                paymentItemNumber: String(data.get('paymentItemNumber')) || null,
                quantity: data.get('quantity') ? Number(data.get('quantity')) : null,
                uom: String(data.get('uom')) || null,
                builder: String(data.get('builder')) || null,
                stage: String(data.get('stage')) || null,
                owner: String(data.get('owner')) || null
              })
              .then(onCreated)
              .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not create the lot.'))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Work type
            <select name="workType" defaultValue="EW">
              {Object.entries(WORK_TYPE_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} — {name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 260 }}>
            Description (include chainage / extent)
            <input name="description" required placeholder="Ch 1200–1350 LHS, select fill layer 2" />
          </label>
          <label>
            Spec / ITP ref
            <input name="specReference" placeholder="ITP-EW-01" />
          </label>
          <label>
            Cost code
            <input name="costCode" placeholder="02-230" />
          </label>
          <label>
            Pay item
            <input name="paymentItemNumber" placeholder="2.3" style={{ minWidth: 60 }} />
          </label>
          <label>
            Qty
            <input name="quantity" type="number" step="0.001" min="0" style={{ minWidth: 70 }} />
          </label>
          <label>
            UoM
            <input name="uom" placeholder="m3" style={{ minWidth: 60 }} />
          </label>
          <label>
            Builder
            <input name="builder" placeholder="Hallmark Homes" />
          </label>
          <label>
            Stage
            <input name="stage" placeholder="Stage 2" />
          </label>
          <label>
            Owner
            <input name="owner" placeholder="J. & K. Smith" />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Opening…' : 'Open lot'}
          </button>
        </form>
      </div>
    </div>
  );
}
