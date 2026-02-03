"""
OpenWeather API integration for weather data
"""
import aiohttp
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import sys
from pathlib import Path
import pytz
import json

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.config import get_settings
from core.logging import get_logger
from core.models import WeatherData

# Import rate limiters (optional - will work without them)
try:
    from core.rate_limiter import openweather_rate_limiter, openweather_daily_limiter
except ImportError:
    # Create dummy rate limiters if not available
    class DummyRateLimiter:
        async def acquire(self, key): return True
        async def wait_if_needed(self, key): pass
    openweather_rate_limiter = DummyRateLimiter()
    openweather_daily_limiter = DummyRateLimiter()

logger = get_logger('openweather-service')
settings = get_settings()


class OpenWeatherClient:
    """Client for OpenWeather API with rate limiting and caching"""
    
    def __init__(self, cache_manager=None, db_pool=None):
        self.api_key = settings.OPENWEATHER_API_KEY
        self.api_url = settings.OPENWEATHER_API_URL  # Forecast API (2.5)
        self.current_url = getattr(settings, 'OPENWEATHER_CURRENT_URL', 'https://api.openweathermap.org/data/2.5/weather')
        self.history_url = "https://history.openweathermap.org/data/2.5/history/city"
        self.cache_manager = cache_manager
        self.db_pool = db_pool  # Database connection pool for storing data
        if not self.api_key:
            logger.warning("OpenWeather API key not configured, returning None")
    
    async def get_current_weather(
        self,
        latitude: float,
        longitude: float,
        site_id: Optional[str] = None
    ) -> Optional[Dict]:
        """Get current weather data for a location using free tier API"""
        if not self.api_key:
            logger.warning("OpenWeather API key not configured, returning None")
            return None
        
        try:
            # Use free tier 2.5 API for current weather
            url = self.current_url
            params = {
                'lat': latitude,
                'lon': longitude,
                'appid': self.api_key,
                'units': 'metric'
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status == 200:
                        data = await response.json()
                        # Store in dedicated OpenWeather storage (async, don't wait)
                        if self.db_pool:
                            asyncio.create_task(self._store_openweather_data(
                                site_id=site_id,
                                latitude=latitude,
                                longitude=longitude,
                                api_endpoint='current',
                                request_type='current',
                                response_data=data,
                                data_timestamp=datetime.utcfromtimestamp(data.get('dt', datetime.utcnow().timestamp()))
                            ))
                        return data
                    else:
                        error_text = await response.text()
                        logger.error(
                            f"OpenWeather API error: {response.status} - {error_text}",
                            status=response.status
                        )
                        return None
        except Exception as e:
            logger.error("Error fetching weather from OpenWeather", exc_info=e)
            return None
    
    async def get_forecast(
        self,
        latitude: float,
        longitude: float,
        hours: int = 48,
        site_id: Optional[str] = None
    ) -> Optional[List[Dict]]:
        """Get weather forecast for a location using free tier 2.5 API"""
        if not self.api_key:
            logger.warning("OpenWeather API key not configured, returning None")
            return None
        
        # Check cache first
        cache_key = f"openweather:forecast:{latitude}:{longitude}:{hours}"
        if self.cache_manager:
            cached = await self.cache_manager.get(cache_key)
            if cached:
                logger.info("Returning cached forecast data", cache_key=cache_key)
                return cached
        
        # Rate limiting
        rate_limit_key = "openweather:api"
        if not await openweather_rate_limiter.acquire(rate_limit_key):
            logger.warning("OpenWeather API rate limit exceeded, waiting...")
            await openweather_rate_limiter.wait_if_needed(rate_limit_key)
        
        if not await openweather_daily_limiter.acquire(rate_limit_key):
            logger.error("OpenWeather daily rate limit exceeded")
            return None
        
        try:
            # Use free tier 2.5 API - returns 3-hour intervals, max 5 days (40 intervals)
            url = self.api_url  # Should be https://api.openweathermap.org/data/2.5/forecast
            params = {
                'lat': latitude,
                'lon': longitude,
                'appid': self.api_key,
                'units': 'metric',
                'cnt': min(40, (hours + 2) // 3)  # Request enough 3-hour intervals
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status == 200:
                        data = await response.json()
                        # 2.5 API returns data in 'list' array (3-hour intervals)
                        forecast_list = data.get('list', [])
                        
                        # Cache for 1 hour (forecasts update every 3 hours)
                        if self.cache_manager and forecast_list:
                            await self.cache_manager.set(cache_key, forecast_list, ttl_seconds=3600)
                        
                        # Return only the requested number of intervals
                        return forecast_list[:min(len(forecast_list), (hours + 2) // 3)]
                    else:
                        error_text = await response.text()
                        logger.error(
                            f"OpenWeather Forecast API error: {response.status} - {error_text}",
                            status=response.status
                        )
                        return None
        except Exception as e:
            logger.error("Error fetching forecast from OpenWeather", exc_info=e)
            return None
    
    async def get_historical_weather(
        self,
        latitude: float,
        longitude: float,
        start_time: datetime,
        end_time: Optional[datetime] = None,
        hours: Optional[int] = None,
        site_id: Optional[str] = None
    ) -> Optional[List[Dict]]:
        """Get historical weather data using OpenWeather Historical API with caching and rate limiting"""
        if not self.api_key:
            logger.warning("OpenWeather API key not configured, returning None")
            return None
        
        # Check cache first
        cache_key = f"openweather:history:{latitude}:{longitude}:{int(start_time.timestamp())}"
        if self.cache_manager:
            cached = await self.cache_manager.get(cache_key)
            if cached:
                logger.info("Returning cached historical weather data", cache_key=cache_key)
                return cached
        
        # Rate limiting
        rate_limit_key = "openweather:api"
        if not await openweather_rate_limiter.acquire(rate_limit_key):
            logger.warning("OpenWeather API rate limit exceeded, waiting...")
            await openweather_rate_limiter.wait_if_needed(rate_limit_key)
        
        if not await openweather_daily_limiter.acquire(rate_limit_key):
            logger.error("OpenWeather daily rate limit exceeded")
            return None
        
        try:
            # Convert datetime to unix timestamp (UTC)
            # Ensure start_time is timezone-aware (UTC)
            if start_time.tzinfo is None:
                start_time = pytz.utc.localize(start_time)
            
            # Historical API requires start time to be in the PAST
            now = datetime.utcnow().replace(tzinfo=pytz.utc)
            if start_time > now:
                logger.warning(
                    "Historical API requires start time in the past, adjusting to 24 hours ago",
                    requested_start=start_time.isoformat(),
                    current_time=now.isoformat()
                )
                start_time = now - timedelta(hours=24)
            
            start_timestamp = int(start_time.timestamp())
            
            params = {
                'lat': latitude,
                'lon': longitude,
                'type': 'hour',  # Required parameter
                'start': start_timestamp,
                'appid': self.api_key,
                'units': 'metric'  # Use metric units (Celsius, m/s)
            }
            
            if end_time:
                # Ensure end_time is timezone-aware (UTC)
                if end_time.tzinfo is None:
                    end_time = pytz.utc.localize(end_time)
                # End time should not be in the future (historical data only)
                if end_time > now:
                    end_time = now
                params['end'] = int(end_time.timestamp())
            elif hours:
                # Use cnt parameter (number of hourly timestamps)
                # Per documentation: Professional/Expert plans max 1 week (168 hours) per request
                params['cnt'] = min(hours, 168)  # Max 1 week (168 hours) per request
            else:
                # Default to 24 hours if neither end nor cnt specified
                params['cnt'] = 24
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.history_url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        # Check response format
                        if 'cod' in data and data['cod'] != '200':
                            error_msg = data.get('message', 'Unknown error')
                            logger.error(
                                f"OpenWeather Historical API error: {data['cod']} - {error_msg}",
                                cod=data['cod'],
                                message=error_msg
                            )
                            return None
                        
                        # Historical API returns data in 'list' field (hourly data points)
                        result = data.get('list', [])
                        
                        if result:
                            logger.info(
                                f"Received {len(result)} historical data points from OpenWeather",
                                lat=latitude,
                                lon=longitude,
                                start=start_timestamp,
                                cnt=len(result)
                            )
                            
                            # Cache the result for 1 hour (historical data doesn't change)
                            if self.cache_manager:
                                await self.cache_manager.set(cache_key, result, ttl_seconds=3600)
                            
                            # Store each historical data point in dedicated storage (async, don't wait)
                            if self.db_pool and result:
                                for hist_item in result:
                                    asyncio.create_task(self._store_openweather_data(
                                        site_id=site_id,
                                        latitude=latitude,
                                        longitude=longitude,
                                        api_endpoint='historical',
                                        request_type=f'historical_{hours or 24}h',
                                        response_data=hist_item,
                                        data_timestamp=datetime.utcfromtimestamp(hist_item.get('dt', datetime.utcnow().timestamp()))
                                    ))
                        else:
                            logger.warning(
                                "OpenWeather Historical API returned empty list",
                                lat=latitude,
                                lon=longitude,
                                start=start_timestamp
                            )
                        
                        return result
                    else:
                        error_text = await response.text()
                        try:
                            error_json = await response.json()
                            error_msg = error_json.get('message', error_text)
                            error_cod = error_json.get('cod', response.status)
                        except:
                            error_msg = error_text
                            error_cod = response.status
                        
                        logger.error(
                            f"OpenWeather Historical API error: {error_cod} - {error_msg}",
                            status=response.status,
                            cod=error_cod
                        )
                        return None
        except Exception as e:
            logger.error("Error fetching historical weather from OpenWeather", exc_info=e)
            return None
    
    def convert_to_weather_data(
        self,
        openweather_data: Dict,
        station_id: str,
        latitude: float,
        longitude: float
    ) -> WeatherData:
        """Convert OpenWeather API response to WeatherData model"""
        # Extract timestamp
        timestamp = datetime.utcfromtimestamp(openweather_data.get('dt', 0))
        
        # Extract main weather data
        main = openweather_data.get('main', {})
        weather = openweather_data.get('weather', [{}])[0]
        wind = openweather_data.get('wind', {})
        clouds = openweather_data.get('clouds', {})
        
        # Calculate GHI from cloud cover and solar position (simplified)
        # This is a rough estimate - in production, use proper solar irradiance models
        cloud_cover = clouds.get('all', 0)  # Percentage
        # Estimate GHI based on cloud cover (simplified model)
        # Clear sky GHI ~ 1000 W/m², reduced by cloud cover
        estimated_ghi = max(0, 1000 * (1 - cloud_cover / 100))
        
        return WeatherData(
            timestamp=timestamp,
            station_id=station_id,
            ghi=estimated_ghi,
            wind_speed=wind.get('speed'),
            wind_direction=wind.get('deg'),
            temperature=main.get('temp'),
            humidity=main.get('humidity'),
            pressure=main.get('pressure'),
            cloud_cover=cloud_cover,
            precipitation=openweather_data.get('rain', {}).get('3h', 0) or 
                         openweather_data.get('snow', {}).get('3h', 0),
            quality_score=1.0,
            raw_value=openweather_data
        )
    
    async def _store_openweather_data(
        self,
        site_id: Optional[str],
        latitude: float,
        longitude: float,
        api_endpoint: str,
        request_type: str,
        response_data: Dict,
        data_timestamp: Optional[datetime] = None,
        metadata: Optional[Dict] = None
    ):
        """Store OpenWeather API response in dedicated storage table"""
        if not self.db_pool:
            return
        
        try:
            # Extract common fields from response
            main = response_data.get('main', {})
            wind = response_data.get('wind', {})
            clouds = response_data.get('clouds', {})
            rain = response_data.get('rain', {})
            snow = response_data.get('snow', {})
            
            temperature = main.get('temp')
            humidity = main.get('humidity')
            pressure = main.get('pressure')
            wind_speed = wind.get('speed')
            wind_direction = wind.get('deg')
            cloud_cover = clouds.get('all', 0)
            precipitation = rain.get('3h', 0) or rain.get('1h', 0) or snow.get('3h', 0) or snow.get('1h', 0) or 0
            
            # Estimate GHI from cloud cover
            estimated_ghi = max(0, 1000 * (1 - cloud_cover / 100)) if cloud_cover else None
            
            # Use data timestamp from response or current time
            if data_timestamp is None:
                if 'dt' in response_data:
                    data_timestamp = datetime.utcfromtimestamp(response_data['dt'])
                else:
                    data_timestamp = datetime.utcnow()
            
            # Ensure timezone-aware
            if data_timestamp.tzinfo is None:
                data_timestamp = pytz.utc.localize(data_timestamp)
            
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO openweather_data 
                    (time, site_id, latitude, longitude, api_endpoint, request_type, response_data,
                     temperature, humidity, wind_speed, wind_direction, pressure, cloud_cover,
                     precipitation, ghi_estimated, data_timestamp, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    ON CONFLICT DO NOTHING
                    """,
                    datetime.utcnow().replace(tzinfo=pytz.utc),  # time (when we stored it)
                    site_id,  # site_id (can be NULL for general queries)
                    latitude,
                    longitude,
                    api_endpoint,
                    request_type,
                    json.dumps(response_data),  # response_data as JSONB
                    temperature,
                    humidity,
                    wind_speed,
                    wind_direction,
                    pressure,
                    cloud_cover,
                    precipitation,
                    estimated_ghi,
                    data_timestamp,  # data_timestamp (from weather data)
                    json.dumps(metadata) if metadata else None
                )
                logger.debug(
                    "Stored OpenWeather API response in dedicated storage",
                    api_endpoint=api_endpoint,
                    request_type=request_type,
                    latitude=latitude,
                    longitude=longitude
                )
        except Exception as e:
            # Don't fail the API call if storage fails
            logger.warning(f"Failed to store OpenWeather data in dedicated storage: {e}", exc_info=True)


# Global client instance
openweather_client = OpenWeatherClient()

