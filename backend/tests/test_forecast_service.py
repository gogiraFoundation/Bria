from datetime import datetime, timedelta, timezone

import pytest

from services.forecasting.forecast_service import forecast_service
from services.forecasting.weather.providers import WeatherForecastPoint


def _site(site_id="site-1", site_type="solar", capacity_mw=5.0, **extra):
    base = {
        "id": site_id,
        "latitude": 0.0,
        "longitude": 0.0,
        "capacity_mw": capacity_mw,
        "timezone": "UTC",
        "type": site_type,
        "pv_params": {"tilt": 30, "azimuth": 180, "efficiency": 0.18, "system_loss": 0.14},
        "turbine_params": {"hub_height": 80.0},
    }
    base.update(extra)
    return base


def _points_day_and_night():
    # Use longitude 0 so 12:00 UTC is local solar noon
    night = datetime(2026, 6, 15, 2, 0, tzinfo=timezone.utc)
    day = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    return [
        WeatherForecastPoint(
            timestamp=night,
            ghi=0.0,
            dni=0.0,
            dhi=0.0,
            wind_speed_hub_ms=8.0,
            temperature=15.0,
            pressure=1013.0,
            source="open-meteo",
        ),
        WeatherForecastPoint(
            timestamp=day,
            ghi=800.0,
            dni=600.0,
            dhi=200.0,
            wind_speed_hub_ms=8.0,
            temperature=25.0,
            pressure=1013.0,
            source="open-meteo",
        ),
    ]


@pytest.mark.asyncio
async def test_generate_solar_forecast_unavailable_when_no_weather(monkeypatch):
    async def no_weather(self, site, horizon_hours):
        return None

    monkeypatch.setattr(
        type(forecast_service),
        "_fetch_weather",
        no_weather,
    )

    result = await forecast_service.generate_solar_forecast(_site(), horizon_hours=6)
    assert result["status"] == "unavailable"
    assert result["values"] == []


@pytest.mark.asyncio
async def test_night_near_zero_daytime_higher(monkeypatch):
    async def fake_weather(self, site, horizon_hours):
        return _points_day_and_night()

    monkeypatch.setattr(type(forecast_service), "_fetch_weather", fake_weather)

    result = await forecast_service.generate_solar_forecast(_site(), horizon_hours=2)
    assert result["status"] == "ok"
    assert result["weather_source"] == "open-meteo"
    assert result["model_version"] == "nameplate-v1"
    assert len(result["values"]) == 2
    night_kw = result["values"][0]["predicted_power_kw"]
    day_kw = result["values"][1]["predicted_power_kw"]
    assert night_kw == pytest.approx(0.0, abs=1.0)
    assert day_kw > night_kw + 50


@pytest.mark.asyncio
async def test_hybrid_sums_solar_and_wind(monkeypatch):
    async def fake_weather(self, site, horizon_hours):
        return _points_day_and_night()

    monkeypatch.setattr(type(forecast_service), "_fetch_weather", fake_weather)

    solar = await forecast_service.generate_solar_forecast(
        _site(capacity_mw=2.0), horizon_hours=2
    )
    wind = await forecast_service.generate_wind_forecast(
        _site(site_type="wind", capacity_mw=2.0), horizon_hours=2
    )
    hybrid = await forecast_service.generate_hybrid_forecast(
        _site(site_type="hybrid", capacity_mw=4.0), horizon_hours=2
    )

    assert hybrid["status"] == "ok"
    assert hybrid["model_version"] == "hybrid-physics"
    day_idx = 1
    assert hybrid["values"][day_idx]["predicted_power_kw"] >= max(
        solar["values"][day_idx]["predicted_power_kw"] * 0.4,
        wind["values"][day_idx]["predicted_power_kw"] * 0.4,
    )


@pytest.mark.asyncio
async def test_generate_forecast_for_site_routes_hybrid(monkeypatch):
    async def fake_weather(self, site, horizon_hours):
        return _points_day_and_night()

    monkeypatch.setattr(type(forecast_service), "_fetch_weather", fake_weather)

    result = await forecast_service.generate_forecast_for_site(
        _site(site_type="hybrid"), horizon_hours=2
    )
    assert result["status"] == "ok"
    assert result["model_version"] == "hybrid-physics"


@pytest.mark.asyncio
async def test_list_active_models_uses_model_registry(monkeypatch):
    class DummyConnList:
        async def fetch(self, query, *args):
            return [
                {
                    "id": "model-1",
                    "name": "demo-model",
                    "type": "ml",
                    "version": "v1",
                    "storage_path": "s3://dummy/models/demo-model/v1/model.pkl",
                    "metrics": {"mae": 0.1},
                    "training_data_range": None,
                    "deployed_at": datetime.now(timezone.utc),
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc),
                }
            ]

    class DummyPool:
        def __init__(self, conn):
            self._conn = conn

        async def acquire(self):
            return self._conn

    async def fake_get_db_pool():
        return DummyPool(DummyConnList())

    import services.forecasting.forecast_service as fs_mod

    monkeypatch.setattr(fs_mod, "get_db_pool", fake_get_db_pool)

    models = await forecast_service.list_active_models(model_type="ml")
    assert len(models) == 1
    assert models[0]["name"] == "demo-model"
