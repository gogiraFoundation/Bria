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

### Planned
- Enhanced authentication with refresh tokens
- API rate limiting improvements
- Additional monitoring and alerting features

