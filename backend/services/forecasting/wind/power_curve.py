"""
Wind power curve modeling and forecasting
"""
import numpy as np
from scipy.interpolate import interp1d
from dataclasses import dataclass
from typing import List, Tuple, Optional
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.logging import get_logger

logger = get_logger('wind-power-curve')


@dataclass
class TurbineSpecifications:
    """Wind turbine specifications"""
    model: str
    rated_power: float  # kW
    hub_height: float  # m
    rotor_diameter: float  # m
    cut_in_speed: float  # m/s
    rated_speed: float  # m/s
    cut_out_speed: float  # m/s
    power_curve: List[Tuple[float, float]]  # [(wind_speed, power)]


class WindPowerForecaster:
    """Wind power forecasting using power curve modeling"""
    
    def __init__(self, turbine_specs: TurbineSpecifications):
        """
        Initialize wind power forecaster
        
        Args:
            turbine_specs: Turbine specifications
        """
        self.specs = turbine_specs
        self.power_curve_func = self._create_power_curve()
        
        logger.info(
            "Wind power forecaster initialized",
            model=turbine_specs.model,
            rated_power=turbine_specs.rated_power
        )
    
    def _create_power_curve(self):
        """Create interpolated power curve function"""
        # Validate and normalize power_curve format
        power_curve = self.specs.power_curve
        
        # Ensure it's a list
        if not isinstance(power_curve, list):
            raise ValueError(f"power_curve must be a list, got {type(power_curve)}")
        
        # Ensure each element is a tuple/list of 2 values
        normalized_curve = []
        for item in power_curve:
            if isinstance(item, (tuple, list)) and len(item) >= 2:
                normalized_curve.append((float(item[0]), float(item[1])))
            else:
                raise ValueError(f"power_curve items must be tuples/lists of 2 values, got {item}")
        
        if len(normalized_curve) < 2:
            raise ValueError(f"power_curve must have at least 2 points, got {len(normalized_curve)}")
        
        speeds, powers = zip(*normalized_curve)
        return interp1d(
            speeds,
            powers,
            bounds_error=False,
            fill_value=0.0,
            kind='cubic'
        )
    
    def estimate_power(
        self,
        wind_speed: np.ndarray,
        air_density: float = 1.225,
        turbulence_intensity: float = 0.1
    ) -> np.ndarray:
        """
        Estimate power output with density correction
        
        Args:
            wind_speed: Wind speed at measurement height (m/s)
            air_density: Air density (kg/m³)
            turbulence_intensity: Turbulence intensity (0-1)
        
        Returns:
            Power output (kW)
        """
        try:
            # Apply wind shear to hub height
            wind_speed_hub = self._apply_wind_shear(wind_speed)
            
            # Apply turbulence effects
            wind_speed_effective = self._apply_turbulence(
                wind_speed_hub, turbulence_intensity
            )
            
            # Get theoretical power from curve
            theoretical_power = self.power_curve_func(wind_speed_effective)
            
            # Apply air density correction
            density_correction = air_density / 1.225
            corrected_power = theoretical_power * density_correction
            
            # Apply wake losses if in wind farm
            wake_loss = self._calculate_wake_loss(wind_speed_effective)
            final_power = corrected_power * (1 - wake_loss)
            
            return final_power
            
        except Exception as e:
            logger.error("Error estimating wind power", exc_info=e)
            raise
    
    def _apply_wind_shear(self, wind_speed: np.ndarray) -> np.ndarray:
        """
        Apply wind shear law to convert to hub height
        
        Args:
            wind_speed: Wind speed at measurement height (m/s)
        
        Returns:
            Wind speed at hub height (m/s)
        """
        measurement_height = 10  # Standard anemometer height (m)
        alpha = 0.14  # Hellmann exponent for open terrain
        
        return wind_speed * (self.specs.hub_height / measurement_height) ** alpha
    
    def _apply_turbulence(self, wind_speed: np.ndarray, turbulence_intensity: float) -> np.ndarray:
        """
        Apply turbulence effects to wind speed
        
        Args:
            wind_speed: Mean wind speed (m/s)
            turbulence_intensity: Turbulence intensity (0-1)
        
        Returns:
            Effective wind speed (m/s)
        """
        # Simple turbulence model: add random component
        turbulence_component = np.random.normal(0, wind_speed * turbulence_intensity, size=wind_speed.shape)
        effective_speed = wind_speed + turbulence_component
        
        return np.maximum(effective_speed, 0)  # Ensure non-negative
    
    def _calculate_wake_loss(self, wind_speed: np.ndarray) -> float:
        """
        Calculate wake losses (simplified)
        
        Args:
            wind_speed: Wind speed (m/s)
        
        Returns:
            Wake loss factor (0-1)
        """
        # Simplified wake loss model
        # In production, use Jensen wake model or similar
        return 0.05  # 5% wake loss (default)


class JensenWakeModel:
    """Jensen wake model for wind farm wake losses"""
    
    def __init__(self, layout: dict, turbine_specs: dict):
        """
        Initialize Jensen wake model
        
        Args:
            layout: Dict with turbine positions {'turbines': [{'id': str, 'x': float, 'y': float}]}
            turbine_specs: Turbine specifications
        """
        self.layout = layout
        self.specs = turbine_specs
        self.wake_decay_constant = 0.075  # Typical value for onshore
    
    def calculate_wake_losses(
        self,
        wind_speed: float,
        wind_direction: float
    ) -> dict:
        """
        Calculate wake losses using Jensen model
        
        Args:
            wind_speed: Free stream wind speed (m/s)
            wind_direction: Wind direction (degrees)
        
        Returns:
            Dict with wake losses per turbine
        """
        losses = {}
        
        for i, turbine in enumerate(self.layout['turbines']):
            # Find upstream turbines
            upstream = self._find_upstream_turbines(
                turbine, wind_direction
            )
            
            if upstream:
                # Calculate combined wake deficit
                deficit = self._calculate_wake_deficit(
                    turbine, upstream, wind_speed, wind_direction
                )
                losses[turbine['id']] = deficit
            else:
                losses[turbine['id']] = 0.0
        
        return losses
    
    def _find_upstream_turbines(self, turbine: dict, wind_direction: float) -> List[dict]:
        """Find turbines upstream of given turbine"""
        upstream = []
        wind_rad = np.radians(wind_direction)
        
        for other in self.layout['turbines']:
            if other['id'] == turbine['id']:
                continue
            
            # Calculate relative position
            dx = other['x'] - turbine['x']
            dy = other['y'] - turbine['y']
            
            # Check if upstream (simplified)
            if dx * np.cos(wind_rad) + dy * np.sin(wind_rad) < 0:
                upstream.append(other)
        
        return upstream
    
    def _calculate_wake_deficit(
        self,
        turbine: dict,
        upstream: List[dict],
        wind_speed: float,
        wind_direction: float
    ) -> float:
        """Calculate combined wake deficit"""
        # Simplified Jensen wake model
        rotor_radius = self.specs.get('rotor_diameter', 100) / 2
        
        total_deficit = 0.0
        for up_turbine in upstream:
            # Distance between turbines
            dx = turbine['x'] - up_turbine['x']
            dy = turbine['y'] - up_turbine['y']
            distance = np.sqrt(dx**2 + dy**2)
            
            # Wake radius at downstream turbine
            wake_radius = rotor_radius + self.wake_decay_constant * distance
            
            # Overlap area (simplified)
            if wake_radius > rotor_radius:
                overlap = min(1.0, (rotor_radius / wake_radius) ** 2)
                deficit = 0.2 * overlap  # Simplified deficit
                total_deficit += deficit
        
        return min(total_deficit, 0.3)  # Cap at 30% loss

