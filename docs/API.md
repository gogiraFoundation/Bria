# API reference (gateway)

Base URL (local): `http://localhost:8000`. Prefix for most routes: `/api/v1`.

Interactive OpenAPI: `/api/docs` when the gateway is running.

Authentication: `Authorization: Bearer <access_token>` unless noted. Obtain a token with `POST /api/v1/auth/token` (OAuth2 password form: `username` = email, `password`).

Tenant isolation: site-scoped resources filter by `current_user.tenant_id`.

---

## Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | No | Database and Redis status |

---

## Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/token` | No | Returns `access_token`, `token_type`, `role` |
| POST | `/api/v1/auth/register` | No | **403** unless `ALLOW_PUBLIC_REGISTRATION`; creates new tenant; role `user` |
| GET | `/api/v1/auth/me` | Yes | `{ id, email, role, tenant_id }` |
| POST | `/api/v1/auth/change-password` | Yes | Body: current and new password |

JWT claims include `sub`, `role`, `exp`.

---

## Sites and geocoding

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/sites` | Query: `skip`, `limit`, `group_by`, `sort_by`, `sort_order` |
| POST | `/api/v1/sites` | Create; hybrid may send both `pv_params` and `turbine_params` |
| GET | `/api/v1/sites/{site_id}` | Tenant-scoped |
| PUT | `/api/v1/sites/{site_id}` | Update |
| DELETE | `/api/v1/sites/{site_id}` | Delete |
| GET | `/api/v1/sites/{site_id}/status` | Operational status |
| POST | `/api/v1/geocode` | Address → coordinates |

---

## Forecasts

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/sites/{site_id}/forecast` | `horizon`: `24h` \| `48h` \| `7d` \| `30d`; may return `status: unavailable` |
| GET | `/api/v1/sites/{site_id}/forecast/export` | Export |
| GET | `/api/v1/sites/{site_id}/forecast/accuracy` | Accuracy |
| GET | `/api/v1/sites/{site_id}/forecast/accuracy/trends` | Trends |
| GET | `/api/v1/sites/{site_id}/forecast/scheduling` | Scheduling hints |
| POST/GET | `/api/v1/sites/{site_id}/forecast/adjustments` | Adjustments |
| POST | `/api/v1/sites/{site_id}/forecast/scenarios` | Scenarios |
| GET | `/api/v1/sites/{site_id}/forecast/insights` | Insights |

Successful solar forecasts typically report `model_version: nameplate-v1` when `SOLAR_NAMEPLATE_YIELD=true` (default). See [WEATHER_AND_FORECASTS.md](./WEATHER_AND_FORECASTS.md).

---

## Weather and production

| Method | Path |
| --- | --- |
| GET | `/api/v1/sites/{site_id}/weather/current` |
| GET | `/api/v1/sites/{site_id}/weather/forecast` |
| GET | `/api/v1/sites/{site_id}/weather/history` |
| GET | `/api/v1/sites/{site_id}/production/history` |
| GET | `/api/v1/sites/{site_id}/production/export` |
| GET | `/api/v1/sites/{site_id}/performance` |

---

## Alerts

| Method | Path |
| --- | --- |
| POST/GET | `/api/v1/sites/{site_id}/alerts` |
| PUT/DELETE | `/api/v1/alerts/{alert_id}` |
| POST | `/api/v1/alerts/{alert_id}/acknowledge` |
| GET | `/api/v1/alerts/events` |

---

## Technology recommendation (site-bound)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/sites/{site_id}/technology-recommendation` | Historical weather-based comparison for an existing site |

---

## Plan / selection (location + load)

Used by the Plan page (`/plan`).

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/load-profiles` | Create load profile (optional `site_id`) |
| POST | `/api/v1/recommendations` | Run recommendation (lat/lon, load, objective, costs) |
| GET | `/api/v1/recommendations/{run_id}` | Fetch run |
| GET | `/api/v1/sites/{site_id}/recommendations` | Runs for a site |
| POST | `/api/v1/recommendations/{run_id}/contact-draft` | Vendor enquiry draft |

---

## Admin (role required)

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/v1/admin/vendors` | **Requires `role=admin`** (403 otherwise) |

The dashboard Admin page may still be a stub for general system admin UI; vendor admin is API-backed.

---

## WebSocket

| Path | Notes |
| --- | --- |
| `WS /api/v1/ws/forecast?token=<jwt>` | Real-time forecast channel; token required; site messages tenant-checked |

---

## Other processes

| Service | Port | Surface |
| --- | --- | --- |
| Ingestion | 8001 | Ingest endpoints; `X-API-Key: INGESTION_API_KEY` |
| Forecasting process | 8002 | `GET /health` only; power forecasts are generated in the gateway |
