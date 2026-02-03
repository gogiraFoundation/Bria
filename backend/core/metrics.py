"""
Prometheus metrics for Bria platform
"""
from prometheus_client import Counter, Histogram, Gauge, Summary
from functools import wraps
import time
from typing import Callable, Any


# HTTP Metrics
REQUEST_COUNT = Counter(
    'bria_http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_LATENCY = Histogram(
    'bria_http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

# Forecasting Metrics
FORECAST_ACCURACY = Gauge(
    'bria_forecast_accuracy_percent',
    'Forecast accuracy percentage',
    ['site_id', 'model_type', 'horizon']
)

FORECAST_COMPUTATION_TIME = Histogram(
    'bria_forecast_computation_seconds',
    'Time to compute forecast',
    ['site_id', 'model_type', 'horizon'],
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 300.0]
)

FORECAST_REQUESTS = Counter(
    'bria_forecast_requests_total',
    'Total forecast requests',
    ['site_id', 'model_type']
)

# Data Quality Metrics
DATA_QUALITY = Gauge(
    'bria_data_quality_score',
    'Data quality score (0-1)',
    ['station_id', 'metric']
)

DATA_INGESTION_COUNT = Counter(
    'bria_data_ingestion_total',
    'Total data points ingested',
    ['source', 'type']
)

DATA_INGESTION_ERRORS = Counter(
    'bria_data_ingestion_errors_total',
    'Total data ingestion errors',
    ['source', 'error_type']
)

# System Metrics
ACTIVE_CONNECTIONS = Gauge(
    'bria_active_connections',
    'Number of active connections',
    ['type']
)

DATABASE_CONNECTIONS = Gauge(
    'bria_database_connections',
    'Number of database connections',
    ['state']
)

CACHE_HIT_RATE = Gauge(
    'bria_cache_hit_rate',
    'Cache hit rate (0-1)',
    ['cache_type']
)

# Alert Metrics
ALERT_TRIGGERED = Counter(
    'bria_alerts_triggered_total',
    'Total alerts triggered',
    ['site_id', 'severity']
)

ALERT_RESOLVED = Counter(
    'bria_alerts_resolved_total',
    'Total alerts resolved',
    ['site_id', 'severity']
)


def monitor_request(endpoint_name: str):
    """Decorator to monitor API requests"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            start_time = time.time()
            method = kwargs.get('method', 'GET')
            status = '200'
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                status = '500'
                raise
            finally:
                duration = time.time() - start_time
                REQUEST_LATENCY.labels(
                    method=method,
                    endpoint=endpoint_name
                ).observe(duration)
                REQUEST_COUNT.labels(
                    method=method,
                    endpoint=endpoint_name,
                    status=status
                ).inc()
        
        return wrapper
    return decorator


def record_forecast_accuracy(site_id: str, model_type: str, horizon: str, accuracy: float):
    """Record forecast accuracy metric"""
    FORECAST_ACCURACY.labels(
        site_id=site_id,
        model_type=model_type,
        horizon=horizon
    ).set(accuracy)


def record_data_quality(station_id: str, metric: str, score: float):
    """Record data quality metric"""
    DATA_QUALITY.labels(
        station_id=station_id,
        metric=metric
    ).set(score)

