"""
Physics-based solar forecasting model using pvlib
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pvlib import solarposition, irradiance, atmosphere, pvsystem
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.logging import get_logger

logger = get_logger('solar-physics-model')


class SolarPhysicsModel:
    """Physics-based solar power forecasting model"""
    
    def __init__(self, location: Dict, pv_params: Dict):
        """
        Initialize physics model
        
        Args:
            location: Dict with 'lat', 'lon', 'tz'
            pv_params: Dict with 'tilt', 'azimuth', 'efficiency', 'area', 'temp_coeff'
        """
        self.latitude = location['lat']
        self.longitude = location['lon']
        self.timezone = location.get('tz', 'UTC')
        self.pv_params = pv_params
        
        # Default parameters if not provided
        self.pv_params.setdefault('tilt', 30)
        self.pv_params.setdefault('azimuth', 180)  # South-facing
        self.pv_params.setdefault('efficiency', 0.18)
        self.pv_params.setdefault('area', 1000)  # m²
        self.pv_params.setdefault('temp_coeff', -0.004)  # %/°C
        self.pv_params.setdefault('noct', 45)  # Nominal Operating Cell Temperature
        self.pv_params.setdefault('inverter_efficiency', 0.96)
        
        logger.info(
            "Solar physics model initialized",
            latitude=self.latitude,
            longitude=self.longitude,
            pv_params=self.pv_params
        )
    
    def calculate_poa_irradiance(
        self,
        times: pd.DatetimeIndex,
        ghi: np.ndarray,
        dni: Optional[np.ndarray] = None,
        dhi: Optional[np.ndarray] = None
    ) -> Dict[str, np.ndarray]:
        """
        Calculate Plane of Array irradiance using Perez model
        
        Args:
            times: DatetimeIndex for calculations
            ghi: Global horizontal irradiance (W/m²)
            dni: Direct normal irradiance (W/m²), optional
            dhi: Diffuse horizontal irradiance (W/m²), optional
        
        Returns:
            Dict with 'poa_global', 'poa_direct', 'poa_diffuse', 'sun_position'
        """
        try:
            # Get solar position
            solpos = solarposition.get_solarposition(
                times,
                self.latitude,
                self.longitude
            )
            
            # Calculate sun position components
            apparent_zenith = solpos['apparent_zenith']
            azimuth = solpos['azimuth']
            
            # If DNI/DHI not provided, estimate from GHI using Erbs model
            if dni is None or dhi is None:
                clearness_index = ghi / (1367 * np.cos(np.radians(apparent_zenith)))
                clearness_index = np.clip(clearness_index, 0, 1)
                
                # Erbs model to split GHI into DNI and DHI
                if dni is None:
                    dni = irradiance.erbs(ghi, apparent_zenith, times)
                    dni = dni['dni'].values
                
                if dhi is None:
                    dhi = irradiance.erbs(ghi, apparent_zenith, times)
                    dhi = dhi['dhi'].values
            
            # Use pvlib's get_total_irradiance with Perez model
            poa_irrad = irradiance.get_total_irradiance(
                surface_tilt=self.pv_params['tilt'],
                surface_azimuth=self.pv_params['azimuth'],
                solar_zenith=apparent_zenith,
                solar_azimuth=azimuth,
                ghi=ghi,
                dni=dni,
                dhi=dhi,
                model='perez'
            )
            
            return {
                'poa_global': poa_irrad['poa_global'].values,
                'poa_direct': poa_irrad['poa_direct'].values,
                'poa_diffuse': poa_irrad['poa_diffuse'].values,
                'sun_position': solpos
            }
            
        except Exception as e:
            logger.error("Error calculating POA irradiance", exc_info=e)
            raise
    
    def estimate_pv_power(
        self,
        poa_global: np.ndarray,
        temp_air: np.ndarray,
        wind_speed: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        Estimate PV power output with temperature derating
        
        Args:
            poa_global: Plane of array global irradiance (W/m²)
            temp_air: Ambient air temperature (°C)
            wind_speed: Wind speed (m/s), optional for cooling
        
        Returns:
            AC power output (kW)
        """
        try:
            # Calculate cell temperature (NOCT model with wind cooling)
            temp_cell = self._calculate_cell_temperature(
                poa_global, temp_air, wind_speed
            )
            
            # Calculate temperature loss coefficient
            temp_coeff = self.pv_params.get('temp_coeff', -0.004)  # %/°C
            temp_loss = 1 + temp_coeff * (temp_cell - 25)
            
            # Calculate DC power
            dc_power = (
                poa_global *
                self.pv_params['efficiency'] *
                self.pv_params['area'] *
                temp_loss
            )
            
            # Apply inverter efficiency curve
            ac_power = self._apply_inverter_efficiency(dc_power)
            
            # Convert to kW
            ac_power_kw = ac_power / 1000.0
            
            return ac_power_kw
            
        except Exception as e:
            logger.error("Error estimating PV power", exc_info=e)
            raise
    
    def _calculate_cell_temperature(
        self,
        poa_global: np.ndarray,
        temp_air: np.ndarray,
        wind_speed: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        Calculate cell temperature using NOCT model with wind cooling
        
        Args:
            poa_global: Plane of array irradiance (W/m²)
            temp_air: Ambient temperature (°C)
            wind_speed: Wind speed (m/s), optional
        
        Returns:
            Cell temperature (°C)
        """
        noct = self.pv_params.get('noct', 45)
        t_ref = 20  # Reference temperature
        
        # Base NOCT model
        temp_cell = temp_air + (noct - t_ref) * (poa_global / 800)
        
        # Apply wind cooling if available
        if wind_speed is not None:
            wind_cooling = np.exp(-0.1 * wind_speed)
            temp_cell = temp_air + (temp_cell - temp_air) * wind_cooling
        
        return temp_cell
    
    def _apply_inverter_efficiency(self, dc_power: np.ndarray) -> np.ndarray:
        """
        Apply inverter efficiency curve
        
        Args:
            dc_power: DC power (W)
        
        Returns:
            AC power (W)
        """
        base_efficiency = self.pv_params.get('inverter_efficiency', 0.96)
        
        # Simple efficiency curve (more realistic would use manufacturer curves)
        # Efficiency drops at very low power
        power_ratio = dc_power / (self.pv_params['area'] * 1000)  # Normalized
        
        # Efficiency curve approximation
        efficiency = base_efficiency * (1 - 0.1 * np.exp(-10 * power_ratio))
        efficiency = np.clip(efficiency, 0.85, base_efficiency)
        
        return dc_power * efficiency
    
    def forecast(
        self,
        weather_data: Dict,
        horizon_hours: int = 24
    ) -> Dict[str, np.ndarray]:
        """
        Generate solar power forecast
        
        Args:
            weather_data: Dict with 'ghi', 'dni', 'dhi', 'temp', 'wind_speed', 'times'
            horizon_hours: Forecast horizon in hours
        
        Returns:
            Dict with 'timestamp', 'power_kw', 'poa_global'
        """
        try:
            # Generate time series
            start_time = datetime.utcnow()
            times = pd.date_range(
                start=start_time,
                periods=horizon_hours,
                freq='1H',
                tz=self.timezone
            )
            
            # Extract weather data
            ghi = np.array(weather_data.get('ghi', [0] * horizon_hours))
            dni = weather_data.get('dni')
            dhi = weather_data.get('dhi')
            temp_air = np.array(weather_data.get('temp', [20] * horizon_hours))
            wind_speed = weather_data.get('wind_speed')
            
            # Calculate POA irradiance
            poa_result = self.calculate_poa_irradiance(times, ghi, dni, dhi)
            
            # Estimate power
            power_kw = self.estimate_pv_power(
                poa_result['poa_global'],
                temp_air,
                wind_speed
            )
            
            return {
                'timestamp': times,
                'power_kw': power_kw,
                'poa_global': poa_result['poa_global'],
                'poa_direct': poa_result['poa_direct'],
                'poa_diffuse': poa_result['poa_diffuse']
            }
            
        except Exception as e:
            logger.error("Error generating forecast", exc_info=e)
            raise

