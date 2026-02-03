"""
Ensemble forecasting combining physics, ML, and persistence models
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.models import ForecastPoint, ForecastType
from core.logging import get_logger
from .physics_model import SolarPhysicsModel
from .ml_model import SolarMLModel

logger = get_logger('solar-ensemble')


@dataclass
class ForecastResult:
    """Forecast result data class"""
    timestamp: np.ndarray
    point_forecast: np.ndarray
    p10: np.ndarray
    p50: np.ndarray
    p90: np.ndarray
    confidence: np.ndarray
    model_weights: Dict[str, float]


class PersistenceModel:
    """Simple persistence model (uses recent actuals)"""
    
    def __init__(self):
        self.name = "persistence"
    
    def forecast(
        self,
        historical_data: pd.DataFrame,
        horizon_hours: int = 24
    ) -> np.ndarray:
        """
        Generate persistence forecast
        
        Args:
            historical_data: Historical power data with 'power_kw' and 'timestamp'
            horizon_hours: Forecast horizon
        
        Returns:
            Forecast array
        """
        if historical_data.empty or 'power_kw' not in historical_data.columns:
            # Return zeros if no data
            return np.zeros(horizon_hours)
        
        # Use most recent value
        last_value = historical_data['power_kw'].iloc[-1]
        
        # Apply simple decay
        decay_factor = 0.95
        forecast = np.array([last_value * (decay_factor ** i) for i in range(horizon_hours)])
        
        return forecast


class SolarEnsembleForecaster:
    """Ensemble forecaster combining multiple models"""
    
    def __init__(self, models: Dict):
        """
        Initialize ensemble forecaster
        
        Args:
            models: Dict with 'physics', 'ml', 'persistence' models
        """
        self.physics_model = models.get('physics')
        self.ml_model = models.get('ml')
        self.persistence_model = models.get('persistence', PersistenceModel())
        
        # Default weights
        self.base_weights = {
            'physics': 0.4,
            'ml': 0.5,
            'persistence': 0.1
        }
        
        logger.info("Solar ensemble forecaster initialized")
    
    def _calculate_ensemble_weights(
        self,
        historical_data: pd.DataFrame,
        lookback_hours: int = 168  # 1 week
    ) -> Dict[str, float]:
        """
        Calculate dynamic ensemble weights based on recent performance
        
        Args:
            historical_data: Historical data with actuals and forecasts
            lookback_hours: Hours to look back for performance calculation
        
        Returns:
            Dict with model weights
        """
        # For now, use base weights
        # In production, calculate based on recent MAE/RMSE
        weights = self.base_weights.copy()
        
        # Normalize weights
        total = sum(weights.values())
        weights = {k: v / total for k, v in weights.items()}
        
        return weights
    
    def _weighted_combination(
        self,
        forecasts: List[Dict[str, np.ndarray]],
        weights: Dict[str, float]
    ) -> Dict[str, np.ndarray]:
        """
        Combine forecasts using weighted average
        
        Args:
            forecasts: List of forecast dicts with 'power' key
            weights: Model weights
        
        Returns:
            Combined forecast dict
        """
        model_names = ['physics', 'ml', 'persistence']
        
        # Extract power forecasts
        power_forecasts = []
        for i, name in enumerate(model_names):
            if i < len(forecasts) and forecasts[i] is not None:
                if isinstance(forecasts[i], dict):
                    power = forecasts[i].get('power_kw', forecasts[i].get('power', np.zeros(24)))
                else:
                    power = forecasts[i]
                power_forecasts.append(power)
            else:
                power_forecasts.append(np.zeros(24))
        
        # Weighted combination
        combined_power = np.zeros_like(power_forecasts[0])
        for i, name in enumerate(model_names):
            if name in weights:
                combined_power += weights[name] * power_forecasts[i]
        
        return {
            'power': combined_power,
            'confidence': self._calculate_confidence(power_forecasts, weights)
        }
    
    def _calculate_confidence(
        self,
        forecasts: List[np.ndarray],
        weights: Dict[str, float]
    ) -> np.ndarray:
        """
        Calculate forecast confidence based on model agreement
        
        Args:
            forecasts: List of forecast arrays
            weights: Model weights
        
        Returns:
            Confidence array (0-1)
        """
        if len(forecasts) < 2:
            return np.ones(len(forecasts[0])) * 0.7
        
        # Calculate coefficient of variation
        stacked = np.stack(forecasts)
        mean = np.mean(stacked, axis=0)
        std = np.std(stacked, axis=0)
        
        # Avoid division by zero
        cv = np.where(mean > 0, std / mean, 0.5)
        
        # Convert to confidence (lower CV = higher confidence)
        confidence = 1 / (1 + cv)
        
        return np.clip(confidence, 0.1, 1.0)
    
    def _calculate_prediction_intervals(
        self,
        combined: Dict[str, np.ndarray],
        individual_forecasts: List
    ) -> Dict[str, np.ndarray]:
        """
        Calculate prediction intervals (P10, P50, P90)
        
        Args:
            combined: Combined forecast dict
            individual_forecasts: List of individual model forecasts
        
        Returns:
            Dict with 'p10', 'p50', 'p90'
        """
        point_forecast = combined['power']
        
        # Calculate uncertainty from model spread
        if len(individual_forecasts) > 1:
            stacked = np.stack([
                f.get('power_kw', f.get('power', point_forecast)) 
                if isinstance(f, dict) else f
                for f in individual_forecasts if f is not None
            ])
            
            std = np.std(stacked, axis=0)
        else:
            # Default uncertainty: 20% of forecast
            std = point_forecast * 0.2
        
        # Calculate quantiles
        p10 = point_forecast - 1.28 * std
        p50 = point_forecast
        p90 = point_forecast + 1.28 * std
        
        # Ensure non-negative
        p10 = np.maximum(p10, 0)
        p50 = np.maximum(p50, 0)
        p90 = np.maximum(p90, 0)
        
        return {
            'p10': p10,
            'p50': p50,
            'p90': p90
        }
    
    def forecast(
        self,
        weather_data: Dict,
        historical_data: pd.DataFrame,
        horizon_hours: int = 24
    ) -> ForecastResult:
        """
        Generate ensemble forecast
        
        Args:
            weather_data: Weather forecast data
            historical_data: Historical production data
            horizon_hours: Forecast horizon
        
        Returns:
            ForecastResult object
        """
        try:
            forecasts = []
            
            # Physics model forecast
            if self.physics_model:
                try:
                    physics_fc = self.physics_model.forecast(weather_data, horizon_hours)
                    forecasts.append(physics_fc)
                except Exception as e:
                    logger.warning("Physics model forecast failed", exc_info=e)
                    forecasts.append(None)
            else:
                forecasts.append(None)
            
            # ML model forecast
            if self.ml_model and self.ml_model.is_trained:
                try:
                    # Prepare features for ML model
                    ml_input = self._prepare_ml_input(weather_data, horizon_hours)
                    ml_fc = self.ml_model.predict_with_intervals(ml_input)
                    forecasts.append({
                        'power_kw': ml_fc['predictions'],
                        'p10': ml_fc.get('p10', ml_fc['predictions']),
                        'p90': ml_fc.get('p90', ml_fc['predictions'])
                    })
                except Exception as e:
                    logger.warning("ML model forecast failed", exc_info=e)
                    forecasts.append(None)
            else:
                forecasts.append(None)
            
            # Persistence model forecast
            try:
                persistence_fc = self.persistence_model.forecast(historical_data, horizon_hours)
                forecasts.append(persistence_fc)
            except Exception as e:
                logger.warning("Persistence model forecast failed", exc_info=e)
                forecasts.append(None)
            
            # Calculate dynamic weights
            weights = self._calculate_ensemble_weights(historical_data)
            
            # Combine forecasts
            combined = self._weighted_combination(forecasts, weights)
            
            # Calculate prediction intervals
            intervals = self._calculate_prediction_intervals(combined, forecasts)
            
            # Generate timestamps
            start_time = datetime.utcnow()
            timestamps = np.array([
                start_time + timedelta(hours=i) for i in range(horizon_hours)
            ])
            
            return ForecastResult(
                timestamp=timestamps,
                point_forecast=combined['power'],
                p10=intervals['p10'],
                p50=intervals['p50'],
                p90=intervals['p90'],
                confidence=combined['confidence'],
                model_weights=weights
            )
            
        except Exception as e:
            logger.error("Error generating ensemble forecast", exc_info=e)
            raise
    
    def _prepare_ml_input(
        self,
        weather_data: Dict,
        horizon_hours: int
    ) -> pd.DataFrame:
        """Prepare input DataFrame for ML model"""
        start_time = datetime.utcnow()
        times = pd.date_range(
            start=start_time,
            periods=horizon_hours,
            freq='1H'
        )
        
        df = pd.DataFrame({
            'timestamp': times,
            'ghi': weather_data.get('ghi', [0] * horizon_hours),
            'dni': weather_data.get('dni', [0] * horizon_hours),
            'dhi': weather_data.get('dhi', [0] * horizon_hours),
            'temp': weather_data.get('temp', [20] * horizon_hours),
            'humidity': weather_data.get('humidity', [50] * horizon_hours),
            'wind_speed': weather_data.get('wind_speed', [5] * horizon_hours),
            'cloud_cover': weather_data.get('cloud_cover', [0] * horizon_hours)
        })
        
        return df

