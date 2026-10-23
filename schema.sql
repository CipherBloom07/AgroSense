-- AgroSense by CipherBloom
-- PostgreSQL schema for the database-backed implementation.
-- Safe to run in a new, dedicated AgroSense database.
-- No sensor, paid API, or extension dependency is required.

BEGIN;

CREATE TABLE IF NOT EXISTS schemes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    location_description VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT schemes_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS fields (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE RESTRICT,
    field_code VARCHAR(60) NOT NULL,
    crop_name VARCHAR(80) NOT NULL,
    area_hectares NUMERIC(12, 3) NOT NULL,
    soil_type VARCHAR(80),
    growth_stage VARCHAR(80),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fields_code_not_blank CHECK (length(trim(field_code)) > 0),
    CONSTRAINT fields_crop_not_blank CHECK (length(trim(crop_name)) > 0),
    CONSTRAINT fields_area_positive CHECK (area_hectares > 0),
    CONSTRAINT fields_scheme_code_unique UNIQUE (scheme_id, field_code)
);

CREATE TABLE IF NOT EXISTS water_plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    field_id BIGINT NOT NULL REFERENCES fields(id) ON DELETE RESTRICT,
    target_depth_mm_per_day NUMERIC(10, 3) NOT NULL,
    application_efficiency_percent NUMERIC(5, 2) NOT NULL,
    net_volume_m3_per_day NUMERIC(14, 3) NOT NULL,
    gross_volume_m3_per_day NUMERIC(14, 3) NOT NULL,
    calculation_method VARCHAR(120) NOT NULL DEFAULT 'area_x_depth_x_10_divided_by_efficiency',
    assumptions TEXT,
    data_source VARCHAR(40) NOT NULL DEFAULT 'user_entered',
    planned_for DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT water_depth_nonnegative CHECK (target_depth_mm_per_day >= 0),
    CONSTRAINT water_efficiency_valid CHECK (application_efficiency_percent > 0 AND application_efficiency_percent <= 100),
    CONSTRAINT water_net_nonnegative CHECK (net_volume_m3_per_day >= 0),
    CONSTRAINT water_gross_nonnegative CHECK (gross_volume_m3_per_day >= 0),
    CONSTRAINT water_source_valid CHECK (data_source IN ('user_entered', 'sample', 'external_verified'))
);

CREATE TABLE IF NOT EXISTS crop_observations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    field_id BIGINT NOT NULL REFERENCES fields(id) ON DELETE RESTRICT,
    observed_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    growth_stage VARCHAR(80),
    symptoms TEXT NOT NULL,
    soil_condition VARCHAR(100),
    notes TEXT,
    preliminary_guidance TEXT,
    guidance_basis VARCHAR(40) NOT NULL DEFAULT 'rule_based',
    follow_up_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT observation_symptoms_not_blank CHECK (length(trim(symptoms)) > 0),
    CONSTRAINT observation_guidance_basis_valid CHECK (guidance_basis IN ('rule_based', 'user_recorded', 'sample'))
);

CREATE TABLE IF NOT EXISTS infrastructure_faults (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE RESTRICT,
    field_id BIGINT REFERENCES fields(id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    asset_type VARCHAR(80),
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    reported_by VARCHAR(120),
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fault_title_not_blank CHECK (length(trim(title)) > 0),
    CONSTRAINT fault_description_not_blank CHECK (length(trim(description)) > 0),
    CONSTRAINT fault_severity_valid CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT fault_status_valid CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    CONSTRAINT fault_resolution_date_valid CHECK (resolved_at IS NULL OR resolved_at >= reported_at)
);

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE RESTRICT,
    field_id BIGINT REFERENCES fields(id) ON DELETE SET NULL,
    fault_id BIGINT REFERENCES infrastructure_faults(id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT,
    assigned_to VARCHAR(120),
    priority VARCHAR(20) NOT NULL DEFAULT 'routine',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    due_date DATE,
    completed_at TIMESTAMPTZ,
    completion_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT task_title_not_blank CHECK (length(trim(title)) > 0),
    CONSTRAINT task_priority_valid CHECK (priority IN ('low', 'routine', 'high', 'urgent')),
    CONSTRAINT task_status_valid CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_fields_scheme_id ON fields(scheme_id);
CREATE INDEX IF NOT EXISTS idx_water_plans_field_date ON water_plans(field_id, planned_for DESC);
CREATE INDEX IF NOT EXISTS idx_observations_field_date ON crop_observations(field_id, observed_on DESC);
CREATE INDEX IF NOT EXISTS idx_faults_scheme_status ON infrastructure_faults(scheme_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheme_status ON maintenance_tasks(scheme_id, status);

-- Keep updated_at accurate whenever editable records change.
CREATE OR REPLACE FUNCTION agrosense_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schemes_updated_at ON schemes;
CREATE TRIGGER trg_schemes_updated_at BEFORE UPDATE ON schemes
FOR EACH ROW EXECUTE FUNCTION agrosense_set_updated_at();

DROP TRIGGER IF EXISTS trg_fields_updated_at ON fields;
CREATE TRIGGER trg_fields_updated_at BEFORE UPDATE ON fields
FOR EACH ROW EXECUTE FUNCTION agrosense_set_updated_at();

DROP TRIGGER IF EXISTS trg_faults_updated_at ON infrastructure_faults;
CREATE TRIGGER trg_faults_updated_at BEFORE UPDATE ON infrastructure_faults
FOR EACH ROW EXECUTE FUNCTION agrosense_set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON maintenance_tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON maintenance_tasks
FOR EACH ROW EXECUTE FUNCTION agrosense_set_updated_at();

COMMIT;
