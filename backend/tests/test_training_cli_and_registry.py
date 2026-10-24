from datetime import datetime, timezone

import pytest

from services.forecasting.train_model import insert_dummy_model
from services.forecasting.forecast_service import forecast_service


class DummyConn:
    def __init__(self):
        self.last_args = None
        self.last_query = None

    async def fetchrow(self, query, *args):
        self.last_query = query
        self.last_args = args
        return {
            "id": "model-1",
            "name": args[0],
            "type": args[1],
            "version": args[2],
            "storage_path": args[3],
            "metrics": args[4],
            "training_data_range": None,
            "deployed_at": args[5],
            "is_active": False,
            "created_at": datetime.now(timezone.utc),
        }


@pytest.mark.asyncio
async def test_insert_dummy_model_writes_expected_fields():
    conn = DummyConn()
    row = await insert_dummy_model(conn, name="test-model", version="v1")

    assert row["name"] == "test-model"
    assert row["version"] == "v1"
    assert row["type"] == "ml"
    assert row["storage_path"].endswith("/test-model/v1/model.pkl")
    assert "FALSE" in conn.last_query
    assert row["is_active"] is False


@pytest.mark.asyncio
async def test_forecast_service_can_read_active_models(monkeypatch):
    # Reuse DummyConn but adapt for list_active_models
    class DummyConnList:
        async def fetch(self, query, *args):
            return [
                {
                    "id": "model-1",
                    "name": "test-model",
                    "type": "ml",
                    "version": "v1",
                    "storage_path": "s3://dummy/models/test-model/v1/model.pkl",
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

        async def __aenter__(self):
            return self._conn

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def fake_get_db_pool():
        return DummyPool(DummyConnList())

    import services.forecasting.forecast_service as fs_mod

    monkeypatch.setattr(fs_mod, "get_db_pool", fake_get_db_pool)

    models = await forecast_service.list_active_models(model_type="ml")
    assert len(models) == 1
    assert models[0]["name"] == "test-model"
    assert models[0]["version"] == "v1"

