"""
Configuration management for Bria platform
"""
from pydantic_settings import BaseSettings
from typing import List, Optional
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "Bria Forecasting Platform"
    APP_VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    
    # Redis
    REDIS_URL: str
    REDIS_PASSWORD: Optional[str] = None
    
    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS string into list"""
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
    
    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    
    # MQTT
    MQTT_BROKER_HOST: str = "mosquitto"
    MQTT_BROKER_PORT: int = 1883
    
    # MLflow
    MLFLOW_TRACKING_URI: Optional[str] = None
    
    # OpenWeather API
    OPENWEATHER_API_KEY: Optional[str] = None
    OPENWEATHER_API_URL: str = "https://api.openweathermap.org/data/2.5/forecast"  # Free tier: 2.5 API
    OPENWEATHER_CURRENT_URL: str = "https://api.openweathermap.org/data/2.5/weather"  # Free tier: current weather
    
    # Maps Configuration
    MAPS_PROVIDER: str = "leaflet"  # "leaflet" or "google"
    GOOGLE_MAPS_API_KEY: Optional[str] = None
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # Monitoring
    PROMETHEUS_ENABLED: bool = True
    METRICS_PORT: int = 9091
    
    model_config = {
        "env_file": str(Path(__file__).parent.parent.parent / ".env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore"  # Ignore extra fields in .env that aren't in the model
    }


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()

