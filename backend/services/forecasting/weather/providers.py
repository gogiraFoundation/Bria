"""
Weather forecast providers for power forecasting.

Prefer Open-Meteo (real GHI/DNI/DHI and hub-height wind). Fail over to the
OpenWeather Solar Radiation API when Open-Meteo returns no irradiance.
Never invent irradiance from cloud cover.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from core.logging import get_logger

logger = get_logger("weather-providers")

# Hub heights available from Open-Meteo (metres above ground)
_OPEN_METEO_WIND_HEIGHTS = (10, 80, 120, 180)


@dataclass
class WeatherForecastPoint:
    """Single weather forecast point for power models."""

    timestamp: datetime
    ghi: Optional[float] = None
    dni: Optional[float] = None
    dhi: Optional[float] = None
    wind_speed_hub_ms: Optional[float] = None
    temperature: Optional[float] = None
    pressure: Optional[float] = None
    source: str = "unknown"


def nearest_hub_height(hub_height_m: float) -> int:
    """Pick the Open-Meteo wind level nearest to the turbine hub height."""
    return min(_OPEN_METEO_WIND_HEIGHTS, key=lambda h: abs(h - hub_height_m))


def _has_irradiance(points: List[WeatherForecastPoint]) -> bool:
    return any(p.ghi is not None for p in points)


async def get_weather_forecast(
    latitude: float,
    longitude: float,
    hours: int = 24,
    hub_height_m: float = 80.0,
) -> Optional[List[WeatherForecastPoint]]:
    """
    Return weather points for power forecasting.

    Tries Open-Meteo first. If that yields no irradiance, tries OpenWeather
    Solar Radiation (when an API key is configured). Returns None when both
    fail so callers can emit status unavailable.
    """
    from services.forecasting.weather.open_meteo import fetch_open_meteo_forecast

    points = await fetch_open_meteo_forecast(
        latitude=latitude,
        longitude=longitude,
        hours=hours,
        hub_height_m=hub_height_m,
    )
    if points and _has_irradiance(points):
        logger.info(
            "Using Open-Meteo weather forecast",
            points=len(points),
            lat=latitude,
            lon=longitude,
        )
        return points

    logger.warning(
        "Open-Meteo unavailable or missing irradiance; trying OpenWeather solar",
        lat=latitude,
        lon=longitude,
    )

    try:
        from services.forecasting.weather.openweather import openweather_client
    except ImportError:
        openweather_client = None

    if openweather_client is None or not getattr(openweather_client, "api_key", None):
        logger.warning("OpenWeather solar failover unavailable (no client or API key)")
        return None

    solar_points = await openweather_client.get_solar_forecast(
        latitude=latitude,
        longitude=longitude,
        hours=hours,
        hub_height_m=hub_height_m,
    )
    if solar_points and _has_irradiance(solar_points):
        logger.info(
            "Using OpenWeather solar radiation forecast",
            points=len(solar_points),
            lat=latitude,
            lon=longitude,
        )
        return solar_points

    logger.warning(
        "No irradiance available from Open-Meteo or OpenWeather solar",
        lat=latitude,
        lon=longitude,
    )
    return None
