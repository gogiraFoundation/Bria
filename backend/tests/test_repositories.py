import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from core.models import CreateSiteRequest, SiteType, WeatherData, ProductionData, ForecastResult, ForecastPoint, ForecastType
from core import repositories


class DummyConn:
    def __init__(self):
        self.queries = []
        self.rows = []

    async def fetchrow(self, query, *args):
        self.queries.append((query, args))
        if self.rows:
            return self.rows[0]
        return None

    async def fetch(self, query, *args):
        self.queries.append((query, args))
        return self.rows

    async def execute(self, query, *args):
        self.queries.append((query, args))
        return "OK"


class DummyPool:
    def __init__(self, conn: DummyConn):
        self._conn = conn

    async def acquire(self):
        return self._conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_create_site_uses_expected_query(monkeypatch):
    conn = DummyConn()
    pool = SimpleNamespace(acquire=lambda: DummyPool(conn))

    async def fake_get_db_pool():
        return pool

    monkeypatch.setattr(repositories, "get_db_pool", fake_get_db_pool)

    # fake returned row
    now = datetime.now(timezone.utc)
    conn.rows = [
        {
            "id": "site-1",
            "name": "Test Site",
            "type": "solar",
            "latitude": 10.0,
            "longitude": 20.0,
            "capacity_mw": 5.0,
            "timezone": "UTC",
            "tenant_id": "tenant-1",
            "pv_params": None,
            "turbine_params": None,
            "created_at": now,
            "updated_at": now,
        }
    ]

    req = CreateSiteRequest(
        name="Test Site",
        type=SiteType.SOLAR,
        latitude=10.0,
        longitude=20.0,
        capacity_mw=5.0,
    )

    site = await repositories.create_site("tenant-1", req)
    assert site.id == "site-1"
    assert conn.queries, "Expected at least one query to be executed"


@pytest.mark.asyncio
async def test_save_and_get_latest_forecast_builds_result(monkeypatch):
    conn = DummyConn()
    pool = SimpleNamespace(acquire=lambda: DummyPool(conn))

    async def fake_get_db_pool():
        return pool

    monkeypatch.setattr(repositories, "get_db_pool", fake_get_db_pool)

    site_id = "site-1"
    forecast_time = datetime.now(timezone.utc)
    points = [
        ForecastPoint(
            timestamp=forecast_time + timedelta(hours=1),
            predicted_power_kw=10.0,
            p10_kw=8.0,
            p50_kw=10.0,
            p90_kw=12.0,
            confidence=0.9,
        )
    ]
    result = ForecastResult(
        site_id=site_id,
        forecast_time=forecast_time,
        horizon_hours=1,
        forecast_type=ForecastType.SOLAR,
        values=points,
        model_version="v1",
        model_weights={"w": 1.0},
    )

    # First call to fetchrow returns metadata row, second call is not used.
    conn.rows = [
        {
            "forecast_time": forecast_time,
            "model_version": "v1",
            "features_used": {"w": 1.0},
        }
    ]

    # Save forecast should not raise
    await repositories.save_forecast(result)

    # For get_latest_forecast we want detailed rows
    conn.rows = [
        {
            "target_time": forecast_time + timedelta(hours=1),
            "predicted_power_kw": 10.0,
            "p10_kw": 8.0,
            "p50_kw": 10.0,
            "p90_kw": 12.0,
            "confidence": 0.9,
            "model_version": "v1",
            "features_used": {"w": 1.0},
        }
    ]

    latest = await repositories.get_latest_forecast(site_id, ForecastType.SOLAR)
    assert latest is not None
    assert latest.site_id == site_id
    assert len(latest.values) == 1


@pytest.mark.asyncio
async def test_backfill_forecast_accuracy_inserts_paired_rows(monkeypatch):
    conn = DummyConn()
    pool = SimpleNamespace(acquire=lambda: DummyPool(conn))

    async def fake_get_db_pool():
        return pool

    monkeypatch.setattr(repositories, "get_db_pool", fake_get_db_pool)

    forecast_time = datetime.now(timezone.utc)
    target = forecast_time + timedelta(hours=1)
    conn.rows = [
        {
            "forecast_time": forecast_time,
            "target_time": target,
            "predicted_power_kw": 100.0,
            "actual_power_kw": 90.0,
        }
    ]

    inserted = await repositories.backfill_forecast_accuracy(
        "site-1",
        forecast_time - timedelta(days=1),
    )
    assert inserted == 1
    assert any("forecast_accuracy" in q[0] for q in conn.queries)


@pytest.mark.asyncio
async def test_persist_forecast_response_skips_unavailable(monkeypatch):
    called = {"save": False}

    async def fake_save(result):
        called["save"] = True

    monkeypatch.setattr(repositories, "save_forecast", fake_save)

    await repositories.persist_forecast_response(
        {
            "site_id": "site-1",
            "status": "unavailable",
            "values": [],
        }
    )
    assert called["save"] is False

    await repositories.persist_forecast_response(
        {
            "site_id": "site-1",
            "site_type": "solar",
            "status": "ok",
            "horizon": "2h",
            "forecast_generated": datetime.now(timezone.utc).isoformat(),
            "model_version": "physics-pvlib",
            "weather_source": "open-meteo",
            "values": [
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "predicted_power_kw": 10.0,
                    "p10": 8.0,
                    "p50": 10.0,
                    "p90": 12.0,
                }
            ],
        }
    )
    assert called["save"] is True

