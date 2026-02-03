"""
Machine learning models for solar forecasting
"""
import numpy as np
import pandas as pd
from typing import Tuple, List, Optional, Dict
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.logging import get_logger

logger = get_logger('solar-ml-model')


class SolarMLModel:
    """Machine learning model for solar power forecasting"""
    
    def __init__(self, model_type: str = 'xgb'):
        """
        Initialize ML model
        
        Args:
            model_type: 'xgb' for XGBoost, 'rf' for Random Forest
        """
        self.model_type = model_type
        self.model = self._initialize_model()
        self.scaler = StandardScaler()
        self.is_trained = False
        
        self.feature_names = [
            'ghi', 'dni', 'dhi', 'temp', 'humidity', 'wind_speed',
            'cloud_cover', 'hour_of_day', 'day_of_year', 'month',
            'clear_sky_ghi', 'poa_global', 'solar_zenith', 'solar_azimuth'
        ]
        
        logger.info(f"Solar ML model initialized", model_type=model_type)
    
    def _initialize_model(self):
        """Initialize the ML model"""
        if self.model_type == 'xgb':
            return xgb.XGBRegressor(
                n_estimators=100,
                max_depth=6,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                n_jobs=-1
            )
        elif self.model_type == 'rf':
            return RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                min_samples_split=5,
                min_samples_leaf=2,
                random_state=42,
                n_jobs=-1
            )
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")
    
    def _extract_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract features from raw data"""
        features = pd.DataFrame()
        
        # Direct features
        for col in ['ghi', 'dni', 'dhi', 'temp', 'humidity', 'wind_speed', 'cloud_cover']:
            if col in df.columns:
                features[col] = df[col]
            else:
                features[col] = 0
        
        # Time-based features
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            features['hour_of_day'] = df['timestamp'].dt.hour
            features['day_of_year'] = df['timestamp'].dt.dayofyear
            features['month'] = df['timestamp'].dt.month
        else:
            features['hour_of_day'] = 12
            features['day_of_year'] = 180
            features['month'] = 6
        
        # Solar position features (if not provided, use defaults)
        if 'solar_zenith' in df.columns:
            features['solar_zenith'] = df['solar_zenith']
        else:
            features['solar_zenith'] = 30  # Default
        
        if 'solar_azimuth' in df.columns:
            features['solar_azimuth'] = df['solar_azimuth']
        else:
            features['solar_azimuth'] = 180  # Default
        
        # Clear sky GHI (simplified)
        if 'clear_sky_ghi' in df.columns:
            features['clear_sky_ghi'] = df['clear_sky_ghi']
        else:
            # Simple clear sky model
            features['clear_sky_ghi'] = features['ghi'] * 1.2  # Rough estimate
        
        # POA global (if not provided, estimate from GHI)
        if 'poa_global' in df.columns:
            features['poa_global'] = df['poa_global']
        else:
            # Simple estimate
            features['poa_global'] = features['ghi'] * 1.1
        
        # Ensure all required features are present
        for feat in self.feature_names:
            if feat not in features.columns:
                features[feat] = 0
        
        return features[self.feature_names]
    
    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None
    ) -> Dict[str, float]:
        """
        Train the model
        
        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features (optional)
            y_val: Validation targets (optional)
        
        Returns:
            Dict with training metrics
        """
        try:
            # Extract features
            X_train_features = self._extract_features(X_train)
            
            # Scale features
            X_train_scaled = self.scaler.fit_transform(X_train_features)
            
            # Train model
            if self.model_type == 'xgb' and X_val is not None:
                X_val_features = self._extract_features(X_val)
                X_val_scaled = self.scaler.transform(X_val_features)
                
                self.model.fit(
                    X_train_scaled,
                    y_train,
                    eval_set=[(X_val_scaled, y_val)],
                    early_stopping_rounds=10,
                    verbose=False
                )
            else:
                self.model.fit(X_train_scaled, y_train)
            
            # Calculate metrics
            train_pred = self.model.predict(X_train_scaled)
            train_mae = np.mean(np.abs(train_pred - y_train))
            train_rmse = np.sqrt(np.mean((train_pred - y_train) ** 2))
            
            metrics = {
                'train_mae': float(train_mae),
                'train_rmse': float(train_rmse)
            }
            
            if X_val is not None:
                val_pred = self.predict(X_val)
                val_mae = np.mean(np.abs(val_pred - y_val))
                val_rmse = np.sqrt(np.mean((val_pred - y_val) ** 2))
                
                metrics.update({
                    'val_mae': float(val_mae),
                    'val_rmse': float(val_rmse)
                })
            
            self.is_trained = True
            
            logger.info("Model training completed", metrics=metrics)
            
            return metrics
            
        except Exception as e:
            logger.error("Error training model", exc_info=e)
            raise
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Generate predictions
        
        Args:
            X: Input features
        
        Returns:
            Predictions array
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        try:
            # Extract features
            X_features = self._extract_features(X)
            
            # Scale features
            X_scaled = self.scaler.transform(X_features)
            
            # Generate predictions
            predictions = self.model.predict(X_scaled)
            
            return predictions
            
        except Exception as e:
            logger.error("Error generating predictions", exc_info=e)
            raise
    
    def predict_with_intervals(
        self,
        X: pd.DataFrame,
        quantiles: List[float] = [0.1, 0.5, 0.9]
    ) -> Dict[str, np.ndarray]:
        """
        Generate predictions with confidence intervals
        
        Args:
            X: Input features
            quantiles: Quantiles for intervals (default: P10, P50, P90)
        
        Returns:
            Dict with 'predictions', 'p10', 'p50', 'p90'
        """
        predictions = self.predict(X)
        
        # For now, use simple heuristic for intervals
        # In production, use quantile regression or prediction intervals
        std = np.std(predictions) * 0.2  # Assume 20% uncertainty
        
        result = {
            'predictions': predictions,
            'p50': predictions
        }
        
        if 0.1 in quantiles:
            result['p10'] = predictions - 1.28 * std
        if 0.9 in quantiles:
            result['p90'] = predictions + 1.28 * std
        
        return result
    
    def calculate_feature_importance(self) -> pd.DataFrame:
        """Calculate and return feature importance"""
        if not self.is_trained:
            raise ValueError("Model must be trained before calculating importance")
        
        if hasattr(self.model, 'feature_importances_'):
            importance = self.model.feature_importances_
            return pd.DataFrame({
                'feature': self.feature_names,
                'importance': importance
            }).sort_values('importance', ascending=False)
        else:
            logger.warning("Model does not support feature importance")
            return pd.DataFrame()
    
    def save(self, filepath: str):
        """Save model to disk"""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump({
            'model': self.model,
            'scaler': self.scaler,
            'model_type': self.model_type,
            'feature_names': self.feature_names,
            'is_trained': self.is_trained
        }, filepath)
        logger.info("Model saved", filepath=filepath)
    
    def load(self, filepath: str):
        """Load model from disk"""
        data = joblib.load(filepath)
        self.model = data['model']
        self.scaler = data['scaler']
        self.model_type = data['model_type']
        self.feature_names = data['feature_names']
        self.is_trained = data['is_trained']
        logger.info("Model loaded", filepath=filepath)

