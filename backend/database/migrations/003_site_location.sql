-- Expand sites with location and status fields used by create-site form.
-- Nullable so existing rows remain valid (expand/contract).

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS country_code CHAR(2),
    ADD COLUMN IF NOT EXISTS elevation_m DECIMAL(6,1),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS city VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line TEXT;

CREATE INDEX IF NOT EXISTS idx_sites_tenant_country
    ON sites (tenant_id, country_code);
