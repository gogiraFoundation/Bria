-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable PostGIS for geographic data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create custom types
CREATE TYPE SITE_TYPE AS ENUM ('solar', 'wind', 'hybrid');
CREATE TYPE STATION_STATUS AS ENUM ('active', 'inactive', 'maintenance', 'decommissioned');
CREATE TYPE FORECAST_TYPE AS ENUM ('solar', 'wind', 'hybrid', 'ensemble');
CREATE TYPE MODEL_TYPE AS ENUM ('physics', 'ml', 'persistence', 'ensemble');
CREATE TYPE ALERT_SEVERITY AS ENUM ('low', 'medium', 'high', 'critical');

-- Tenants table (multi-tenant support)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    domain VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'operator',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- Sites table
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type SITE_TYPE NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    capacity_mw DECIMAL(10,2) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    tenant_id UUID NOT NULL,
    pv_params JSONB, -- For solar sites: tilt, azimuth, efficiency, etc.
    turbine_params JSONB, -- For wind sites: hub_height, rotor_diameter, power_curve, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_sites_tenant ON sites(tenant_id);
CREATE INDEX idx_sites_type ON sites(type);

-- Weather stations
CREATE TABLE weather_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    station_code VARCHAR(100) UNIQUE NOT NULL,
    manufacturer VARCHAR(100),
    coordinates GEOGRAPHY(POINT, 4326),
    elevation_m DECIMAL(6,1),
    commissioned_at DATE,
    decommissioned_at DATE,
    status STATION_STATUS DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_weather_stations_site ON weather_stations(site_id);
CREATE INDEX idx_weather_stations_status ON weather_stations(status);

-- Time-series weather data (hypertable)
CREATE TABLE weather_readings (
    time TIMESTAMPTZ NOT NULL,
    station_id UUID NOT NULL,
    ghi DECIMAL(8,2), -- W/m²
    dni DECIMAL(8,2),
    dhi DECIMAL(8,2),
    wind_speed DECIMAL(5,2), -- m/s
    wind_direction DECIMAL(5,2), -- degrees
    ambient_temp DECIMAL(5,2), -- °C
    panel_temp DECIMAL(5,2),
    air_pressure DECIMAL(7,2), -- hPa
    humidity DECIMAL(5,2), -- %
    precipitation DECIMAL(5,2), -- mm
    cloud_cover DECIMAL(5,2), -- %
    quality_score DECIMAL(3,2) DEFAULT 1.0,
    raw_value JSONB,
    CONSTRAINT fk_station FOREIGN KEY (station_id) REFERENCES weather_stations(id) ON DELETE CASCADE
);

SELECT create_hypertable('weather_readings', 'time', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_weather_readings_station_time ON weather_readings (station_id, time DESC);
CREATE INDEX idx_weather_readings_time ON weather_readings (time DESC);

-- Production actuals
CREATE TABLE production_actuals (
    time TIMESTAMPTZ NOT NULL,
    site_id UUID NOT NULL,
    power_kw DECIMAL(10,3),
    energy_kwh DECIMAL(10,3),
    availability DECIMAL(5,2),
    curtailed_kw DECIMAL(10,3),
    CONSTRAINT fk_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

SELECT create_hypertable('production_actuals', 'time', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_production_site_time ON production_actuals (site_id, time DESC);
CREATE INDEX idx_production_time ON production_actuals (time DESC);

-- Forecasts
CREATE TABLE forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    forecast_time TIMESTAMPTZ NOT NULL,
    target_time TIMESTAMPTZ NOT NULL,
    horizon INTERVAL NOT NULL,
    forecast_type FORECAST_TYPE NOT NULL,
    predicted_power_kw DECIMAL(10,3),
    p10_kw DECIMAL(10,3),
    p50_kw DECIMAL(10,3),
    p90_kw DECIMAL(10,3),
    confidence DECIMAL(4,3),
    model_version VARCHAR(50),
    features_used JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    CONSTRAINT unique_forecast UNIQUE (site_id, forecast_time, target_time, forecast_type)
);

CREATE INDEX idx_forecasts_lookup ON forecasts (site_id, target_time, forecast_time);
CREATE INDEX idx_forecasts_site_time ON forecasts (site_id, forecast_time DESC);
CREATE INDEX idx_forecasts_target_time ON forecasts (target_time);

-- Model registry
CREATE TABLE model_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type MODEL_TYPE NOT NULL,
    version VARCHAR(50) NOT NULL,
    storage_path TEXT NOT NULL,
    metrics JSONB NOT NULL,
    training_data_range DATERANGE,
    deployed_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_model_version UNIQUE (name, version)
);

CREATE INDEX idx_model_registry_active ON model_registry(is_active, type);

-- Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    condition JSONB NOT NULL,
    severity ALERT_SEVERITY NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    last_triggered TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL,
    CONSTRAINT fk_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    CONSTRAINT fk_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_alerts_site ON alerts(site_id, enabled);
CREATE INDEX idx_alerts_severity ON alerts(severity);

-- Alert events
CREATE TABLE alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    severity ALERT_SEVERITY NOT NULL,
    data JSONB NOT NULL,
    notification_sent BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_alert FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

SELECT create_hypertable('alert_events', 'triggered_at', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_alert_events_alert ON alert_events(alert_id, triggered_at DESC);
CREATE INDEX idx_alert_events_resolved ON alert_events(resolved_at) WHERE resolved_at IS NULL;

-- Forecast accuracy metrics
CREATE TABLE forecast_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL,
    forecast_time TIMESTAMPTZ NOT NULL,
    target_time TIMESTAMPTZ NOT NULL,
    actual_power_kw DECIMAL(10,3),
    predicted_power_kw DECIMAL(10,3),
    error_kw DECIMAL(10,3),
    absolute_error_kw DECIMAL(10,3),
    squared_error_kw DECIMAL(10,3),
    percentage_error DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_forecast_accuracy_site_time ON forecast_accuracy(site_id, target_time DESC);
SELECT create_hypertable('forecast_accuracy', 'target_time', chunk_time_interval => INTERVAL '1 day');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

