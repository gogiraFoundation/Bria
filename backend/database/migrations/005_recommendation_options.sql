-- Technology shortlist rows for a recommendation run.

CREATE TYPE technology_class AS ENUM (
    'pv_fixed', 'pv_tracker', 'pv_rooftop',
    'wind_onshore', 'wind_small',
    'battery', 'hybrid'
);

CREATE TABLE IF NOT EXISTS recommendation_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
    technology_class technology_class NOT NULL,
    rank INTEGER NOT NULL,
    eligible BOOLEAN NOT NULL,
    exclusion_reason TEXT,
    capacity_mw NUMERIC(10,3),
    storage_kwh NUMERIC(12,2),
    solar_fraction NUMERIC(4,3),
    annual_mwh NUMERIC(14,3),
    renewable_fraction NUMERIC(4,3),
    lcoe_usd_per_mwh NUMERIC(10,2),
    payback_years NUMERIC(6,2),
    npv_usd NUMERIC(16,2),
    assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (run_id, technology_class)
);

CREATE INDEX IF NOT EXISTS idx_options_run_rank
    ON recommendation_options (run_id, rank);
