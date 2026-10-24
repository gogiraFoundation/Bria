# Bria backend

Shared libraries and services for the renewable forecasting platform.

## Layout

| Path | Role |
| --- | --- |
| `api-gateway/` | FastAPI HTTP/WebSocket entry (port 8000); runs forecasts in-process |
| `api_gateway/` | Import wrapper for pytest (`exec` of `api-gateway/main.py`) |
| `core/` | Config, database, repositories, cache, logging |
| `services/forecasting/` | Forecast engine and weather providers; process on :8002 is health-only |
| `services/ingestion/` | Ingest API (port 8001) |
| `services/selection/` | Technology recommendation |
| `database/migrations/` | SQL migrations 001–006 |
| `scripts/` | Admin user and DB helpers |
| `tests/` | Pytest suite |

## Docs

Full map: [`docs/CODEBASE.md`](../docs/CODEBASE.md). Weather semantics: [`docs/WEATHER_AND_FORECASTS.md`](../docs/WEATHER_AND_FORECASTS.md).

## Quick test

```bash
cd backend
source venv/bin/activate
PYTHONPATH=. pytest -q
```
