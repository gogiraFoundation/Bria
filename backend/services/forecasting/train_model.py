"""
Minimal training CLI for Bria model registry.

This script does NOT perform real ML training. It demonstrates the
end-to-end flow of:
- connecting to the database
- inserting a row into model_registry
- printing the stored metadata

It is designed so unit tests can monkeypatch the DB layer easily.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict

try:
    import asyncpg
except ImportError:  # pragma: no cover
    asyncpg = None  # type: ignore

try:
    from core.config import get_settings
    from core.logging import get_logger
except ImportError:  # pragma: no cover
    from backend.core.config import get_settings  # type: ignore
    from backend.core.logging import get_logger  # type: ignore


logger = get_logger("training-cli")
settings = get_settings()


async def insert_dummy_model(
    conn: "asyncpg.Connection",
    name: str,
    version: str,
    model_type: str = "ml",
) -> Dict[str, Any]:
    """Insert a dummy model row into model_registry and return it."""
    metrics = {"mae": 0.0, "rmse": 0.0}
    storage_path = f"s3://dummy-bucket/models/{name}/{version}/model.pkl"

    row = await conn.fetchrow(
        """
        INSERT INTO model_registry (
            name, type, version, storage_path, metrics,
            training_data_range, deployed_at, is_active
        )
        VALUES ($1, $2, $3, $4, $5, NULL, $6, FALSE)
        RETURNING id, name, type, version, storage_path, metrics,
                  training_data_range, deployed_at, is_active, created_at
        """,
        name,
        model_type,
        version,
        storage_path,
        metrics,
        datetime.utcnow(),
    )
    logger.info(
        "Inserted model into registry",
        name=name,
        version=version,
        type=model_type,
    )
    return dict(row)


async def main(name: str = "demo-model", version: str = "v1") -> None:
    """Entry point used by CLI and tests."""
    if asyncpg is None:
        raise RuntimeError("asyncpg is required to run the training CLI")

    logger.info("Connecting to database for training CLI")
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        row = await insert_dummy_model(conn, name=name, version=version)
        logger.info("Model registry row created", id=str(row["id"]))
        print(
            f"Created model: name={row['name']} "
            f"version={row['version']} path={row['storage_path']}"
        )
    finally:
        await conn.close()


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())

