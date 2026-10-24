from datetime import datetime, timezone
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from services.ingestion.main import app, IngestionService


class DummyProducer:
    def __init__(self):
        self.records = []

    def produce(self, topic, value, callback=None):
        self.records.append((topic, value))
        if callback:
            callback(None, SimpleNamespace(topic=lambda: topic, partition=lambda: 0))

    def poll(self, timeout):
        return


@pytest.mark.asyncio
async def test_handle_mqtt_message_publishes_to_raw_weather(monkeypatch):
    service = IngestionService()

    service.kafka_producer = DummyProducer()
    service.redis_client = None

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "station_id": "station-1",
        "ghi": 500.0,
    }

    await service.handle_mqtt_message("weather/site-1/data", json.dumps(payload).encode())

    assert service.kafka_producer.records, "Expected a Kafka message to be produced"
    topic, value = service.kafka_producer.records[0]
    assert topic == "raw.weather"


def test_http_ingest_without_api_key_rejected(monkeypatch):
    import services.ingestion.main as ingestion_main

    service = IngestionService()
    service.kafka_producer = DummyProducer()
    service.redis_client = None
    ingestion_main.ingestion_service = service

    monkeypatch.setattr(ingestion_main.settings, "INGESTION_API_KEY", "secret-key")

    client = TestClient(app)
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "station_id": "station-1",
        "ghi": 500.0,
    }
    response = client.post("/ingest/weather", json=payload)
    assert response.status_code == 401


def test_http_ingest_weather_uses_raw_weather_topic(monkeypatch):
    service = IngestionService()
    dummy_producer = DummyProducer()
    service.kafka_producer = dummy_producer
    service.redis_client = None

    import services.ingestion.main as ingestion_main

    ingestion_main.ingestion_service = service
    monkeypatch.setattr(ingestion_main.settings, "INGESTION_API_KEY", "secret-key")

    client = TestClient(app)

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "station_id": "station-1",
        "ghi": 500.0,
    }

    response = client.post(
        "/ingest/weather",
        json=payload,
        headers={"X-API-Key": "secret-key"},
    )
    assert response.status_code == 200
    assert dummy_producer.records, "Expected a Kafka message to be produced"
    topic, value = dummy_producer.records[0]
    assert topic == "raw.weather"


def test_http_ingest_returns_503_when_key_not_configured(monkeypatch):
    import services.ingestion.main as ingestion_main

    service = IngestionService()
    service.kafka_producer = DummyProducer()
    ingestion_main.ingestion_service = service
    monkeypatch.setattr(ingestion_main.settings, "INGESTION_API_KEY", None)

    client = TestClient(app)
    response = client.post(
        "/ingest/weather",
        json={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "station_id": "station-1",
            "ghi": 500.0,
        },
        headers={"X-API-Key": "anything"},
    )
    assert response.status_code == 503
