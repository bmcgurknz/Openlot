-- OpenLot initial schema
-- Applied by `npm run migrate` (src/db/migrate.ts), tracked in _migrations.

CREATE TABLE IF NOT EXISTS _migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lots (
  id TEXT NOT NULL,                        -- LOT-EW-0014
  project_id BIGINT NOT NULL,              -- Procore project id
  description TEXT NOT NULL,
  work_type TEXT NOT NULL,
  spec_reference TEXT,
  cost_code TEXT,
  quantity NUMERIC(14,3),
  uom TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','work_complete','conformed','closed','superseded')),
  opened_at DATE NOT NULL,
  work_complete_at DATE,
  conformed_at DATE,
  closed_at DATE,
  superseded_by TEXT,
  hold_point_released BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);
CREATE INDEX lots_status_idx ON lots (project_id, status);
CREATE INDEX lots_work_type_idx ON lots (project_id, work_type);

CREATE TABLE linked_inspections (
  procore_id BIGINT PRIMARY KEY,           -- Procore checklist list id
  lot_id TEXT NOT NULL,
  project_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  template_name TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('open','in_progress','passed','failed','not_applicable')),
  inspection_date DATE,
  items_total INT NOT NULL DEFAULT 0,
  items_passed INT NOT NULL DEFAULT 0,
  items_failed INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX linked_inspections_lot_idx ON linked_inspections (project_id, lot_id);

CREATE TABLE linked_ncrs (
  procore_id BIGINT PRIMARY KEY,           -- Procore observation item id
  lot_id TEXT NOT NULL,
  project_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('open','ready_for_review','closed','void')),
  created_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX linked_ncrs_lot_idx ON linked_ncrs (project_id, lot_id);

CREATE TABLE test_records (
  id UUID PRIMARY KEY,
  lot_id TEXT NOT NULL,
  project_id BIGINT NOT NULL,
  test_type TEXT NOT NULL,
  lab_reference TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','sampled','results_received','passed','failed')),
  requested_at DATE NOT NULL,
  result_at DATE,
  document_url TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX test_records_lot_idx ON test_records (project_id, lot_id);

CREATE TABLE quantity_entries (
  id UUID PRIMARY KEY,
  lot_id TEXT NOT NULL,
  project_id BIGINT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('daily_log','manual')),
  procore_id BIGINT,
  date DATE NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  uom TEXT NOT NULL,
  cost_code TEXT,
  notes TEXT
);
CREATE UNIQUE INDEX quantity_entries_procore_idx
  ON quantity_entries (procore_id) WHERE procore_id IS NOT NULL;
CREATE INDEX quantity_entries_lot_idx ON quantity_entries (project_id, lot_id);

CREATE TABLE claim_periods (
  id UUID PRIMARY KEY,
  project_id BIGINT NOT NULL,
  label TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','issued','certified')),
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX claim_periods_project_idx ON claim_periods (project_id, period_end DESC);

CREATE TABLE claim_lines (
  id UUID PRIMARY KEY,
  claim_period_id UUID NOT NULL REFERENCES claim_periods(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  uom TEXT NOT NULL,
  cost_code TEXT,
  conformed_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (claim_period_id, lot_id)
);
CREATE INDEX claim_lines_lot_idx ON claim_lines (lot_id);

CREATE TABLE procore_connections (
  id SERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  company_name TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,          -- AES-256-GCM, key = TOKEN_ENCRYPTION_KEY
  refresh_token_enc TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resource_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  resource_id BIGINT NOT NULL,
  project_id BIGINT,
  outcome TEXT NOT NULL CHECK (outcome IN ('linked','ignored_no_lot_id','ignored_resource','error')),
  detail TEXT
);
CREATE INDEX webhook_events_received_idx ON webhook_events (received_at DESC);
