-- Load profiles and recommendation runs for prospect / planning flow.
-- CREATE TYPE is idempotent via the migration runner (duplicate → skip).

CREATE TYPE grid_mode AS ENUM ('firm_grid', 'weak_grid', 'off_grid');

CREATE TYPE recommendation_objective AS ENUM (
    'min_cost_to_serve', 'max_renewable_fraction', 'min_payback'
);

CREATE TABLE IF NOT EXISTS load_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    annual_kwh NUMERIC(14,2) NOT NULL CHECK (annual_kwh > 0),
    peak_kw NUMERIC(12,3) NOT NULL CHECK (peak_kw > 0),
    critical_fraction NUMERIC(4,3) NOT NULL DEFAULT 0
        CHECK (critical_fraction >= 0 AND critical_fraction <= 1),
    backup_hours NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (backup_hours >= 0),
    grid_mode grid_mode NOT NULL,
    hourly_kw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_load_profiles_tenant
    ON load_profiles (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    load_profile_id UUID REFERENCES load_profiles(id),
    objective recommendation_objective NOT NULL,
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    country_code CHAR(2),
    assumptions JSONB NOT NULL,
    data_quality VARCHAR(16) NOT NULL,
    model_version VARCHAR(32) NOT NULL,
    result JSONB,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_tenant_created
    ON recommendation_runs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_site_created
    ON recommendation_runs (site_id, created_at DESC)
    WHERE site_id IS NOT NULL;
