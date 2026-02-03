"""
Bria Forecasting Service
Main service for generating solar and wind forecasts
"""
from fastapi import FastAPI
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.logging import get_logger
from core.config import get_settings

logger = get_logger('forecasting-service')
settings = get_settings()

app = FastAPI(
    title="Bria Forecasting Service",
    version="2.0.0"
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "forecasting",
        "timestamp": "2024-01-01T00:00:00Z"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)

