from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api_gateway.main import app, create_access_token
from core.config import get_settings


@pytest.mark.asyncio
async def test_login_issues_token(monkeypatch):
    # Mock db_pool and authenticate_user so login succeeds without a real DB.
    import api_gateway.main as api_mod

    async def fake_authenticate_user(email: str, password: str):
        return {
            "id": "user-1",
            "email": email,
            "tenant_id": "tenant-1",
            "role": "user",
        }

    api_mod.db_pool = object()  # truthy, so login doesn't short-circuit
    monkeypatch.setattr(api_mod, "authenticate_user", fake_authenticate_user)

    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/token",
        data={"username": "test@example.com", "password": "secret"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body.get("role") == "user"
    cfg = get_settings()
    claims = jwt.decode(
        body["access_token"],
        cfg.JWT_SECRET,
        algorithms=[cfg.JWT_ALGORITHM],
    )
    assert claims["sub"] == "user-1"
    assert claims["role"] == "user"


def _make_auth_header():
    token = create_access_token({"sub": "user-1", "role": "user"})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_auth_me_returns_profile(monkeypatch):
    import api_gateway.main as api_mod

    async def fake_get_current_user(token: str = None):
        return {
            "id": "user-1",
            "email": "ops@example.com",
            "role": "admin",
            "tenant_id": "tenant-1",
            "is_active": True,
        }

    monkeypatch.setattr(api_mod, "get_current_user", fake_get_current_user)
    client = TestClient(app)
    resp = client.get("/api/v1/auth/me", headers=_make_auth_header())
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "user-1"
    assert body["email"] == "ops@example.com"
    assert body["role"] == "admin"
    assert body["tenant_id"] == "tenant-1"


@pytest.mark.asyncio
async def test_get_sites_uses_current_user_and_db(monkeypatch):
    import api_gateway.main as api_mod

    # Dummy DB connection for get_sites query
    class DummyConn:
        async def fetch(self, query, *args):
            return [
                {
                    "id": "site-1",
                    "name": "Test Site",
                    "type": "solar",
                    "latitude": 10.0,
                    "longitude": 20.0,
                    "capacity_mw": 5.0,
                    "tenant_id": "tenant-1",
                    "created_at": datetime.now(timezone.utc),
                }
            ]

    class DummyPool:
        def __init__(self, conn):
            self._conn = conn

        async def acquire(self):
            return self._conn

        async def __aenter__(self):
            return self._conn

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def fake_get_current_user(token: str = ""):
        return {"id": "user-1", "tenant_id": "tenant-1"}

    api_mod.db_pool = DummyPool(DummyConn())
    monkeypatch.setattr(api_mod, "get_current_user", fake_get_current_user)

    client = TestClient(app)
    resp = client.get("/api/v1/sites", headers=_make_auth_header())
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert body[0]["id"] == "site-1"


@pytest.mark.asyncio
async def test_get_forecast_endpoint_calls_forecast_service(monkeypatch):
    import api_gateway.main as api_mod

    # Dummy DB for site lookup
    class DummyConn:
        async def fetchrow(self, query, *args):
            # Called for site lookup
            return {
                "id": "site-1",
                "name": "Test Site",
                "type": "solar",
                "latitude": 10.0,
                "longitude": 20.0,
                "capacity_mw": 5.0,
                "timezone": "UTC",
            }

        async def fetch(self, *args, **kwargs):
            return []

    class DummyPool:
        def __init__(self, conn):
            self._conn = conn

        async def acquire(self):
            return self._conn

        async def __aenter__(self):
            return self._conn

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def fake_get_current_user(token: str = ""):
        return {"id": "user-1", "tenant_id": "tenant-1"}

    # Fake cache manager with minimal interface
    class DummyCache:
        async def get(self, key: str):
            return None

        async def set(self, key: str, value: str, ttl: int):
            return None

    api_mod.db_pool = DummyPool(DummyConn())
    api_mod.global_cache_manager = DummyCache()
    api_mod.app.state.cache_manager = api_mod.global_cache_manager
    monkeypatch.setattr(api_mod, "get_current_user", fake_get_current_user)

    class DummyForecastService:
        async def generate_forecast_for_site(self, site, horizon_hours: int = 24):
            now = datetime.now(timezone.utc)
            return {
                "site_id": str(site["id"]),
                "horizon": f"{horizon_hours}h",
                "forecast_generated": now.isoformat(),
                "status": "ok",
                "weather_source": "open-meteo",
                "model_version": "physics-pvlib",
                "values": [
                    {
                        "timestamp": (now + timedelta(hours=i)).isoformat(),
                        "predicted_power_kw": 10.0,
                        "p10": 8.0,
                        "p50": 10.0,
                        "p90": 12.0,
                    }
                    for i in range(horizon_hours)
                ],
            }

    async def fake_persist(forecast):
        return None

    monkeypatch.setattr(
        api_mod,
        "forecast_service",
        DummyForecastService(),
        raising=False,
    )
    monkeypatch.setattr(
        "core.repositories.persist_forecast_response",
        fake_persist,
        raising=False,
    )

    client = TestClient(app)
    resp = client.get("/api/v1/sites/site-1/forecast?horizon=6h", headers=_make_auth_header())
    assert resp.status_code == 200
    body = resp.json()
    assert body["site_id"] == "site-1"
    assert body["status"] == "ok"
    assert len(body["values"]) == 6


def test_register_forbidden_when_public_registration_disabled(monkeypatch):
    import api_gateway.main as api_mod

    monkeypatch.setattr(api_mod.settings, "ALLOW_PUBLIC_REGISTRATION", False)
    api_mod.db_pool = object()

    client = TestClient(app)
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "secret123"},
    )
    assert resp.status_code == 403

