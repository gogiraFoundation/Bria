# Changelog

All notable changes to the Bria platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-03

### Added
- Technology Recommendation Analysis feature
  - Backend endpoint for analyzing historical weather data
  - Financial and technical comparison of solar, wind, and hybrid options
  - Frontend component displaying recommendations with detailed metrics
- Security enhancements
  - Security headers middleware (X-Content-Type-Options, X-Frame-Options, etc.)
  - Improved CORS configuration
  - Production security documentation
- Production deployment guide
  - Comprehensive PRODUCTION.md with security checklist
  - Security policy document (SECURITY.md)
  - Contributing guidelines (CONTRIBUTING.md)
- CI/CD workflow
  - GitHub Actions workflow for linting and testing
- Environment configuration
  - Enhanced .gitignore for production safety
  - Documentation for environment variables

### Fixed
- SQL query issues with interval arithmetic
  - Fixed timestamp comparison errors in site status endpoint
  - Fixed ambiguous column references in alerts queries
- Weather readings table error handling
  - Graceful handling when weather_readings table doesn't exist
  - Improved error messages for missing data
- React hook dependency warnings
  - Fixed useEffect dependency issues in ForecastComparisonChart

### Changed
- Improved error handling throughout the application
- Enhanced logging and monitoring capabilities
- Updated security configurations for production readiness

### Security
- All SQL queries use parameterized statements (SQL injection protection)
- Security headers added to all API responses
- CORS configuration tightened for production
- Environment variables properly excluded from version control

## [Unreleased]

### Added
- Nameplate yield model for technology recommendation (`services/selection`)
- Recommendation runs API (`POST /api/v1/recommendations`), load profiles, Plan page
- Technology shortlist with constraint screening and hybrid fraction search
- Empty vendor catalogue with admin create form and contact-draft endpoint
- Site location columns (`country_code`, `elevation_m`, `status`, `city`, `address_line`)

### Changed
- Technology recommendation uses corrected solar/wind energy and revenue maths
- Confidence is capped by weather data quality (short OpenWeather samples stay low)
- Hybrid site create now persists both `pv_params` and `turbine_params`
- Operational solar forecasts use nameplate yield by default (`SOLAR_NAMEPLATE_YIELD=true`)
  - New forecast rows report `model_version: nameplate-v1`
  - Solar kilowatt forecasts will read higher than the previous double-efficiency path
  - Set `SOLAR_NAMEPLATE_YIELD=false` to restore the legacy formula
  - Historical forecast rows are not rewritten
- Planning tab: daytime-aware scheduling and insights (no night-zero maintenance; no sunrise % spikes as anomalies)
- Planning workspace: Dispatch / Forecast tools / Technology tabs; stat-led KPI strip; one chart mount (scenarios XOR compare)
- Forecast scenarios persist under aligned Redis/in-process keys and surface create errors
- Plan technology page uses a denser input grid

### Fixed
- Create scenario failing silently when Redis keys mismatched list vs write paths
- Scheduling treated overnight zeros as maintenance windows and inflated CV with night-to-day range

### Planned
- Enhanced authentication with refresh tokens
- API rate limiting improvements
- Additional monitoring and alerting features

