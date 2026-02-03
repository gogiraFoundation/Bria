"""
Forecast service that uses OpenWeather data to generate forecasts
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.logging import get_logger

logger = get_logger('forecast-service')

# Import services (make XGBoost optional)
try:
    from services.forecasting.weather.openweather import openweather_client
except ImportError as e:
    logger.warning(f"OpenWeather client not available: {e}")
    openweather_client = None

try:
    from services.forecasting.solar.physics_model import SolarPhysicsModel
except ImportError as e:
    logger.warning(f"Physics model not available: {e}")
    SolarPhysicsModel = None

# Don't import ensemble at module level - it requires XGBoost which may not be available
# We'll import it lazily only if needed
# Catch all exceptions including XGBoostError
try:
    from services.forecasting.solar.ensemble import SolarEnsembleForecaster
    ENSEMBLE_AVAILABLE = True
except Exception as e:
    # Catch all exceptions (ImportError, OSError, XGBoostError, etc.)
    logger.warning(f"Ensemble forecaster not available (XGBoost may be missing): {type(e).__name__}: {e}")
    ENSEMBLE_AVAILABLE = False
    SolarEnsembleForecaster = None

# Import wind forecasting
try:
    from services.forecasting.wind.power_curve import WindPowerForecaster, TurbineSpecifications
except ImportError as e:
    logger.warning(f"Wind forecaster not available: {e}")
    WindPowerForecaster = None
    TurbineSpecifications = None


class ForecastService:
    """Service for generating forecasts using OpenWeather data"""
    
    async def generate_solar_forecast(
        self,
        site: Dict,
        horizon_hours: int = 24
    ) -> Dict:
        """Generate solar forecast for a site using OpenWeather data"""
        try:
            # Get weather forecast from OpenWeather
            if not openweather_client:
                logger.warning("OpenWeather client not available, using fallback forecast")
                return self._generate_fallback_forecast(site, horizon_hours)
            
            if not openweather_client.api_key:
                logger.warning("OpenWeather API key not configured, using fallback forecast", site_id=site.get('id'))
                return self._generate_fallback_forecast(site, horizon_hours)
            
            logger.info("Fetching weather forecast from OpenWeather", 
                       site_id=site.get('id'), 
                       lat=site['latitude'], 
                       lon=site['longitude'],
                       hours=horizon_hours)
            
            weather_forecast = await openweather_client.get_forecast(
                latitude=float(site['latitude']),
                longitude=float(site['longitude']),
                hours=horizon_hours,
                site_id=str(site.get('id', '')) if site.get('id') else None
            )
            
            if not weather_forecast or len(weather_forecast) == 0:
                logger.warning(
                    "No weather data available from OpenWeather, using fallback forecast",
                    site_id=site['id'],
                    forecast_length=len(weather_forecast) if weather_forecast else 0
                )
                return self._generate_fallback_forecast(site, horizon_hours)
            
            logger.info(f"Received {len(weather_forecast)} forecast intervals from OpenWeather", site_id=site.get('id'))
            
            # Initialize physics model (if available)
            if not SolarPhysicsModel:
                logger.warning("Physics model not available, using fallback forecast")
                return self._generate_fallback_forecast(site, horizon_hours)
            
            location = {
                'lat': float(site['latitude']),
                'lon': float(site['longitude']),
                'tz': site.get('timezone', 'UTC')
            }
            
            # Parse pv_params from JSON string if needed
            pv_params_raw = site.get('pv_params')
            if isinstance(pv_params_raw, str):
                import json
                try:
                    pv_params = json.loads(pv_params_raw)
                except (json.JSONDecodeError, TypeError):
                    pv_params = {}
            elif isinstance(pv_params_raw, dict):
                pv_params = pv_params_raw
            else:
                pv_params = {}
            
            # Set defaults if missing
            if not pv_params:
                pv_params = {
                    'tilt': 30,
                    'azimuth': 180,
                    'module_type': 'mono-Si',
                    'system_loss': 0.14
                }
            
            physics_model = SolarPhysicsModel(location, pv_params)
            
            # Generate forecast points
            forecast_points = []
            base_time = datetime.utcnow()
            
            for i, weather_data in enumerate(weather_forecast[:horizon_hours // 3]):
                # Convert OpenWeather data to WeatherData
                weather = openweather_client.convert_to_weather_data(
                    weather_data,
                    station_id=f"site_{site['id']}",
                    latitude=float(site['latitude']),
                    longitude=float(site['longitude'])
                )
                
                # Calculate power for this time point
                timestamp = weather.timestamp
                
                # Use physics model to calculate power
                try:
                    import pandas as pd
                    import numpy as np
                    from pvlib import solarposition, irradiance
                    
                    # Create a single timestamp
                    times = pd.DatetimeIndex([timestamp], tz='UTC')
                    
                    # Get solar position
                    solpos = solarposition.get_solarposition(
                        times,
                        float(site['latitude']),
                        float(site['longitude'])
                    )
                    
                    # Calculate POA irradiance
                    ghi_val = weather.ghi or 0
                    
                    # Extract values from pandas Series/DataFrame, handling both Series and scalar cases
                    def get_scalar_value(series_or_scalar):
                        """Safely extract scalar value from pandas Series or numpy scalar"""
                        if hasattr(series_or_scalar, 'iloc'):
                            # It's a Series/DataFrame - use iloc[0]
                            return float(series_or_scalar.iloc[0])
                        elif hasattr(series_or_scalar, 'values'):
                            # It has values attribute - extract first value
                            vals = series_or_scalar.values
                            return float(vals[0] if len(vals) > 0 else vals)
                        else:
                            # Already a scalar (numpy.float64, float, etc.)
                            return float(series_or_scalar)
                    
                    apparent_zenith = get_scalar_value(solpos['apparent_zenith'])
                    solar_azimuth = get_scalar_value(solpos['azimuth'])
                    
                    # Estimate DNI/DHI from GHI if needed
                    if apparent_zenith < 90:  # Sun is up
                        erbs_result = irradiance.erbs(
                            ghi=ghi_val,
                            zenith=apparent_zenith,
                            datetime_or_doy=times
                        )
                        dni_val = get_scalar_value(erbs_result['dni']) if 'dni' in erbs_result else ghi_val * 0.7
                        dhi_val = get_scalar_value(erbs_result['dhi']) if 'dhi' in erbs_result else ghi_val * 0.3
                    else:
                        dni_val = 0
                        dhi_val = 0
                    
                    # Calculate POA
                    # Use 'isotropic' model instead of 'perez' to avoid requiring dni_extra
                    # Isotropic model is simpler and doesn't need dni_extra parameter
                    poa_result = irradiance.get_total_irradiance(
                        surface_tilt=pv_params.get('tilt', 30),
                        surface_azimuth=pv_params.get('azimuth', 180),
                        solar_zenith=apparent_zenith,
                        solar_azimuth=solar_azimuth,
                        ghi=ghi_val,
                        dni=dni_val,
                        dhi=dhi_val,
                        model='isotropic'  # Changed from 'perez' to 'isotropic'
                    )
                    poa_global = get_scalar_value(poa_result['poa_global'])
                    
                    # Calculate cell temperature
                    temp_air = weather.temperature or 25
                    wind_speed = weather.wind_speed or 0
                    noct = pv_params.get('noct', 45)
                    temp_cell = temp_air + (noct - 20) * poa_global / 800
                    
                    # Temperature derating
                    temp_coeff = pv_params.get('temp_coeff', -0.004)
                    temp_loss = 1 + temp_coeff * (temp_cell - 25)
                    
                    # Calculate power
                    capacity_mw = float(site.get('capacity_mw', 1.0))
                    efficiency = pv_params.get('efficiency', 0.18)
                    system_loss = pv_params.get('system_loss', 0.14)
                    inverter_eff = pv_params.get('inverter_efficiency', 0.96)
                    
                    # DC power (kW)
                    dc_power_kw = (poa_global / 1000) * capacity_mw * 1000 * efficiency * temp_loss * (1 - system_loss)
                    # AC power (kW)
                    power_kw = dc_power_kw * inverter_eff
                    power_kw = max(0, power_kw)  # Ensure non-negative
                    
                except Exception as e:
                    logger.warning(
                        "Error in physics model calculation, using estimate",
                        error=str(e)
                    )
                    # Fallback: estimate from GHI
                    capacity_mw = float(site.get('capacity_mw', 1.0))
                    power_kw = (weather.ghi or 0) / 1000 * capacity_mw * 1000 * 0.8
                
                # Add confidence intervals (simplified)
                uncertainty = power_kw * 0.15  # 15% uncertainty
                p10 = max(0, power_kw - uncertainty * 1.5)
                p50 = power_kw
                p90 = power_kw + uncertainty * 1.5
                
                forecast_points.append({
                    "timestamp": timestamp.isoformat(),
                    "predicted_power_kw": round(power_kw, 2),
                    "p10": round(p10, 2),
                    "p50": round(p50, 2),
                    "p90": round(p90, 2)
                })
            
            # Fill in hourly intervals if needed
            if len(forecast_points) < horizon_hours:
                # Interpolate to hourly
                hourly_points = []
                for hour in range(horizon_hours):
                    timestamp = base_time + timedelta(hours=hour)
                    # Find nearest forecast point
                    nearest_idx = min(
                        range(len(forecast_points)),
                        key=lambda i: abs(
                            (datetime.fromisoformat(forecast_points[i]['timestamp'].replace('Z', '+00:00')) - timestamp).total_seconds()
                        )
                    )
                    point = forecast_points[nearest_idx].copy()
                    point['timestamp'] = timestamp.isoformat()
                    hourly_points.append(point)
                forecast_points = hourly_points
            
            return {
                "site_id": str(site['id']),
                "horizon": f"{horizon_hours}h",
                "forecast_generated": datetime.utcnow().isoformat(),
                "values": forecast_points[:horizon_hours]
            }
            
        except Exception as e:
            logger.error("Error generating forecast", exc_info=e, site_id=site.get('id'))
            return self._generate_fallback_forecast(site, horizon_hours)
    
    def _generate_fallback_forecast(
        self,
        site: Dict,
        horizon_hours: int
    ) -> Dict:
        """Generate a simple fallback forecast when weather data is unavailable"""
        # Convert Decimal to float if needed
        capacity_mw = float(site.get('capacity_mw', 1.0))
        base_power = capacity_mw * 1000 * 0.5  # 50% capacity as base
        values = []
        
        for i in range(horizon_hours):
            # Simple diurnal pattern
            hour_of_day = (datetime.utcnow().hour + i) % 24
            if 6 <= hour_of_day <= 18:  # Daytime
                power = base_power * (1 + 0.5 * abs(12 - hour_of_day) / 6)
            else:  # Nighttime
                power = base_power * 0.1
            
            values.append({
                "timestamp": (datetime.utcnow() + timedelta(hours=i)).isoformat(),
                "predicted_power_kw": round(power, 2),
                "p10": round(power * 0.8, 2),
                "p50": round(power, 2),
                "p90": round(power * 1.2, 2)
            })
        
            return {
                "site_id": str(site['id']),
                "horizon": f"{horizon_hours}h",
                "forecast_generated": datetime.utcnow().isoformat(),
                "values": values
            }
    
    async def generate_wind_forecast(
        self,
        site: Dict,
        horizon_hours: int = 24
    ) -> Dict:
        """Generate wind forecast for a site using OpenWeather data"""
        try:
            # Get weather forecast from OpenWeather
            if not openweather_client:
                logger.warning("OpenWeather client not available, using fallback forecast")
                return self._generate_wind_fallback_forecast(site, horizon_hours)
            
            if not openweather_client.api_key:
                logger.warning("OpenWeather API key not configured, using fallback forecast", site_id=site.get('id'))
                return self._generate_wind_fallback_forecast(site, horizon_hours)
            
            logger.info("Fetching weather forecast from OpenWeather for wind site", 
                       site_id=site.get('id'), 
                       lat=site['latitude'], 
                       lon=site['longitude'],
                       hours=horizon_hours)
            
            weather_forecast = await openweather_client.get_forecast(
                latitude=float(site['latitude']),
                longitude=float(site['longitude']),
                hours=horizon_hours,
                site_id=str(site.get('id', '')) if site.get('id') else None
            )
            
            if not weather_forecast or len(weather_forecast) == 0:
                logger.warning(
                    "No weather data available from OpenWeather, using fallback forecast",
                    site_id=site['id']
                )
                return self._generate_wind_fallback_forecast(site, horizon_hours)
            
            logger.info(f"Received {len(weather_forecast)} forecast intervals from OpenWeather", site_id=site.get('id'))
            
            # Parse turbine_params from JSON string if needed
            turbine_params_raw = site.get('turbine_params')
            if isinstance(turbine_params_raw, str):
                import json
                try:
                    turbine_params = json.loads(turbine_params_raw)
                except (json.JSONDecodeError, TypeError):
                    turbine_params = {}
            elif isinstance(turbine_params_raw, dict):
                turbine_params = turbine_params_raw
            else:
                turbine_params = {}
            
            # Create default turbine specs if not provided
            capacity_mw = float(site.get('capacity_mw', 1.0))
            rated_power_kw = capacity_mw * 1000
            
            # Default power curve (typical 1MW turbine)
            # Format: [(wind_speed_m/s, power_kw), ...]
            default_power_curve = [
                (0, 0), (3, 0), (4, 50), (5, 150), (6, 300), (7, 500),
                (8, 650), (9, 750), (10, 850), (11, 920), (12, 980),
                (13, 1000), (14, 1000), (15, 1000), (20, 1000), (25, 0)
            ]
            
            if not WindPowerForecaster:
                logger.warning("Wind forecaster not available, using fallback forecast")
                return self._generate_wind_fallback_forecast(site, horizon_hours)
            
            # Get and validate power_curve
            power_curve_raw = turbine_params.get('power_curve', default_power_curve)
            
            # Ensure power_curve is in correct format (list of tuples)
            if isinstance(power_curve_raw, list) and len(power_curve_raw) > 0:
                # Check if first element is a tuple/list
                if isinstance(power_curve_raw[0], (tuple, list)) and len(power_curve_raw[0]) >= 2:
                    power_curve = power_curve_raw  # Already in correct format
                else:
                    # Might be in wrong format, use default
                    logger.warning(f"power_curve format invalid, using default. Got: {power_curve_raw[:3] if len(power_curve_raw) > 3 else power_curve_raw}")
                    power_curve = default_power_curve
            else:
                # Not a list or empty, use default
                logger.warning(f"power_curve not a valid list, using default. Got: {type(power_curve_raw)}")
                power_curve = default_power_curve
            
            # Create turbine specs with error handling
            try:
                turbine_specs = TurbineSpecifications(
                    model=turbine_params.get('model', 'Generic 1MW'),
                    rated_power=rated_power_kw,
                    hub_height=turbine_params.get('hub_height', 80.0),
                    rotor_diameter=turbine_params.get('rotor_diameter', 60.0),
                    cut_in_speed=turbine_params.get('cut_in_speed', 3.0),
                    rated_speed=turbine_params.get('rated_speed', 12.0),
                    cut_out_speed=turbine_params.get('cut_out_speed', 25.0),
                    power_curve=power_curve
                )
                
                wind_forecaster = WindPowerForecaster(turbine_specs)
            except (ValueError, TypeError) as e:
                logger.error(
                    f"Error creating wind forecaster, using fallback: {e}",
                    power_curve_type=type(power_curve),
                    power_curve_length=len(power_curve) if isinstance(power_curve, list) else "N/A",
                    exc_info=e
                )
                return self._generate_wind_fallback_forecast(site, horizon_hours)
            
            # Generate forecast points
            forecast_points = []
            base_time = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
            
            # Process OpenWeather forecast (3-hour intervals)
            for i, weather_data in enumerate(weather_forecast):
                try:
                    # Convert OpenWeather data to WeatherData
                    weather = openweather_client.convert_to_weather_data(
                        weather_data,
                        station_id=f"site_{site['id']}",
                        latitude=float(site['latitude']),
                        longitude=float(site['longitude'])
                    )
                    
                    # Extract wind speed (m/s)
                    wind_speed = weather.wind_speed or 0
                    
                    # Estimate air density from temperature and pressure
                    temp = weather.temperature or 15.0  # Celsius
                    pressure = weather.pressure or 1013.25  # hPa
                    # Simplified air density calculation (kg/m³)
                    air_density = (pressure * 100) / (287.05 * (temp + 273.15))
                    
                    # Calculate power using wind forecaster
                    import numpy as np
                    wind_speed_array = np.array([wind_speed])
                    power_kw = wind_forecaster.estimate_power(
                        wind_speed_array,
                        air_density=air_density,
                        turbulence_intensity=0.1
                    )[0]  # Get scalar from array
                    
                    # Add uncertainty (15% for wind)
                    uncertainty = power_kw * 0.15
                    p10 = max(0, power_kw - uncertainty * 1.5)
                    p50 = power_kw
                    p90 = power_kw + uncertainty * 1.5
                    
                    forecast_points.append({
                        "timestamp": weather.timestamp.isoformat(),
                        "predicted_power_kw": round(power_kw, 2),
                        "p10": round(p10, 2),
                        "p50": round(p50, 2),
                        "p90": round(p90, 2)
                    })
                except Exception as e:
                    # Get timestamp from weather_data (fallback if weather object failed)
                    timestamp = datetime.utcfromtimestamp(weather_data.get('dt', 0))
                    logger.warning(
                        f"Error in wind forecast calculation for timestamp {timestamp.isoformat()}, using estimate: {e}",
                        exc_info=e
                    )
                    # Fallback estimate - extract wind speed directly from weather_data
                    wind_speed = weather_data.get('wind', {}).get('speed', 0) or 0
                    capacity_mw = float(site.get('capacity_mw', 1.0))
                    # Simple power curve approximation
                    if wind_speed < 3:
                        power_kw = 0
                    elif wind_speed > 25:
                        power_kw = 0
                    else:
                        power_kw = min(capacity_mw * 1000, (wind_speed / 12) * capacity_mw * 1000)
                    
                    uncertainty = power_kw * 0.15
                    forecast_points.append({
                        "timestamp": timestamp.isoformat(),
                        "predicted_power_kw": round(power_kw, 2),
                        "p10": round(max(0, power_kw - uncertainty * 1.5), 2),
                        "p50": round(power_kw, 2),
                        "p90": round(power_kw + uncertainty * 1.5, 2)
                    })
            
            # Interpolate 3-hour forecast points to hourly
            import pandas as pd
            hourly_forecast_points = []
            if forecast_points:
                # Create a DataFrame for easier interpolation
                df = pd.DataFrame(forecast_points)
                df['timestamp'] = pd.to_datetime(df['timestamp'])
                df = df.set_index('timestamp')
                
                # Resample to hourly and interpolate
                hourly_df = df.resample('H').mean().interpolate(method='linear')
                
                # Ensure we have enough points for the horizon
                current_hour = base_time
                for _ in range(horizon_hours):
                    if current_hour in hourly_df.index:
                        point_data = hourly_df.loc[current_hour].to_dict()
                        hourly_forecast_points.append({
                            "timestamp": current_hour.isoformat(),
                            "predicted_power_kw": round(point_data.get('predicted_power_kw', 0), 2),
                            "p10": round(point_data.get('p10', 0), 2),
                            "p50": round(point_data.get('p50', 0), 2),
                            "p90": round(point_data.get('p90', 0), 2),
                        })
                    else:
                        # Fallback for missing interpolated points
                        capacity_mw = float(site.get('capacity_mw', 1.0))
                        power_kw = capacity_mw * 1000 * 0.3  # Default 30% capacity
                        hourly_forecast_points.append({
                            "timestamp": current_hour.isoformat(),
                            "predicted_power_kw": round(power_kw, 2),
                            "p10": round(power_kw * 0.8, 2),
                            "p50": round(power_kw, 2),
                            "p90": round(power_kw * 1.2, 2),
                        })
                    current_hour += timedelta(hours=1)
            
            return {
                "site_id": str(site['id']),
                "horizon": f"{horizon_hours}h",
                "forecast_generated": datetime.utcnow().isoformat(),
                "values": hourly_forecast_points[:horizon_hours]
            }
            
        except Exception as e:
            logger.error("Error generating wind forecast", exc_info=e, site_id=site.get('id'))
            return self._generate_wind_fallback_forecast(site, horizon_hours)
    
    def _generate_wind_fallback_forecast(
        self,
        site: Dict,
        horizon_hours: int
    ) -> Dict:
        """Generate a simple fallback wind forecast when weather data is unavailable"""
        capacity_mw = float(site.get('capacity_mw', 1.0))
        base_power = capacity_mw * 1000 * 0.3  # 30% capacity as base for wind
        values = []
        
        for i in range(horizon_hours):
            # Simple wind pattern (more variable than solar)
            hour_of_day = (datetime.utcnow().hour + i) % 24
            # Wind is typically stronger at night and early morning
            if 0 <= hour_of_day <= 6 or 18 <= hour_of_day <= 23:
                power = base_power * 1.2  # Stronger at night
            else:
                power = base_power * 0.8  # Weaker during day
            
            # Add some randomness
            import random
            power = power * (0.8 + random.random() * 0.4)
            
            values.append({
                "timestamp": (datetime.utcnow() + timedelta(hours=i)).isoformat(),
                "predicted_power_kw": round(power, 2),
                "p10": round(power * 0.7, 2),
                "p50": round(power, 2),
                "p90": round(power * 1.3, 2)
            })
        
        return {
            "site_id": str(site['id']),
            "horizon": f"{horizon_hours}h",
            "forecast_generated": datetime.utcnow().isoformat(),
            "values": values
        }


# Global service instance
forecast_service = ForecastService()

