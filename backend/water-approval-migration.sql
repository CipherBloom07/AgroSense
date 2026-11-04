-- AgroSense Water Intelligence approval workflow migration
-- Run after schema.sql. Adds authenticated users, scheme memberships,
-- plan lifecycle tracking, review history and actual irrigation records.

BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheme_memberships (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('farmer','irrigation_officer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, scheme_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE water_plans
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS review_comment TEXT,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE water_plans ADD CONSTRAINT water_plans_status_valid
    CHECK (status IN ('draft','submitted','under_review','changes_requested','approved','rejected','completed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS water_plan_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  water_plan_id BIGINT NOT NULL REFERENCES water_plans(id) ON DELETE RESTRICT,
  reviewer_id BIGINT NOT NULL REFERENCES app_users(id),
  decision VARCHAR(30) NOT NULL CHECK (decision IN ('under_review','approved','changes_requested','rejected')),
  comment TEXT,
  plan_revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS irrigation_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  water_plan_id BIGINT NOT NULL REFERENCES water_plans(id) ON DELETE RESTRICT,
  field_id BIGINT NOT NULL REFERENCES fields(id) ON DELETE RESTRICT,
  recorded_by BIGINT NOT NULL REFERENCES app_users(id),
  applied_on TIMESTAMPTZ NOT NULL,
  actual_volume_m3 NUMERIC(14,3) NOT NULL CHECK (actual_volume_m3 >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_scheme ON scheme_memberships(user_id, scheme_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_expiry ON auth_sessions(token_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_water_plans_status_date ON water_plans(status, planned_for DESC);
CREATE INDEX IF NOT EXISTS idx_plan_reviews_plan_date ON water_plan_reviews(water_plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_irrigation_events_field_date ON irrigation_events(field_id, applied_on DESC);

COMMIT;
