# Bria documentation

Technical documentation for the Bria platform. Prefer these guides over the root TRD when describing **current** behaviour.

## Living codebase

- **[CODEBASE.md](./CODEBASE.md)** — Repository map, runtime architecture, API surface, auth/tenancy, data model, frontend ops shell, config, tests, known gaps
- **[WEATHER_AND_FORECASTS.md](./WEATHER_AND_FORECASTS.md)** — Open-Meteo → OpenWeather chain and unavailable forecast semantics
- **[adr/](./adr/)** — Architecture decision records

## Operations and security

- **[SECURITY.md](./SECURITY.md)** — Security policy and practices
- **[PRODUCTION.md](./PRODUCTION.md)** — Production deployment guide and checklist
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Contribution guidelines
- **[CHANGELOG.md](./CHANGELOG.md)** — Version history

## Setup and troubleshooting

- **[KAFKA_SETUP.md](./KAFKA_SETUP.md)** — Kafka configuration
- **[OPENWEATHER_SETUP.md](./OPENWEATHER_SETUP.md)** — OpenWeather credentials (see also weather guide for priority)
- **[TROUBLESHOOTING_LOGIN.md](./TROUBLESHOOTING_LOGIN.md)** — Authentication troubleshooting

## Quick reference

- Root [README.md](../README.md): original Technical Requirements Document (aspirational)
- Env template: [`.env.example`](../.env.example)
- Frontend notes: [`frontend/dashboard/README_FRONTEND.md`](../frontend/dashboard/README_FRONTEND.md)
- Backend stub: [`backend/README.md`](../backend/README.md)
