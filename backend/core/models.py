"""
Shared data models for Bria platform
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class SiteType(str, Enum):
    """Site type enumeration"""
    SOLAR = "solar"
    WIND = "wind"
    HYBRID = "hybrid"


class ForecastType(str, Enum):
    """Forecast type enumeration"""
    SOLAR = "solar"
    WIND = "wind"
    HYBRID = "hybrid"
    ENSEMBLE = "ensemble"


class AlertSeverity(str, Enum):
    """Alert severity enumeration"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WeatherData(BaseModel):
    """Weather data model"""
    timestamp: datetime
    station_id: str
    ghi: Optional[float] = Field(None, ge=0, le=1367, description="Global horizontal irradiance (W/m²)")
    dni: Optional[float] = Field(None, ge=0, le=1367, description="Direct normal irradiance (W/m²)")
    dhi: Optional[float] = Field(None, ge=0, le=1367, description="Diffuse horizontal irradiance (W/m²)")
    wind_speed: Optional[float] = Field(None, ge=0, le=50, description="Wind speed (m/s)")
    wind_direction: Optional[float] = Field(None, ge=0, le=360, description="Wind direction (degrees)")
    temperature: Optional[float] = Field(None, ge=-50, le=60, description="Ambient temperature (°C)")
    panel_temp: Optional[float] = Field(None, ge=-50, le=100, description="Panel temperature (°C)")
    humidity: Optional[float] = Field(None, ge=0, le=100, description="Relative humidity (%)")
    pressure: Optional[float] = Field(None, ge=800, le=1100, description="Air pressure (hPa)")
    precipitation: Optional[float] = Field(None, ge=0, description="Precipitation (mm)")
    cloud_cover: Optional[float] = Field(None, ge=0, le=100, description="Cloud cover (%)")
    quality_score: float = Field(1.0, ge=0, le=1.0, description="Data quality score")
    raw_value: Optional[Dict[str, Any]] = None
    
    @validator('timestamp')
    def validate_timestamp(cls, v):
        """Validate timestamp is not too old"""
        if (datetime.utcnow() - v.replace(tzinfo=None)).total_seconds() > 3600:
            raise ValueError("Timestamp is more than 1 hour old")
        return v


class ProductionData(BaseModel):
    """Production data model"""
    timestamp: datetime
    site_id: str
    power_kw: Optional[float] = Field(None, ge=0, description="Power output (kW)")
    energy_kwh: Optional[float] = Field(None, ge=0, description="Energy output (kWh)")
    availability: Optional[float] = Field(None, ge=0, le=100, description="Availability (%)")
    curtailed_kw: Optional[float] = Field(None, ge=0, description="Curtailed power (kW)")


class ForecastPoint(BaseModel):
    """Single forecast point"""
    timestamp: datetime
    predicted_power_kw: float
    p10_kw: Optional[float] = None
    p50_kw: Optional[float] = None
    p90_kw: Optional[float] = None
    confidence: Optional[float] = Field(None, ge=0, le=1)


class ForecastResult(BaseModel):
    """Complete forecast result"""
    site_id: str
    forecast_time: datetime
    horizon_hours: int
    forecast_type: ForecastType
    values: List[ForecastPoint]
    model_version: Optional[str] = None
    model_weights: Optional[Dict[str, float]] = None


class CreateSiteRequest(BaseModel):
    """Request model for creating a new site"""
    name: str
    type: SiteType
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    capacity_mw: float = Field(..., gt=0)
    timezone: str = "UTC"
    pv_params: Optional[Dict[str, Any]] = None
    turbine_params: Optional[Dict[str, Any]] = None


class Site(BaseModel):
    """Site model (full site with id and tenant_id)"""
    id: str
    name: str
    type: SiteType
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    capacity_mw: float = Field(..., gt=0)
    timezone: str = "UTC"
    tenant_id: str
    pv_params: Optional[Dict[str, Any]] = None
    turbine_params: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UpdateSiteRequest(BaseModel):
    """Request model for updating site details"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[SiteType] = None
    capacity_mw: Optional[float] = Field(None, gt=0, le=1000)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    timezone: Optional[str] = None
    pv_params: Optional[Dict[str, Any]] = None
    turbine_params: Optional[Dict[str, Any]] = None


class AlertCondition(BaseModel):
    """Alert condition model"""
    type: str  # threshold, anomaly, forecast_error, data_gap
    operator: Optional[str] = None  # greater_than, less_than, equals
    threshold: Optional[float] = None
    metric: Optional[str] = None
    window_minutes: Optional[int] = None


class Alert(BaseModel):
    """Alert model"""
    id: Optional[str] = None
    site_id: str
    name: str
    description: Optional[str] = None
    condition: AlertCondition
    severity: AlertSeverity
    enabled: bool = True
    last_triggered: Optional[datetime] = None
    created_at: Optional[datetime] = None


class ForecastAccuracyMetrics(BaseModel):
    """Forecast accuracy metrics model"""
    site_id: str
    period_days: int
    horizon: Optional[str] = None
    data_points: int
    mae: Optional[float] = None  # Mean Absolute Error (kW)
    rmse: Optional[float] = None  # Root Mean Square Error (kW)
    mape: Optional[float] = None  # Mean Absolute Percentage Error (%)
    bias: Optional[float] = None  # Bias (kW) - positive = over-forecast
    accuracy_score: Optional[float] = None  # 0-100, higher is better
    recent_7d: Optional[Dict[str, Optional[float]]] = None
    accuracy_trend: Optional[str] = None  # "improving", "degrading", "stable"


class CurrentWeather(BaseModel):
    """Current weather data model"""
    site_id: str
    timestamp: datetime
    temperature: Optional[float] = None
    feels_like: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    wind_gust: Optional[float] = None
    cloud_cover: Optional[float] = None
    precipitation: Optional[float] = None
    ghi_estimated: Optional[float] = None
    visibility: Optional[float] = None
    weather_main: Optional[str] = None
    weather_description: Optional[str] = None
    weather_icon: Optional[str] = None
    uv_index: Optional[float] = None


class WeatherForecastPoint(BaseModel):
    """Single weather forecast point"""
    timestamp: datetime
    temperature: Optional[float] = None
    feels_like: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    wind_gust: Optional[float] = None
    cloud_cover: Optional[float] = None
    precipitation: Optional[float] = None
    ghi_estimated: Optional[float] = None
    weather_main: Optional[str] = None
    weather_description: Optional[str] = None
    weather_icon: Optional[str] = None


class ForecastAdjustment(BaseModel):
    """Forecast adjustment model"""
    timestamp: datetime
    power_kw: float
    adjustment_type: str = "override"  # override, percentage, offset
    original_power_kw: Optional[float] = None


class ForecastScenario(BaseModel):
    """Forecast scenario model"""
    scenario_name: str  # optimistic, pessimistic, realistic, custom
    adjustment_percentage: float
    time_range: Optional[Dict[str, datetime]] = None
    notes: Optional[str] = None


class ForecastInsight(BaseModel):
    """Forecast insight model"""
    type: str
    severity: str  # low, medium, high
    message: str
    recommendation: Optional[str] = None
    timestamp: Optional[datetime] = None


class ForecastAnomaly(BaseModel):
    """Forecast anomaly model"""
    type: str
    severity: str
    timestamp: Optional[datetime] = None
    change_percentage: Optional[float] = None
    previous_power_kw: Optional[float] = None
    current_power_kw: Optional[float] = None
    message: str


class ForecastRecommendation(BaseModel):
    """Forecast recommendation model"""
    type: str
    priority: str  # low, medium, high
    title: str
    message: str
    action: str

