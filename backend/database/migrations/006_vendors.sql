-- Global vendor catalogue (no tenant_id) and per-run matches.

CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(255) NOT NULL,
    website_url TEXT NOT NULL,
    contact_url TEXT,
    countries CHAR(2)[] NOT NULL,
    last_verified_on DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    technology_class technology_class NOT NULL,
    min_capacity_mw NUMERIC(10,3) NOT NULL,
    max_capacity_mw NUMERIC(10,3) NOT NULL,
    notes TEXT,
    CHECK (min_capacity_mw <= max_capacity_mw)
);

CREATE INDEX IF NOT EXISTS idx_vendor_products_class
    ON vendor_products (technology_class);

CREATE TABLE IF NOT EXISTS vendor_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES recommendation_options(id) ON DELETE CASCADE,
    vendor_product_id UUID NOT NULL REFERENCES vendor_products(id),
    fit_notes TEXT NOT NULL,
    UNIQUE (option_id, vendor_product_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_matches_run
    ON vendor_matches (run_id);
