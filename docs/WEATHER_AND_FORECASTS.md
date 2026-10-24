# Weather providers and power forecasts

Authoritative behaviour for generation forecasts as implemented in `backend/services/forecasting/`.

For OpenWeather API keys and account setup, [OPENWEATHER_SETUP.md](./OPENWEATHER_SETUP.md) still describes credentials; **provider priority and failure semantics below supersede** any “simplified synthetic forecast” language in older docs.

---

## Provider chain

Implemented in `weather/providers.py`:

1. **Open-Meteo** (`weather/open_meteo.py`): irradiance (GHI/DNI/DHI) and hub-height wind; no API key for the public forecast API used here.
2. **OpenWeather Solar Radiation** (`weather/openweather.py`): used only if Open-Meteo does not yield usable irradiance; requires `OPENWEATHER_API_KEY`.
3. If both fail: return **no weather series**. Forecast service emits `status: "unavailable"` with a `reason` string.

**Invariant:** the platform does not invent GHI from cloud cover or invent a capacity curve and label it as a forecast.

---

## Forecast service semantics

`forecast_service.py` dispatches by site type (`solar`, `wind`, `hybrid`).

Success payload (conceptually):

- `status`: `"ok"`
- `values`: predicted power points with timestamps
- Optional confidence envelope (physics ±15% labelled as p10/p50/p90)
- `weather_source`, `model_version`
  - Solar (default): `nameplate-v1` when `SOLAR_NAMEPLATE_YIELD=true`
  - Solar (legacy): `physics-pvlib` when `SOLAR_NAMEPLATE_YIELD=false`
  - Wind: `wind-power-curve`; hybrid: `hybrid-physics`

Unavailable payload:

- `status`: `"unavailable"`
- Empty or missing `values`
- `reason`: e.g. `weather_unavailable`, `no_forecast_points`, `solar_error`, `wind_model_unavailable`, `wind_error`, `hybrid_error`

API gateway (`GET /api/v1/sites/{site_id}/forecast`):

- Caches and persists only successful (`ok`) forecasts
- Surfaces unavailable to the UI without substituting synthetic power

---

## Frontend

- `useForecastData` maps API `status` into chart data.
- `ForecastChartSimple` shows a warning alert when unavailable.
- `ForecastStatusChip` shows Available / Unavailable on the forecasts overview.

---

## Related configuration

| Variable | Role |
| --- | --- |
| `OPENWEATHER_API_KEY` | Failover solar radiation and some weather history paths |
| `OPENWEATHER_API_URL` / `OPENWEATHER_CURRENT_URL` | OpenWeather REST bases |

Open-Meteo calls do not use these keys.
