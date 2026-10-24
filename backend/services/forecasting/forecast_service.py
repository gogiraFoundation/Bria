"""
Forecast service using real irradiance and hub-height wind.

Open-Meteo is preferred; OpenWeather Solar Radiation is the failover.
Synthetic capacity curves are never returned as forecasts.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.logging import get_logger

try:
    from core.database import get_db_pool
except ImportError:  # pragma: no cover
    from backend.core.database import get_db_pool  # type: ignore

logger = get_logger("forecast-service")

try:
    from services.forecasting.wind.power_curve import WindPowerForecaster, TurbineSpecifications
except ImportError as e:
    logger.warning(f"Wind forecaster not available: {e}")
    WindPowerForecaster = None
    TurbineSpecifications = None


def _unavailable(site: Dict, horizon_hours: int, reason: str = "weather_unavailable") -> Dict:
    return {
        "site_id": str(site.get("id", "")),
        "horizon": f"{horizon_hours}h",
        "forecast_generated": datetime.utcnow().isoformat(),
        "status": "unavailable",
        "reason": reason,
        "weather_source": None,
        "model_version": None,
        "values": [],
    }


def _parse_json_params(raw: Any) -> Dict:
    if isinstance(raw, str):
        try:
            return json.loads(raw) or {}
        except (json.JSONDecodeError, TypeError):
            return {}
    if isinstance(raw, dict):
        return raw
    return {}


def _get_scalar_value(series_or_scalar) -> float:
    if hasattr(series_or_scalar, "iloc"):
        return float(series_or_scalar.iloc[0])
    if hasattr(series_or_scalar, "values"):
        vals = series_or_scalar.values
        return float(vals[0] if len(vals) > 0 else vals)
    return float(series_or_scalar)


def _physics_envelope(power_kw: float) -> Dict[str, float]:
    """Labelled physics envelope (±15%), not a calibrated P10/P90."""
    uncertainty = power_kw * 0.15
    return {
        "predicted_power_kw": round(power_kw, 2),
        "p10": round(max(0.0, power_kw - uncertainty * 1.5), 2),
        "p50": round(power_kw, 2),
        "p90": round(power_kw + uncertainty * 1.5, 2),
    }


def _hub_height_from_site(site: Dict) -> float:
    turbine_params = _parse_json_params(site.get("turbine_params"))
    try:
        return float(turbine_params.get("hub_height", 80.0))
    except (TypeError, ValueError):
        return 80.0


class ForecastService:
    """Generate solar, wind, and hybrid forecasts from real weather inputs."""

    def _solar_model_version(self) -> str:
        try:
            from core.config import get_settings

            if get_settings().SOLAR_NAMEPLATE_YIELD:
                return "nameplate-v1"
        except Exception:
            return "nameplate-v1"
        return "physics-pvlib"

    async def _fetch_weather(self, site: Dict, horizon_hours: int):
        from services.forecasting.weather.providers import get_weather_forecast

        return await get_weather_forecast(
            latitude=float(site["latitude"]),
            longitude=float(site["longitude"]),
            hours=horizon_hours,
            hub_height_m=_hub_height_from_site(site),
        )

    def _solar_power_kw(
        self,
        site: Dict,
        pv_params: Dict,
        timestamp: datetime,
        ghi: float,
        dni: Optional[float],
        dhi: Optional[float],
        temperature: Optional[float],
        wind_speed: Optional[float],
    ) -> float:
        import pandas as pd
        from pvlib import solarposition, irradiance

        try:
            from core.config import get_settings
            use_nameplate = bool(get_settings().SOLAR_NAMEPLATE_YIELD)
        except Exception:
            use_nameplate = True

        if timestamp.tzinfo is None:
            times = pd.DatetimeIndex([timestamp], tz="UTC")
        else:
            times = pd.DatetimeIndex([timestamp.astimezone(timezone.utc)])

        solpos = solarposition.get_solarposition(
            times,
            float(site["latitude"]),
            float(site["longitude"]),
        )
        apparent_zenith = _get_scalar_value(solpos["apparent_zenith"])
        solar_azimuth = _get_scalar_value(solpos["azimuth"])

        if apparent_zenith >= 90:
            return 0.0

        if dni is not None and dhi is not None:
            dni_val = float(dni)
            dhi_val = float(dhi)
        else:
            erbs_result = irradiance.erbs(
                ghi=ghi,
                zenith=apparent_zenith,
                datetime_or_doy=times,
            )
            dni_val = (
                _get_scalar_value(erbs_result["dni"])
                if "dni" in erbs_result
                else ghi * 0.7
            )
            dhi_val = (
                _get_scalar_value(erbs_result["dhi"])
                if "dhi" in erbs_result
                else ghi * 0.3
            )

        poa_result = irradiance.get_total_irradiance(
            surface_tilt=pv_params.get("tilt", 30),
            surface_azimuth=pv_params.get("azimuth", 180),
            solar_zenith=apparent_zenith,
            solar_azimuth=solar_azimuth,
            ghi=ghi,
            dni=dni_val,
            dhi=dhi_val,
            model="isotropic",
        )
        poa_global = _get_scalar_value(poa_result["poa_global"])

        capacity_mw = float(site.get("capacity_mw", 1.0))
        system_loss = float(pv_params.get("system_loss", 0.14))
        inverter_eff = float(pv_params.get("inverter_efficiency", 0.96))
        noct = float(pv_params.get("noct", 45))
        temp_coeff = float(pv_params.get("temp_coeff", -0.004))
        temp_air = temperature if temperature is not None else 25.0
        wind = wind_speed if wind_speed is not None else 0.0

        if use_nameplate:
            # Nameplate invariant: do not multiply by module efficiency again.
            from services.selection.yield_model import solar_ac_kw

            return solar_ac_kw(
                capacity_mw,
                float(poa_global),
                system_loss=system_loss,
                inverter_efficiency=inverter_eff,
                temp_air_c=float(temp_air),
                noct=noct,
                temp_coeff=temp_coeff,
                wind_speed_m_s=float(wind),
            )

        temp_cell = temp_air + (noct - 20) * poa_global / 800
        temp_loss = 1 + temp_coeff * (temp_cell - 25)
        efficiency = pv_params.get("efficiency", 0.18)
        dc_power_kw = (
            (poa_global / 1000)
            * capacity_mw
            * 1000
            * efficiency
            * temp_loss
            * (1 - system_loss)
        )
        return max(0.0, dc_power_kw * inverter_eff)

    def _build_wind_forecaster(self, site: Dict):
        if not WindPowerForecaster or not TurbineSpecifications:
            return None

        turbine_params = _parse_json_params(site.get("turbine_params"))
        capacity_mw = float(site.get("capacity_mw", 1.0))
        rated_power_kw = capacity_mw * 1000
        default_power_curve = [
            (0, 0),
            (3, 0),
            (4, 50),
            (5, 150),
            (6, 300),
            (7, 500),
            (8, 650),
            (9, 750),
            (10, 850),
            (11, 920),
            (12, 980),
            (13, 1000),
            (14, 1000),
            (15, 1000),
            (20, 1000),
            (25, 0),
        ]
        # Scale default curve to site rated power
        scale = rated_power_kw / 1000.0 if rated_power_kw else 1.0
        scaled_default = [(s, p * scale) for s, p in default_power_curve]

        power_curve_raw = turbine_params.get("power_curve", scaled_default)
        if isinstance(power_curve_raw, list) and power_curve_raw:
            if isinstance(power_curve_raw[0], (tuple, list)) and len(power_curve_raw[0]) >= 2:
                power_curve = power_curve_raw
            else:
                power_curve = scaled_default
        else:
            power_curve = scaled_default

        specs = TurbineSpecifications(
            model=turbine_params.get("model", "Generic"),
            rated_power=rated_power_kw,
            hub_height=float(turbine_params.get("hub_height", 80.0)),
            rotor_diameter=float(turbine_params.get("rotor_diameter", 60.0)),
            cut_in_speed=float(turbine_params.get("cut_in_speed", 3.0)),
            rated_speed=float(turbine_params.get("rated_speed", 12.0)),
            cut_out_speed=float(turbine_params.get("cut_out_speed", 25.0)),
            power_curve=power_curve,
        )
        return WindPowerForecaster(specs)

    def _wind_power_kw(
        self,
        wind_forecaster,
        wind_speed: Optional[float],
        temperature: Optional[float],
        pressure: Optional[float],
    ) -> float:
        import numpy as np

        speed = float(wind_speed or 0.0)
        temp = temperature if temperature is not None else 15.0
        press = pressure if pressure is not None else 1013.25
        air_density = (press * 100) / (287.05 * (temp + 273.15))
        power = wind_forecaster.estimate_power(
            np.array([speed]),
            air_density=air_density,
            turbulence_intensity=0.1,
        )[0]
        return max(0.0, float(power))

    async def generate_solar_forecast(
        self,
        site: Dict,
        horizon_hours: int = 24,
    ) -> Dict:
        """Generate solar forecast from real irradiance."""
        try:
            weather_points = await self._fetch_weather(site, horizon_hours)
            if not weather_points:
                return _unavailable(site, horizon_hours)

            pv_params = _parse_json_params(site.get("pv_params"))
            if not pv_params:
                pv_params = {
                    "tilt": 30,
                    "azimuth": 180,
                    "module_type": "mono-Si",
                    "system_loss": 0.14,
                }

            forecast_points: List[Dict] = []
            weather_source = weather_points[0].source

            for point in weather_points[:horizon_hours]:
                ghi = float(point.ghi or 0.0)
                try:
                    power_kw = self._solar_power_kw(
                        site=site,
                        pv_params=pv_params,
                        timestamp=point.timestamp,
                        ghi=ghi,
                        dni=point.dni,
                        dhi=point.dhi,
                        temperature=point.temperature,
                        wind_speed=point.wind_speed_hub_ms,
                    )
                except Exception as e:
                    logger.warning(
                        "Solar physics calculation failed for point",
                        error=str(e),
                        timestamp=point.timestamp.isoformat(),
                    )
                    capacity_mw = float(site.get("capacity_mw", 1.0))
                    power_kw = max(0.0, (ghi / 1000.0) * capacity_mw * 1000 * 0.8)

                envelope = _physics_envelope(power_kw)
                forecast_points.append(
                    {
                        "timestamp": point.timestamp.isoformat(),
                        **envelope,
                    }
                )

            if not forecast_points:
                return _unavailable(site, horizon_hours, reason="no_forecast_points")

            return {
                "site_id": str(site["id"]),
                "horizon": f"{horizon_hours}h",
                "forecast_generated": datetime.utcnow().isoformat(),
                "status": "ok",
                "weather_source": weather_source,
                "model_version": self._solar_model_version(),
                "values": forecast_points[:horizon_hours],
            }
        except Exception as e:
            logger.error("Error generating solar forecast", exc_info=e, site_id=site.get("id"))
            return _unavailable(site, horizon_hours, reason="solar_error")

    async def generate_wind_forecast(
        self,
        site: Dict,
        horizon_hours: int = 24,
    ) -> Dict:
        """Generate wind forecast from hub-height wind speed."""
        try:
            weather_points = await self._fetch_weather(site, horizon_hours)
            if not weather_points:
                return _unavailable(site, horizon_hours)

            wind_forecaster = self._build_wind_forecaster(site)
            if wind_forecaster is None:
                return _unavailable(site, horizon_hours, reason="wind_model_unavailable")

            weather_source = weather_points[0].source
            forecast_points: List[Dict] = []

            for point in weather_points[:horizon_hours]:
                try:
                    power_kw = self._wind_power_kw(
                        wind_forecaster,
                        point.wind_speed_hub_ms,
                        point.temperature,
                        point.pressure,
                    )
                except Exception as e:
                    logger.warning(
                        "Wind power calculation failed for point",
                        error=str(e),
                        timestamp=point.timestamp.isoformat(),
                    )
                    power_kw = 0.0

                envelope = _physics_envelope(power_kw)
                forecast_points.append(
                    {
                        "timestamp": point.timestamp.isoformat(),
                        **envelope,
                    }
                )

            if not forecast_points:
                return _unavailable(site, horizon_hours, reason="no_forecast_points")

            return {
                "site_id": str(site["id"]),
                "horizon": f"{horizon_hours}h",
                "forecast_generated": datetime.utcnow().isoformat(),
                "status": "ok",
                "weather_source": weather_source,
                "model_version": "wind-power-curve",
                "values": forecast_points[:horizon_hours],
            }
        except Exception as e:
            logger.error("Error generating wind forecast", exc_info=e, site_id=site.get("id"))
            return _unavailable(site, horizon_hours, reason="wind_error")

    async def generate_hybrid_forecast(
        self,
        site: Dict,
        horizon_hours: int = 24,
    ) -> Dict:
        """Sum solar and wind AC power on the same weather series."""
        try:
            weather_points = await self._fetch_weather(site, horizon_hours)
            if not weather_points:
                return _unavailable(site, horizon_hours)

            pv_params = _parse_json_params(site.get("pv_params"))
            if not pv_params:
                pv_params = {
                    "tilt": 30,
                    "azimuth": 180,
                    "module_type": "mono-Si",
                    "system_loss": 0.14,
                }

            # Split capacity evenly when hybrid params do not specify shares
            solar_site = dict(site)
            wind_site = dict(site)
            capacity_mw = float(site.get("capacity_mw", 1.0))
            solar_site["capacity_mw"] = capacity_mw * 0.5
            wind_site["capacity_mw"] = capacity_mw * 0.5

            wind_forecaster = self._build_wind_forecaster(wind_site)
            weather_source = weather_points[0].source
            forecast_points: List[Dict] = []

            for point in weather_points[:horizon_hours]:
                ghi = float(point.ghi or 0.0)
                try:
                    solar_kw = self._solar_power_kw(
                        site=solar_site,
                        pv_params=pv_params,
                        timestamp=point.timestamp,
                        ghi=ghi,
                        dni=point.dni,
                        dhi=point.dhi,
                        temperature=point.temperature,
                        wind_speed=point.wind_speed_hub_ms,
                    )
                except Exception:
                    solar_kw = 0.0

                if wind_forecaster is not None:
                    try:
                        wind_kw = self._wind_power_kw(
                            wind_forecaster,
                            point.wind_speed_hub_ms,
                            point.temperature,
                            point.pressure,
                        )
                    except Exception:
                        wind_kw = 0.0
                else:
                    wind_kw = 0.0

                power_kw = max(0.0, solar_kw + wind_kw)
                envelope = _physics_envelope(power_kw)
                forecast_points.append(
                    {
                        "timestamp": point.timestamp.isoformat(),
                        **envelope,
                    }
                )

            if not forecast_points:
                return _unavailable(site, horizon_hours, reason="no_forecast_points")

            return {
                "site_id": str(site["id"]),
                "horizon": f"{horizon_hours}h",
                "forecast_generated": datetime.utcnow().isoformat(),
                "status": "ok",
                "weather_source": weather_source,
                "model_version": "hybrid-physics",
                "values": forecast_points[:horizon_hours],
            }
        except Exception as e:
            logger.error("Error generating hybrid forecast", exc_info=e, site_id=site.get("id"))
            return _unavailable(site, horizon_hours, reason="hybrid_error")

    async def generate_forecast_for_site(
        self,
        site: Dict,
        horizon_hours: int = 24,
    ) -> Dict:
        """Dispatch to solar, wind, or hybrid based on site type."""
        site_type = str(site.get("type", "solar")).lower()
        if site_type == "wind":
            return await self.generate_wind_forecast(site, horizon_hours)
        if site_type == "hybrid":
            return await self.generate_hybrid_forecast(site, horizon_hours)
        return await self.generate_solar_forecast(site, horizon_hours)

    async def list_active_models(self, model_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List active models from the model_registry table."""
        pool = await get_db_pool()
        query = """
            SELECT id, name, type, version, storage_path, metrics,
                   training_data_range, deployed_at, is_active, created_at
            FROM model_registry
            WHERE is_active = TRUE
              {type_filter}
            ORDER BY created_at DESC
        """
        type_clause = ""
        params: List[Any] = []
        if model_type:
            type_clause = "AND type = $1"
            params.append(model_type)
        query = query.format(type_filter=type_clause)

        conn = await pool.acquire()
        rows = await conn.fetch(query, *params)
        return [dict(row) for row in rows]


forecast_service = ForecastService()
