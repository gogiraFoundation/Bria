"""
Open-Meteo weather forecast client (no API key).

Returns real GHI, DNI, DHI and hub-height wind for power forecasting.
Docs: https://open-meteo.com/en/docs
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

import aiohttp

from core.logging import get_logger
from services.forecasting.weather.providers import WeatherForecastPoint, nearest_hub_height

logger = get_logger("open-meteo")

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def fetch_open_meteo_forecast(
    latitude: float,
    longitude: float,
    hours: int = 24,
    hub_height_m: float = 80.0,
) -> Optional[List[WeatherForecastPoint]]:
    """Fetch hourly forecast including solar radiation and hub-height wind."""
    height = nearest_hub_height(hub_height_m)
    wind_key = f"wind_speed_{height}m"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(
            [
                "shortwave_radiation",
                "direct_normal_irradiance",
                "diffuse_radiation",
                "temperature_2m",
                "surface_pressure",
                "wind_speed_10m",
                "wind_speed_80m",
                "wind_speed_120m",
                "wind_speed_180m",
            ]
        ),
        "forecast_hours": min(max(hours, 1), 168),
        "timezone": "UTC",
        "wind_speed_unit": "ms",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                OPEN_METEO_URL,
                params=params,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(
                        "Open-Meteo API error",
                        status=response.status,
                        body=error_text[:500],
                    )
                    return None
                data = await response.json()
    except Exception as e:
        logger.error("Error fetching Open-Meteo forecast", exc_info=e)
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        logger.warning("Open-Meteo returned empty hourly series")
        return None

    ghi_list = hourly.get("shortwave_radiation") or []
    dni_list = hourly.get("direct_normal_irradiance") or []
    dhi_list = hourly.get("diffuse_radiation") or []
    temp_list = hourly.get("temperature_2m") or []
    pressure_list = hourly.get("surface_pressure") or []
    wind_list = hourly.get(wind_key) or hourly.get("wind_speed_80m") or hourly.get(
        "wind_speed_10m"
    ) or []

    points: List[WeatherForecastPoint] = []
    limit = min(len(times), hours)
    for i in range(limit):
        try:
            ts = datetime.fromisoformat(times[i].replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue

        ghi = _optional_float(ghi_list, i)
        dni = _optional_float(dni_list, i)
        dhi = _optional_float(dhi_list, i)
        points.append(
            WeatherForecastPoint(
                timestamp=ts,
                ghi=ghi,
                dni=dni,
                dhi=dhi,
                wind_speed_hub_ms=_optional_float(wind_list, i),
                temperature=_optional_float(temp_list, i),
                pressure=_optional_float(pressure_list, i),
                source="open-meteo",
            )
        )

    return points or None


def _optional_float(series: list, index: int) -> Optional[float]:
    if index >= len(series):
        return None
    value = series[index]
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
