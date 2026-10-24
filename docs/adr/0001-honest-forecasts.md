# ADR 0001: Honest forecasts (no synthetic power series)

## Status

Accepted

## Context

Operators treat dashboard forecasts as operationally meaningful. Returning invented capacity curves when weather irradiance is missing creates false confidence and breaks trust with accuracy metrics.

## Decision

1. Prefer Open-Meteo for irradiance and wind; fail over to OpenWeather solar radiation when needed.
2. If weather irradiance cannot be obtained, return `status: unavailable` with a reason; never synthesise GHI from cloud cover or publish a fake power series as a forecast.
3. Run generation inside the API gateway process via `forecast_service` (the `:8002` process remains health-only for now).

## Consequences

- UI must handle unavailable states (banner, status chip).
- Sites without weather coverage show empty forecasts instead of smooth demo curves.
- Docs that described OpenWeather-first or simplified fallbacks are outdated; see `docs/WEATHER_AND_FORECASTS.md`.
