"""Tests for technology-recommendation gateway handler."""
import pytest
from fastapi.testclient import TestClient

from api_gateway.main import app, create_access_token


def _make_auth_header():
    token = create_access_token({"sub": "user-1", "role": "user"})
    return {"Authorization": f"Bearer {token}"}


class _FakeConn:
    def __init__(self, site_row, stations=None, weather_rows=None):
        self.site_row = site_row
        self.stations = stations or []
        self.weather_rows = weather_rows or []

    async def fetchrow(self, query, *args):
        if "FROM sites" in query:
            tenant_id = args[1] if len(args) > 1 else None
            if self.site_row and str(self.site_row["tenant_id"]) == str(tenant_id):
                return self.site_row
            return None
        return None

    async def fetch(self, query, *args):
        if "weather_stations" in query:
            return self.stations
        if "weather_readings" in query:
            return self.weather_rows
        return []


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        pool = self

        class _CM:
            async def __aenter__(self_inner):
                return pool._conn

            async def __aexit__(self_inner, *exc):
                return False

        return _CM()


@pytest.mark.asyncio
async def test_technology_recommendation_tenant_mismatch_404(monkeypatch):
    import api_gateway.main as api_mod

    async def fake_get_current_user(token: str = None):
        return {
            "id": "user-1",
            "email": "ops@example.com",
            "role": "user",
            "tenant_id": "tenant-a",
            "is_active": True,
        }

    site = {
        "id": "site-1",
        "tenant_id": "tenant-b",
        "name": "Other",
        "type": "solar",
        "latitude": 51.5,
        "longitude": -0.1,
        "capacity_mw": 1.0,
        "timezone": "UTC",
        "pv_params": {},
        "turbine_params": {},
    }
    api_mod.db_pool = _FakePool(_FakeConn(site))
    monkeypatch.setattr(api_mod, "get_current_user", fake_get_current_user)

    client = TestClient(app)
    resp = client.get(
        "/api/v1/sites/site-1/technology-recommendation",
        headers=_make_auth_header(),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_technology_recommendation_returns_nameplate_result(monkeypatch):
    import api_gateway.main as api_mod

    async def fake_get_current_user(token: str = None):
        return {
            "id": "user-1",
            "email": "ops@example.com",
            "role": "user",
            "tenant_id": "tenant-1",
            "is_active": True,
        }

    site = {
        "id": "site-1",
        "tenant_id": "tenant-1",
        "name": "Solar One",
        "type": "solar",
        "latitude": 51.5,
        "longitude": -0.1,
        "capacity_mw": 1.0,
        "timezone": "UTC",
        "pv_params": {"system_loss": 0.0, "inverter_efficiency": 1.0, "temp_coeff": 0.0},
        "turbine_params": {},
    }
    weather = [
        {"time": None, "ghi": 200.0, "wind_speed": 6.0, "ambient_temp": 25.0}
        for _ in range(100)
    ]
    stations = [{"id": "station-1"}]
    api_mod.db_pool = _FakePool(_FakeConn(site, stations=stations, weather_rows=weather))
    monkeypatch.setattr(api_mod, "get_current_user", fake_get_current_user)

    client = TestClient(app)
    resp = client.get(
        "/api/v1/sites/site-1/technology-recommendation",
        headers=_make_auth_header(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("model_version") == "nameplate-v1"
    assert body.get("data_quality") == "low"
    assert body["recommendations"]["confidence"] != "high"
    if body.get("solar_analysis"):
        # Must not be the old ~0.014 GWh bug for 1 MW at 200 W/m²
        assert body["solar_analysis"]["annual_energy_gwh"] > 0.1
