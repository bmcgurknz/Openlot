-- v1.3: audit history, lot provenance/date-created, claim createdBy,
-- and subdivision fields (builder/stage/owner).
ALTER TABLE lots ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE lots ADD COLUMN builder text;
ALTER TABLE lots ADD COLUMN stage text;
ALTER TABLE lots ADD COLUMN owner text;
ALTER TABLE claim_periods ADD COLUMN created_by text;

CREATE TABLE lot_history (
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL,
  lot_id text NOT NULL,
  at timestamptz NOT NULL,
  "user" text NOT NULL,
  field text NOT NULL,
  previous_value text,
  new_value text
);
CREATE INDEX lot_history_lot ON lot_history (project_id, lot_id, at DESC);
