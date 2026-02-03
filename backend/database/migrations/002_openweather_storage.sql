-- Migration: Add dedicated OpenWeather API data storage
-- This table stores all OpenWeather API responses for medium to long term storage
-- Separate from weather_readings to maintain raw API data for analysis and compliance

-- OpenWeather API data storage (hypertable for time-series)
CREATE TABLE IF NOT EXISTS openweather_data (
    time TIMESTAMPTZ NOT NULL,
    site_id UUID, -- NULL for general queries, set when site-specific
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    api_endpoint VARCHAR(100) NOT NULL, -- 'current', 'forecast', 'historical'
    request_type VARCHAR(50) NOT NULL, -- 'current', 'forecast_5d', 'historical_7d', etc.
    response_data JSONB NOT NULL, -- Full API response stored as JSON
    temperature DECIMAL(5,2), -- °C (extracted for quick queries)
    humidity DECIMAL(5,2), -- % (extracted for quick queries)
    wind_speed DECIMAL(5,2), -- m/s (extracted for quick queries)
    wind_direction DECIMAL(5,2), -- degrees (extracted for quick queries)
    pressure DECIMAL(7,2), -- hPa (extracted for quick queries)
    cloud_cover DECIMAL(5,2), -- % (extracted for quick queries)
    precipitation DECIMAL(5,2), -- mm (extracted for quick queries)
    ghi_estimated DECIMAL(8,2), -- W/m² (estimated from cloud cover)
    api_call_timestamp TIMESTAMPTZ DEFAULT NOW(), -- When we made the API call
    data_timestamp TIMESTAMPTZ, -- Timestamp from the weather data itself
    quality_score DECIMAL(3,2) DEFAULT 1.0,
    metadata JSONB, -- Additional metadata (API key used, rate limit info, etc.)
    CONSTRAINT fk_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- Add unique constraint to prevent duplicate entries (same site, time, endpoint, request_type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_openweather_unique 
ON openweather_data (site_id, time, api_endpoint, request_type, data_timestamp) 
WHERE site_id IS NOT NULL;

-- For general queries without site_id, use a different unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_openweather_unique_general 
ON openweather_data (latitude, longitude, time, api_endpoint, request_type, data_timestamp) 
WHERE site_id IS NULL;

-- Create hypertable for time-series optimization
SELECT create_hypertable('openweather_data', 'time', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_openweather_site_time ON openweather_data (site_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_openweather_time ON openweather_data (time DESC);
CREATE INDEX IF NOT EXISTS idx_openweather_endpoint ON openweather_data (api_endpoint, time DESC);
CREATE INDEX IF NOT EXISTS idx_openweather_request_type ON openweather_data (request_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_openweather_location ON openweather_data (latitude, longitude, time DESC);
CREATE INDEX IF NOT EXISTS idx_openweather_data_timestamp ON openweather_data (data_timestamp DESC) WHERE data_timestamp IS NOT NULL;

-- Index for JSONB queries on response_data
CREATE INDEX IF NOT EXISTS idx_openweather_response_gin ON openweather_data USING GIN (response_data);

-- Add comment
COMMENT ON TABLE openweather_data IS 'Dedicated storage for all OpenWeather API responses for medium to long term retention and analysis';


