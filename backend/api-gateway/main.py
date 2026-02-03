"""
Bria API Gateway - Main entry point for all API requests
"""
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, Response
from typing import Optional, List
from datetime import datetime, timedelta
import json
import pytz
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
import asyncpg
import redis.asyncio as redis
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from core.config import get_settings
from core.logging import get_logger
from core.models import (
    WeatherData, ProductionData, ForecastResult, Site, CreateSiteRequest, UpdateSiteRequest, Alert, AlertCondition
)
from core.metrics import monitor_request, REQUEST_COUNT, REQUEST_LATENCY
from core.cache import CacheManager, cache_manager

logger = get_logger('api-gateway')
settings = get_settings()

app = FastAPI(
    title="Bria Forecasting API",
    description="renewable energy forecasting platform",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Remove server header in production
    if not settings.DEBUG and "server" in response.headers:
        del response.headers["server"]
    return response

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

# Database and Redis connections (simplified - in production use connection pools)
db_pool: Optional[asyncpg.Pool] = None
redis_client: Optional[redis.Redis] = None
global_cache_manager: Optional[CacheManager] = None


@app.on_event("startup")
async def startup():
    """Initialize connections on startup"""
    global db_pool, redis_client
    
    # Database connection pool (optional - service can run without it)
    try:
        db_pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=2,
            max_size=10
        )
        app.state.db_pool = db_pool
        logger.info("Database connection pool created")
    except asyncpg.exceptions.InvalidPasswordError as e:
        logger.warning(f"Database authentication failed - check DATABASE_URL password in .env")
        app.state.db_pool = None
    except Exception as e:
        logger.warning(f"Database connection failed (service will run in degraded mode): {e}")
        app.state.db_pool = None
    
    # Redis client (optional)
    try:
        # Try connecting with the provided URL
        redis_client = await redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2
        )
        await redis_client.ping()
        app.state.redis_client = redis_client
        logger.info("Redis connection established")
    except Exception as e:
        # If connection fails and URL contains password, try without password
        if 'password' in settings.REDIS_URL.lower() or '@' in settings.REDIS_URL:
            try:
                # Extract host and port, remove password
                import re
                match = re.match(r'redis://(?:[^:]+:[^@]+@)?([^:]+):(\d+)', settings.REDIS_URL)
                if match:
                    host, port = match.groups()
                    redis_client = await redis.from_url(
                        f'redis://{host}:{port}',
                        decode_responses=True,
                        socket_connect_timeout=2
                    )
                    await redis_client.ping()
                    app.state.redis_client = redis_client
                    logger.info("Redis connection established (without password)")
                else:
                    raise
            except Exception as e2:
                logger.warning(f"Redis connection failed (service will run without caching): {e2}")
                redis_client = None
                app.state.redis_client = None
        else:
            logger.warning(f"Redis connection failed (service will run without caching): {e}")
            redis_client = None
            app.state.redis_client = None
    
    # Initialize cache manager
    global_cache_manager = CacheManager(redis_client=redis_client)
    app.state.cache_manager = global_cache_manager
    logger.info("Cache manager initialized")
    
    logger.info("API Gateway initialized (some services may be in degraded mode)")


@app.on_event("shutdown")
async def shutdown():
    """Close connections on shutdown"""
    global db_pool, redis_client
    
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.close()
    
    logger.info("API Gateway shut down")


# Authentication helpers
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


async def authenticate_user(email: str, password: str):
    """Authenticate user"""
    if not db_pool:
        return None
    
    try:
        async with db_pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT * FROM users WHERE email = $1 AND is_active = TRUE",
                email
            )
            
            if not user or not verify_password(password, user['hashed_password']):
                return None
            
            return dict(user)
    except Exception:
        return None


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Get current authenticated user"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        return dict(user)


# Health check
@app.get("/api/v1/health")
async def health_check():
    """System health endpoint"""
    try:
        # Check database
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"
    
    if redis_client:
        try:
            await redis_client.ping()
            redis_status = "healthy"
        except Exception:
            redis_status = "unhealthy"
    else:
        redis_status = "unavailable"
    
    return {
        "status": "healthy" if db_status == "healthy" and redis_status == "healthy" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "services": {
            "database": db_status,
            "redis": redis_status
        }
    }


# Request models
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None
    full_name: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# Authentication endpoints
@app.post("/api/v1/auth/register")
async def register(request: RegisterRequest):
    """Register a new user"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    try:
        async with db_pool.acquire() as conn:
            # Check if user already exists
            existing = await conn.fetchrow(
                "SELECT id FROM users WHERE email = $1",
                request.email
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
            
            # Generate username if not provided
            username = request.username or request.email.split('@')[0]
            
            # Get or create default tenant
            tenant = await conn.fetchrow(
                "SELECT id FROM tenants WHERE name = 'default' LIMIT 1"
            )
            if not tenant:
                tenant_id = await conn.fetchval(
                    "INSERT INTO tenants (name, created_at) VALUES ('default', NOW()) RETURNING id"
                )
            else:
                tenant_id = tenant['id']
            
            # Create user
            user_id = await conn.fetchval(
                """
                INSERT INTO users (email, username, hashed_password, full_name, is_active, role, tenant_id)
                VALUES ($1, $2, $3, $4, TRUE, 'user', $5)
                RETURNING id
                """,
                request.email,
                username,
                get_password_hash(request.password),
                request.full_name or username,
                tenant_id
            )
            
            # Create access token
            access_token = create_access_token(data={"sub": str(user_id)})
            
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user_id": str(user_id),
                "email": request.email,
                "username": username
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


@app.post("/api/v1/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Change user password"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    try:
        async with db_pool.acquire() as conn:
            # Verify current password
            user = await conn.fetchrow(
                "SELECT hashed_password FROM users WHERE id = $1",
                current_user['id']
            )
            
            if not user or not verify_password(request.current_password, user['hashed_password']):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is incorrect"
                )
            
            # Update password
            await conn.execute(
                "UPDATE users SET hashed_password = $1, updated_at = NOW() WHERE id = $2",
                get_password_hash(request.new_password),
                current_user['id']
            )
            
            return {"message": "Password changed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password change failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password change failed"
        )


@app.post("/api/v1/auth/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login endpoint"""
    if not db_pool:
        logger.error("Database not available for login attempt", email=form_data.username)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available. Please check database connection and ensure PostgreSQL is running."
        )
    
    try:
        user = await authenticate_user(form_data.username, form_data.password)
        if not user:
            logger.warning("Login failed - invalid credentials", email=form_data.username)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password. Please check your credentials."
            )
        
        access_token = create_access_token(data={"sub": str(user['id'])})
        logger.info("Login successful", email=form_data.username, user_id=str(user['id']))
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Login error", exc_info=True, email=form_data.username)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login. Please try again."
        )


# Sites endpoints
@app.get("/api/v1/sites")
@monitor_request("get_sites")
async def get_sites(
    skip: int = 0,
    limit: int = 100,
    group_by: Optional[str] = None,  # 'technology', 'location', 'output'
    sort_by: Optional[str] = None,  # 'name', 'type', 'capacity_mw', 'created_at', 'latitude', 'longitude'
    sort_order: Optional[str] = 'asc',  # 'asc' or 'desc'
    current_user: dict = Depends(get_current_user)
):
    """Get all sites for current user's tenant with optional grouping and sorting"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Build ORDER BY clause
        order_by = "created_at DESC"  # Default
        if sort_by:
            valid_sort_fields = ['name', 'type', 'capacity_mw', 'created_at', 'latitude', 'longitude']
            if sort_by in valid_sort_fields:
                order_dir = "DESC" if sort_order and sort_order.lower() == 'desc' else "ASC"
                order_by = f"{sort_by} {order_dir}"
        
        sites = await conn.fetch(
            f"""
            SELECT * FROM sites 
            WHERE tenant_id = $1 
            ORDER BY {order_by}
            LIMIT $2 OFFSET $3
            """,
            current_user['tenant_id'],
            limit,
            skip
        )
        
        sites_list = [dict(site) for site in sites]
        
        # Group sites if requested
        if group_by:
            grouped = {}
            for site in sites_list:
                if group_by == 'technology':
                    key = site.get('type', 'unknown')
                elif group_by == 'location':
                    # Group by approximate location (rounded to 1 decimal = ~11km)
                    lat_rounded = round(float(site.get('latitude', 0)), 1)
                    lon_rounded = round(float(site.get('longitude', 0)), 1)
                    key = f"{lat_rounded},{lon_rounded}"
                elif group_by == 'output':
                    # Group by capacity ranges
                    capacity = float(site.get('capacity_mw', 0))
                    if capacity < 1:
                        key = "< 1 MW"
                    elif capacity < 5:
                        key = "1-5 MW"
                    elif capacity < 10:
                        key = "5-10 MW"
                    elif capacity < 50:
                        key = "10-50 MW"
                    else:
                        key = "> 50 MW"
                else:
                    key = 'all'
                
                if key not in grouped:
                    grouped[key] = []
                grouped[key].append(site)
            
            return {
                "grouped": True,
                "group_by": group_by,
                "groups": grouped,
                "total": len(sites_list)
            }
        
        return sites_list


@app.get("/api/v1/sites/{site_id}")
@monitor_request("get_site")
async def get_site(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get site by ID"""
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            """
            SELECT * FROM sites 
            WHERE id = $1 AND tenant_id = $2
            """,
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        return dict(site)


@app.get("/api/v1/sites/{site_id}/status")
@monitor_request("get_site_status")
async def get_site_status(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get real-time status for a site
    
    Returns operational status, last data update, current power vs forecast,
    active alerts count, and communication status.
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Verify site access
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        now = datetime.utcnow()
        
        # Get latest production data (last hour)
        one_hour_ago = now - timedelta(hours=1)
        latest_production = await conn.fetchrow(
            """
            SELECT time, power_kw
            FROM production_actuals
            WHERE site_id = $1
            AND time >= $2
            ORDER BY time DESC
            LIMIT 1
            """,
            site_id,
            one_hour_ago
        )
        
        # Get latest forecast for current hour
        current_hour = now.replace(minute=0, second=0, microsecond=0)
        next_hour = current_hour + timedelta(hours=1)
        latest_forecast = await conn.fetchrow(
            """
            SELECT predicted_power_kw, p50_kw
            FROM forecasts
            WHERE site_id = $1
            AND target_time >= $2
            AND target_time < $3
            ORDER BY forecast_time DESC
            LIMIT 1
            """,
            site_id,
            current_hour,
            next_hour
        )
        
        # Get active alerts count
        active_alerts = await conn.fetch(
            """
            SELECT a.severity, COUNT(*) as count
            FROM alerts a
            INNER JOIN alert_events ae ON a.id = ae.alert_id
            WHERE a.site_id = $1
            AND a.enabled = TRUE
            AND ae.resolved_at IS NULL
            GROUP BY a.severity
            """,
            site_id
        )
        
        # Get latest weather reading timestamp
        # Handle case where weather_readings table might not exist
        latest_weather = None
        try:
            latest_weather = await conn.fetchrow(
                """
                SELECT MAX(wr.time) as last_reading
                FROM weather_readings wr
                INNER JOIN weather_stations ws ON wr.station_id = ws.id
                WHERE ws.site_id = $1
                """,
                site_id
            )
        except asyncpg.exceptions.UndefinedTableError:
            # Table doesn't exist yet, skip weather data
            latest_weather = None
        except Exception:
            # Other errors, skip weather data
            latest_weather = None
        
        # Calculate status
        last_data_update = None
        if latest_production:
            last_data_update = latest_production['time']
        elif latest_weather and latest_weather['last_reading']:
            last_data_update = latest_weather['last_reading']
        
        # Calculate time since last update
        minutes_since_update = None
        if last_data_update:
            delta = now - last_data_update
            minutes_since_update = delta.total_seconds() / 60
        
        # Get current power and forecast
        current_power_kw = float(latest_production['power_kw']) if latest_production and latest_production['power_kw'] else None
        forecast_power_kw = float(latest_forecast['p50_kw']) if latest_forecast and latest_forecast['p50_kw'] else None
        
        # Calculate forecast deviation
        forecast_deviation_percent = None
        if current_power_kw is not None and forecast_power_kw is not None and forecast_power_kw > 0:
            forecast_deviation_percent = ((current_power_kw - forecast_power_kw) / forecast_power_kw) * 100
        
        # Count alerts by severity
        critical_count = 0
        warning_count = 0
        info_count = 0
        for alert in active_alerts:
            if alert['severity'] == 'critical':
                critical_count = alert['count']
            elif alert['severity'] in ['high', 'medium']:
                warning_count += alert['count']
            else:
                info_count += alert['count']
        
        total_alerts = critical_count + warning_count + info_count
        
        # Determine communication status
        communication_status = "connected"
        if minutes_since_update is None:
            communication_status = "unknown"
        elif minutes_since_update > 60:
            communication_status = "disconnected"
        elif minutes_since_update > 15:
            communication_status = "intermittent"
        
        # Determine overall status
        # Default to warning if no data available
        if minutes_since_update is None:
            status = "warning"
        elif (
            minutes_since_update > 60 or
            (forecast_deviation_percent and abs(forecast_deviation_percent) > 40) or
            critical_count > 0 or
            communication_status == "disconnected"
        ):
            status = "critical"
        elif (
            minutes_since_update > 15 or
            (forecast_deviation_percent and abs(forecast_deviation_percent) > 20) or
            warning_count > 0 or
            communication_status == "intermittent"
        ):
            status = "warning"
        else:
            status = "operational"
        
        # Format relative time
        last_data_update_relative = None
        if last_data_update:
            delta = now - last_data_update
            if delta.total_seconds() < 60:
                last_data_update_relative = f"{int(delta.total_seconds())} seconds ago"
            elif delta.total_seconds() < 3600:
                last_data_update_relative = f"{int(delta.total_seconds() / 60)} minutes ago"
            elif delta.total_seconds() < 86400:
                last_data_update_relative = f"{int(delta.total_seconds() / 3600)} hours ago"
            else:
                last_data_update_relative = f"{int(delta.total_seconds() / 86400)} days ago"
        
        return {
            "site_id": site_id,
            "status": status,
            "last_data_update": last_data_update.isoformat() if last_data_update else None,
            "last_data_update_relative": last_data_update_relative,
            "current_power_kw": round(current_power_kw, 2) if current_power_kw is not None else None,
            "forecast_power_kw": round(forecast_power_kw, 2) if forecast_power_kw is not None else None,
            "forecast_deviation_percent": round(forecast_deviation_percent, 2) if forecast_deviation_percent is not None else None,
            "communication_status": communication_status,
            "active_alerts_count": total_alerts,
            "critical_alerts_count": critical_count,
            "warning_alerts_count": warning_count,
            "info_alerts_count": info_count,
            "minutes_since_update": round(minutes_since_update, 1) if minutes_since_update is not None else None
        }


@app.post("/api/v1/sites")
@monitor_request("create_site")
async def create_site(
    site: CreateSiteRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create new site"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    import json
    
    # Convert dicts to JSON strings for JSONB fields
    pv_params_json = json.dumps(site.pv_params) if site.pv_params else None
    turbine_params_json = json.dumps(site.turbine_params) if site.turbine_params else None
    
    async with db_pool.acquire() as conn:
        site_id = await conn.fetchval(
            """
            INSERT INTO sites (name, type, latitude, longitude, capacity_mw, timezone, tenant_id, pv_params, turbine_params)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
            RETURNING id
            """,
            site.name,
            site.type.value,
            site.latitude,
            site.longitude,
            site.capacity_mw,
            site.timezone,
            current_user['tenant_id'],
            pv_params_json,
            turbine_params_json
        )
        return {"id": str(site_id), "status": "created"}


@app.put("/api/v1/sites/{site_id}")
@monitor_request("update_site")
async def update_site(
    site_id: str,
    site_update: UpdateSiteRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update site details"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Verify site ownership
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        # Build update query dynamically based on provided fields
        update_fields = []
        update_values = []
        param_index = 1
        
        if site_update.name is not None:
            update_fields.append(f"name = ${param_index}")
            update_values.append(site_update.name)
            param_index += 1
        
        if site_update.type is not None:
            update_fields.append(f"type = ${param_index}")
            update_values.append(site_update.type.value)
            param_index += 1
        
        if site_update.capacity_mw is not None:
            update_fields.append(f"capacity_mw = ${param_index}")
            update_values.append(site_update.capacity_mw)
            param_index += 1
        
        if site_update.latitude is not None:
            update_fields.append(f"latitude = ${param_index}")
            update_values.append(site_update.latitude)
            param_index += 1
        
        if site_update.longitude is not None:
            update_fields.append(f"longitude = ${param_index}")
            update_values.append(site_update.longitude)
            param_index += 1
        
        if site_update.timezone is not None:
            update_fields.append(f"timezone = ${param_index}")
            update_values.append(site_update.timezone)
            param_index += 1
        
        if site_update.pv_params is not None:
            import json
            update_fields.append(f"pv_params = ${param_index}::jsonb")
            update_values.append(json.dumps(site_update.pv_params))
            param_index += 1
        
        if site_update.turbine_params is not None:
            import json
            update_fields.append(f"turbine_params = ${param_index}::jsonb")
            update_values.append(json.dumps(site_update.turbine_params))
            param_index += 1
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        # Add updated_at
        update_fields.append(f"updated_at = ${param_index}")
        update_values.append(datetime.utcnow())
        param_index += 1
        
        # Add site_id and tenant_id for WHERE clause
        update_values.extend([site_id, current_user['tenant_id']])
        
        # Execute update
        query = f"""
            UPDATE sites
            SET {', '.join(update_fields)}
            WHERE id = ${param_index} AND tenant_id = ${param_index + 1}
            RETURNING *
        """
        
        updated_site = await conn.fetchrow(query, *update_values)
        
        if not updated_site:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update site"
            )
        
        # Invalidate forecast cache if capacity or location changed
        if site_update.capacity_mw is not None or site_update.latitude is not None or site_update.longitude is not None:
            if redis_client:
                try:
                    # Invalidate all forecast caches for this site
                    pattern = f"forecast:{site_id}:*"
                    # Note: Redis KEYS is not ideal for production, but works for this use case
                    # In production, use SCAN or maintain a set of cache keys
                    keys = await redis_client.keys(pattern)
                    if keys:
                        await redis_client.delete(*keys)
                    logger.info(f"Invalidated forecast cache for site {site_id}", keys_count=len(keys))
                except Exception as e:
                    logger.warning(f"Failed to invalidate forecast cache: {e}")
        
        return dict(updated_site)


@app.delete("/api/v1/sites/{site_id}")
@monitor_request("delete_site")
async def delete_site(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a site"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Verify site ownership
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        # Delete related data (cascading deletes should handle this, but we'll be explicit)
        # Note: Foreign key constraints with ON DELETE CASCADE should handle:
        # - weather_stations
        # - weather_readings
        # - production_actuals
        # - forecasts
        # - alerts
        # - alert_events
        
        # Invalidate forecast cache
        if redis_client:
            try:
                pattern = f"forecast:{site_id}:*"
                keys = await redis_client.keys(pattern)
                if keys:
                    await redis_client.delete(*keys)
                logger.info(f"Invalidated forecast cache for deleted site {site_id}", keys_count=len(keys))
            except Exception as e:
                logger.warning(f"Failed to invalidate forecast cache: {e}")
        
        # Delete the site (cascading deletes will handle related records)
        await conn.execute("DELETE FROM sites WHERE id = $1", site_id)
        
        logger.info(f"Site deleted", site_id=site_id, site_name=site.get('name', 'Unknown'))
        
        return {"status": "deleted", "id": site_id}


class GeocodeRequest(BaseModel):
    """Request model for geocoding"""
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None


@app.post("/api/v1/geocode")
@monitor_request("geocode")
async def geocode_address(
    request: GeocodeRequest,
    current_user: dict = Depends(get_current_user)
):
    """Geocode an address to get latitude and longitude"""
    try:
        from services.forecasting.weather.geocoding import geocoding_service
        
        coords = await geocoding_service.geocode_address(
            address=request.address,
            city=request.city,
            state=request.state,
            postcode=request.postcode,
            country=request.country
        )
        
        if coords:
            lat, lon = coords
            return {
                "latitude": lat,
                "longitude": lon,
                "success": True
            }
        else:
            raise HTTPException(
                status_code=404,
                detail="Address not found. Please check the address and try again."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in geocoding endpoint", exc_info=e)
        raise HTTPException(
            status_code=500,
            detail="Error geocoding address"
        )


# Forecast endpoints
@app.get("/api/v1/sites/{site_id}/forecast")
@monitor_request("get_forecast")
async def get_forecast(
    site_id: str,
    horizon: str = "24h",
    include_confidence: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Get forecast for a specific site"""
    # Parse horizon - handle both hours (24h, 48h) and days (7d, 30d)
    if horizon.endswith('h'):
        horizon_hours = int(horizon.replace('h', ''))
    elif horizon.endswith('d'):
        horizon_days = int(horizon.replace('d', ''))
        horizon_hours = horizon_days * 24
    else:
        # Try to parse as integer (assume hours)
        try:
            horizon_hours = int(horizon)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid horizon format: {horizon}. Use '24h', '48h', '7d', or '30d'")
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Get forecast from cache or compute
    cache_key = f"forecast:{site_id}:{horizon}"
    if redis_client:
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                import json
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Redis cache read failed, continuing without cache: {e}")
    
    # Generate forecast using OpenWeather data
    try:
        from services.forecasting.forecast_service import forecast_service
        
        # Convert site record to dict and parse JSON fields
        site_dict = dict(site)
        # Parse JSONB fields if they're strings
        if isinstance(site_dict.get('pv_params'), str):
            import json
            try:
                site_dict['pv_params'] = json.loads(site_dict['pv_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['pv_params'] = None
        if isinstance(site_dict.get('turbine_params'), str):
            import json
            try:
                site_dict['turbine_params'] = json.loads(site_dict['turbine_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['turbine_params'] = None
        
        # Call appropriate forecast method based on site type
        site_type = site_dict.get('type', 'solar').lower()
        if site_type == 'wind':
            forecast = await forecast_service.generate_wind_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        else:
            # Default to solar for solar sites or unknown types
            forecast = await forecast_service.generate_solar_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        
        # Add site metadata to forecast response
        forecast['site_name'] = site.get('name', 'Unknown Site')
        forecast['site_type'] = site.get('type', 'solar')
        forecast['capacity_kw'] = float(site.get('capacity_mw', 0)) * 1000
        
        # Cache for 5 minutes (optional - don't fail if Redis is unavailable)
        if redis_client:
            try:
                import json
                await redis_client.setex(cache_key, 300, json.dumps(forecast))
            except Exception as e:
                logger.warning(f"Redis cache write failed, continuing without cache: {e}")
        
        return forecast
    except Exception as e:
        logger.error("Error generating forecast", exc_info=e, site_id=site_id)
        # Fallback to simple forecast
        # Convert Decimal to float for calculations
        capacity_mw = float(site['capacity_mw'])
        forecast = {
            "site_id": site_id,
            "site_name": site.get('name', 'Unknown Site'),
            "site_type": site.get('type', 'solar'),
            "capacity_kw": capacity_mw * 1000,
            "horizon": horizon,
            "forecast_generated": datetime.utcnow().isoformat(),
            "values": [
                {
                    "timestamp": (datetime.utcnow() + timedelta(hours=i)).isoformat(),
                    "predicted_power_kw": round(capacity_mw * 1000 * 0.5, 2),
                    "p10": round(capacity_mw * 1000 * 0.4, 2),
                    "p50": round(capacity_mw * 1000 * 0.5, 2),
                    "p90": round(capacity_mw * 1000 * 0.6, 2)
                }
                for i in range(horizon_hours)
            ]
        }
        return forecast


@app.get("/api/v1/sites/{site_id}/weather/history")
@monitor_request("get_weather_history")
async def get_weather_history(
    site_id: str,
    days: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Get historical weather data for a site using OpenWeather Historical API"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Try to get data from database first
    try:
        async with db_pool.acquire() as conn:
            # Check if weather_stations table exists
            table_exists = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'weather_stations'
                )
                """
            )
            
            if not table_exists:
                logger.warning("weather_stations table does not exist - run migrations first")
                # Skip database query and go straight to OpenWeather API
                stations = []
            else:
                stations = await conn.fetch(
                    "SELECT id FROM weather_stations WHERE site_id = $1",
                    site_id
                )
            
            if stations and len(stations) > 0:
                station_ids = [str(s['id']) for s in stations]
                start_time = datetime.utcnow() - timedelta(days=days)
                
                # Query weather readings from database
                # Handle case where weather_readings table might not exist
                weather_data = None
                try:
                    weather_data = await conn.fetch(
                        """
                        SELECT 
                            time,
                            ghi,
                            dni,
                            dhi,
                            wind_speed,
                            wind_direction,
                            ambient_temp,
                            panel_temp,
                            air_pressure,
                            humidity,
                            cloud_cover
                        FROM weather_readings
                        WHERE station_id = ANY($1::uuid[])
                        AND time >= $2
                        ORDER BY time ASC
                        """,
                        station_ids,
                        start_time
                    )
                except asyncpg.exceptions.UndefinedTableError:
                    # Table doesn't exist yet, skip database query
                    weather_data = None
                except Exception as e:
                    # Other errors, log and skip
                    logger.warning(f"Error querying weather_readings: {e}")
                    weather_data = None
                
                if weather_data:
                    return {
                        "site_id": site_id,
                        "period_days": days,
                        "source": "database",
                        "data": [
                            {
                                "timestamp": row['time'].isoformat(),
                                "ghi": float(row['ghi']) if row['ghi'] else None,
                                "dni": float(row['dni']) if row['dni'] else None,
                                "dhi": float(row['dhi']) if row['dhi'] else None,
                                "wind_speed": float(row['wind_speed']) if row['wind_speed'] else None,
                                "wind_direction": float(row['wind_direction']) if row['wind_direction'] else None,
                                "temperature": float(row['ambient_temp']) if row['ambient_temp'] else None,
                                "panel_temp": float(row['panel_temp']) if row['panel_temp'] else None,
                                "humidity": float(row['humidity']) if row['humidity'] else None,
                                "cloud_cover": float(row['cloud_cover']) if row['cloud_cover'] else None,
                            }
                            for row in weather_data
                        ]
                    }
    except Exception as e:
        logger.warning(f"Error querying database for weather history: {e}")
    
    # Fallback to OpenWeather Historical API
    try:
        # Check cache first
        cache_key = f"weather_history:{site_id}:{days}"
        if global_cache_manager:
            cached = await global_cache_manager.get(cache_key)
            if cached:
                logger.info("Returning cached weather history", site_id=site_id)
                return cached
        
        from services.forecasting.weather.openweather import OpenWeatherClient
        
        # Initialize client with cache manager and database pool
        openweather_client = OpenWeatherClient(cache_manager=global_cache_manager, db_pool=db_pool)
        
        if not openweather_client.api_key:
            logger.warning("OpenWeather API key not configured for historical data", site_id=site_id)
            return {
                "site_id": site_id,
                "period_days": days,
                "source": "none",
                "data": [],
                "message": "No weather data available. OpenWeather API key not configured."
            }
        
        # Calculate time range for historical data
        # OpenWeather History API: 
        # - Historical data must be in the PAST (not future)
        # - Professional/Expert plans: max 1 week (168 hours) per request
        # - Free tier: May have limited or no access to historical data
        # Using cnt parameter for number of hours (more reliable than start/end)
        now = datetime.utcnow().replace(tzinfo=pytz.utc)
        # For historical data, we go BACK in time from now
        hours_requested = min(days * 24, 168)  # Max 1 week (168 hours) per request
        # Start time should be in the past
        start_time = now - timedelta(hours=hours_requested)
        # End time is now (most recent historical data)
        end_time = now
        
        logger.info("Fetching historical weather from OpenWeather", 
                   site_id=site_id,
                   lat=float(site['latitude']),
                   lon=float(site['longitude']),
                   start=start_time.isoformat(),
                   end=end_time.isoformat(),
                   hours=hours_requested)
        
        # Fetch historical weather from OpenWeather
        # Note: Historical API may require paid subscription depending on tier
        # Use cnt parameter (hours) for better compatibility
        historical_data = await openweather_client.get_historical_weather(
            latitude=float(site['latitude']),
            longitude=float(site['longitude']),
            start_time=start_time,
            hours=hours_requested,  # Use hours parameter (cnt) instead of end_time
            site_id=site_id
        )
        
        if historical_data:
            logger.info(f"Received {len(historical_data)} historical data points from OpenWeather", site_id=site_id)
        else:
            logger.warning("No historical data returned from OpenWeather API", site_id=site_id)
        
        if not historical_data:
            return {
                "site_id": site_id,
                "period_days": days,
                "source": "openweather",
                "data": [],
                "message": "No historical weather data available from OpenWeather API"
            }
        
        # Convert OpenWeather historical data to our format
        converted_data = []
        for item in historical_data:
            # OpenWeather historical format
            main = item.get('main', {})
            wind = item.get('wind', {})
            clouds = item.get('clouds', {})
            weather_main = item.get('weather', [{}])[0] if item.get('weather') else {}
            
            # Estimate GHI from weather conditions (simplified)
            # GHI estimation: clear sky = high, cloudy = low
            cloud_cover = clouds.get('all', 0) or 0
            temp = main.get('temp', 0)
            # Simple GHI estimation: max ~1000 W/m², reduced by cloud cover
            # Also consider time of day (simplified - assume daylight hours have higher GHI)
            hour = datetime.fromtimestamp(item['dt'], tz=pytz.utc).hour
            daylight_factor = 1.0 if 6 <= hour <= 18 else 0.1  # Day vs night
            estimated_ghi = max(0, 1000 * (1 - cloud_cover / 100) * daylight_factor) if temp > 0 else 0
            
            converted_data.append({
                "timestamp": datetime.fromtimestamp(item['dt'], tz=pytz.utc).isoformat(),
                "ghi": round(estimated_ghi, 2),
                "dni": None,  # Not directly available in historical API
                "dhi": None,  # Not directly available in historical API
                "wind_speed": wind.get('speed'),
                "wind_direction": wind.get('deg'),
                "temperature": main.get('temp'),
                "panel_temp": None,  # Not available in historical API
                "humidity": main.get('humidity'),
                "cloud_cover": cloud_cover,
            })
        
        result = {
            "site_id": site_id,
            "period_days": days,
            "source": "openweather",
            "data": converted_data
        }
        
        # Cache the result for 1 hour
        if global_cache_manager:
            await global_cache_manager.set(cache_key, result, ttl_seconds=3600)
        
        # Optionally store in database for future use
        if db_pool and converted_data:
            try:
                async with db_pool.acquire() as conn:
                    # Get or create weather station for this site
                    station = await conn.fetchrow(
                        "SELECT id FROM weather_stations WHERE site_id = $1 LIMIT 1",
                        site_id
                    )
                    
                    if not station:
                        # Create a virtual weather station for OpenWeather data
                        # Generate a unique station code
                        station_code = f"OW-{site_id[:8].upper()}"
                        try:
                            # Use PostGIS POINT for coordinates
                            station_id = await conn.fetchval(
                                """
                                INSERT INTO weather_stations (site_id, station_code, manufacturer, coordinates, elevation_m)
                                VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)
                                RETURNING id
                                """,
                                site_id,
                                station_code,
                                'OpenWeather',
                                float(site['longitude']),  # Note: longitude first for PostGIS
                                float(site['latitude']),
                                0
                            )
                        except Exception as e:
                            logger.warning(f"Error creating weather station: {e}, trying to get existing one")
                            # Try to get station by code if insert failed
                            station = await conn.fetchrow(
                                "SELECT id FROM weather_stations WHERE station_code = $1",
                                station_code
                            )
                            if station:
                                station_id = station['id']
                            else:
                                logger.error(f"Could not create or find weather station: {e}")
                                raise
                    else:
                        station_id = station['id']
                    
                    # Store weather readings (batch insert)
                    for data_point in converted_data:
                        try:
                            await conn.execute(
                                """
                                INSERT INTO weather_readings 
                                (time, station_id, ghi, wind_speed, wind_direction, ambient_temp, humidity, cloud_cover)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                ON CONFLICT (time, station_id) DO UPDATE SET
                                    ghi = EXCLUDED.ghi,
                                    wind_speed = EXCLUDED.wind_speed,
                                    ambient_temp = EXCLUDED.ambient_temp,
                                    humidity = EXCLUDED.humidity,
                                    cloud_cover = EXCLUDED.cloud_cover
                                """,
                                datetime.fromisoformat(data_point['timestamp'].replace('Z', '+00:00')),
                                station_id,
                                data_point['ghi'],
                                data_point.get('wind_speed'),
                                data_point.get('wind_direction'),
                                data_point.get('temperature'),  # Use temperature field
                                data_point.get('humidity'),
                                data_point.get('cloud_cover')
                            )
                        except Exception as e:
                            logger.warning(f"Error storing weather reading: {e}")
                            continue
                    
                    logger.info(f"Stored {len(converted_data)} weather readings in database", site_id=site_id)
            except Exception as e:
                logger.warning(f"Error storing weather data in database: {e}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching historical weather from OpenWeather: {e}", exc_info=True)
        return {
            "site_id": site_id,
            "period_days": days,
            "source": "error",
            "data": [],
            "message": f"Error fetching historical weather: {str(e)}"
        }


@app.get("/api/v1/sites/{site_id}/production/history")
@monitor_request("get_production_history")
async def get_production_history(
    site_id: str,
    days: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Get historical production data for a site"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        start_time = datetime.utcnow() - timedelta(days=days)
        
        # Query production actuals
        production_data = await conn.fetch(
            """
            SELECT 
                time,
                power_kw,
                energy_kwh,
                availability
            FROM production_actuals
            WHERE site_id = $1
            AND time >= $2
            ORDER BY time ASC
            """,
            site_id,
            start_time
        )
        
        return {
            "site_id": site_id,
            "period_days": days,
            "data": [
                {
                    "timestamp": row['time'].isoformat(),
                    "power_kw": float(row['power_kw']) if row['power_kw'] else None,
                    "energy_kwh": float(row['energy_kwh']) if row['energy_kwh'] else None,
                    "availability": float(row['availability']) if row['availability'] else None,
                }
                for row in production_data
            ]
        }


@app.get("/api/v1/sites/{site_id}/performance")
@monitor_request("get_site_performance")
async def get_site_performance(
    site_id: str,
    days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Get performance metrics for a site"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        capacity_mw = float(site['capacity_mw'])
        start_time = datetime.utcnow() - timedelta(days=days)
        
        # Get production statistics
        # Note: efficiency column doesn't exist, calculate it from power and capacity
        stats = await conn.fetchrow(
            """
            SELECT 
                COUNT(*) as data_points,
                AVG(power_kw) as avg_power_kw,
                MAX(power_kw) as max_power_kw,
                MIN(power_kw) as min_power_kw,
                SUM(energy_kwh) as total_energy_kwh,
                AVG(availability) as avg_availability
            FROM production_actuals
            WHERE site_id = $1
            AND time >= $2
            """,
            site_id,
            start_time
        )
        
        if not stats or stats['data_points'] == 0:
            # No production data, return default metrics
            return {
                "site_id": site_id,
                "period_days": days,
                "capacity_mw": capacity_mw,
                "capacity_factor": 0.0,
                "average_power_kw": 0.0,
                "max_power_kw": 0.0,
                "min_power_kw": 0.0,
                "total_energy_kwh": 0.0,
                "average_availability": 0.0,
                "average_efficiency": 0.0,
                "data_points": 0
            }
        
        # Calculate capacity factor (actual energy / theoretical max energy)
        total_energy_kwh = float(stats['total_energy_kwh'] or 0)
        theoretical_max_kwh = capacity_mw * 1000 * 24 * days  # MW to kW, hours, days
        capacity_factor = (total_energy_kwh / theoretical_max_kwh * 100) if theoretical_max_kwh > 0 else 0.0
        
        # Calculate efficiency from average power vs capacity
        avg_power_kw = float(stats['avg_power_kw'] or 0)
        max_power_kw = capacity_mw * 1000  # Convert MW to kW
        avg_efficiency = (avg_power_kw / max_power_kw * 100) if max_power_kw > 0 else 0.0
        
        return {
            "site_id": site_id,
            "period_days": days,
            "capacity_mw": capacity_mw,
            "capacity_factor": round(capacity_factor, 2),
            "average_power_kw": round(avg_power_kw, 2),
            "max_power_kw": round(float(stats['max_power_kw'] or 0), 2),
            "min_power_kw": round(float(stats['min_power_kw'] or 0), 2),
            "total_energy_kwh": round(total_energy_kwh, 2),
            "average_availability": round(float(stats['avg_availability'] or 0) * 100, 2),
            "average_efficiency": round(avg_efficiency, 2),
            "data_points": stats['data_points']
        }


@app.get("/api/v1/sites/{site_id}/technology-recommendation")
@monitor_request("get_technology_recommendation")
async def get_technology_recommendation(
    site_id: str,
    days: int = 365,
    energy_price_per_mwh: float = 50.0,
    solar_capex_per_mw: float = 1000000.0,
    wind_capex_per_mw: float = 1500000.0,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyze historical weather data and provide technology recommendations
    
    Returns financial and technical analysis comparing solar, wind, and hybrid options
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        capacity_mw = float(site['capacity_mw'])
        latitude = float(site['latitude'])
        longitude = float(site['longitude'])
        
        # Get historical weather data (use max available, up to requested days)
        try:
            from services.forecasting.weather.openweather import OpenWeatherClient
            openweather_client = OpenWeatherClient(cache_manager=global_cache_manager, db_pool=db_pool)
            
            # Try to get data from database first
            weather_data = None
            try:
                stations = await conn.fetch(
                    "SELECT id FROM weather_stations WHERE site_id = $1",
                    site_id
                )
                if stations and len(stations) > 0:
                    station_ids = [str(s['id']) for s in stations]
                    start_time = datetime.utcnow() - timedelta(days=min(days, 365))
                    
                    try:
                        weather_data = await conn.fetch(
                            """
                            SELECT 
                                time,
                                ghi,
                                wind_speed,
                                wind_direction,
                                ambient_temp
                            FROM weather_readings
                            WHERE station_id = ANY($1::uuid[])
                            AND time >= $2
                            ORDER BY time ASC
                            """,
                            station_ids,
                            start_time
                        )
                    except asyncpg.exceptions.UndefinedTableError:
                        weather_data = None
            except Exception as e:
                logger.warning(f"Error querying database for weather data: {e}")
                weather_data = None
            
            # If no database data, try OpenWeather API (limited to available historical data)
            if not weather_data or len(weather_data) == 0:
                if openweather_client.api_key:
                    # OpenWeather historical API is limited, so we'll use recent data
                    # For better analysis, we'd ideally use a full year of data
                    hours_requested = min(days * 24, 168)  # Max 1 week from API
                    start_time = datetime.utcnow().replace(tzinfo=pytz.utc) - timedelta(hours=hours_requested)
                    
                    api_data = await openweather_client.get_historical_weather(
                        latitude, longitude, start_time, hours=hours_requested, site_id=site_id
                    )
                    
                    if api_data:
                        weather_data = [
                            {
                                'time': datetime.fromisoformat(d['timestamp'].replace('Z', '+00:00')),
                                'ghi': d.get('ghi'),
                                'wind_speed': d.get('wind_speed'),
                                'wind_direction': d.get('wind_direction'),
                                'ambient_temp': d.get('temperature')
                            }
                            for d in api_data
                        ]
        except Exception as e:
            logger.error(f"Error fetching weather data for analysis: {e}")
            weather_data = []
        
        if not weather_data or len(weather_data) == 0:
            return {
                "site_id": site_id,
                "error": "Insufficient weather data for analysis",
                "message": "Need at least 30 days of historical weather data for accurate analysis",
                "recommendations": {
                    "recommended_technology": "unknown",
                    "confidence": "low"
                }
            }
        
        # Analyze weather data
        ghi_values = [float(w['ghi']) for w in weather_data if w.get('ghi') is not None]
        wind_speeds = [float(w['wind_speed']) for w in weather_data if w.get('wind_speed') is not None]
        
        if len(ghi_values) == 0 and len(wind_speeds) == 0:
            return {
                "site_id": site_id,
                "error": "No usable weather data",
                "message": "Weather data missing GHI and wind speed values"
            }
        
        # Calculate solar metrics
        solar_analysis = {}
        if len(ghi_values) > 0:
            avg_ghi = sum(ghi_values) / len(ghi_values)
            max_ghi = max(ghi_values)
            min_ghi = min(ghi_values)
            
            # Estimate solar capacity factor
            # Typical solar panel efficiency: ~20%, standard test conditions: 1000 W/m²
            # Capacity factor = (actual output / max possible output)
            # Simplified: CF ≈ (avg_ghi / 1000) * efficiency * availability
            solar_efficiency = 0.20  # 20% panel efficiency
            solar_availability = 0.95  # 95% availability (accounting for maintenance)
            estimated_capacity_factor = (avg_ghi / 1000.0) * solar_efficiency * solar_availability * 100
            
            # Annual energy generation (kWh)
            # Assuming the data period represents typical conditions
            data_days = len(weather_data) / 24.0 if len(weather_data) > 0 else 1
            daily_avg_ghi = avg_ghi
            annual_ghi_kwh_per_m2 = (daily_avg_ghi * 365) / 1000.0  # Convert W/m² to kWh/m²
            annual_energy_kwh = (annual_ghi_kwh_per_m2 * solar_efficiency * capacity_mw * 1000 * 1000) / 1000.0  # Convert to kWh
            
            solar_analysis = {
                "avg_ghi_w_per_m2": round(avg_ghi, 2),
                "max_ghi_w_per_m2": round(max_ghi, 2),
                "min_ghi_w_per_m2": round(min_ghi, 2),
                "estimated_capacity_factor_percent": round(estimated_capacity_factor, 2),
                "annual_energy_gwh": round(annual_energy_kwh / 1000000.0, 2),
                "solar_resource_class": (
                    "Excellent" if avg_ghi > 200 else
                    "Good" if avg_ghi > 150 else
                    "Fair" if avg_ghi > 100 else
                    "Poor"
                )
            }
        
        # Calculate wind metrics
        wind_analysis = {}
        if len(wind_speeds) > 0:
            avg_wind_speed = sum(wind_speeds) / len(wind_speeds)
            max_wind_speed = max(wind_speeds)
            min_wind_speed = min(wind_speeds)
            
            # Estimate wind capacity factor using power curve approximation
            # Typical wind turbine: cut-in ~3 m/s, rated ~12 m/s, cut-out ~25 m/s
            # Simplified capacity factor estimation
            def estimate_wind_cf(wind_speed):
                if wind_speed < 3:
                    return 0.0
                elif wind_speed < 12:
                    # Between cut-in and rated: cubic relationship
                    return ((wind_speed / 12.0) ** 3) * 100
                elif wind_speed < 25:
                    return 100.0  # At rated power
                else:
                    return 0.0  # Cut-out
            
            hourly_cfs = [estimate_wind_cf(ws) for ws in wind_speeds]
            estimated_capacity_factor = sum(hourly_cfs) / len(hourly_cfs) if hourly_cfs else 0
            
            # Annual energy generation
            data_days = len(weather_data) / 24.0 if len(weather_data) > 0 else 1
            annual_energy_kwh = (capacity_mw * 1000 * 24 * 365 * estimated_capacity_factor / 100.0)
            
            wind_analysis = {
                "avg_wind_speed_m_per_s": round(avg_wind_speed, 2),
                "max_wind_speed_m_per_s": round(max_wind_speed, 2),
                "min_wind_speed_m_per_s": round(min_wind_speed, 2),
                "estimated_capacity_factor_percent": round(estimated_capacity_factor, 2),
                "annual_energy_gwh": round(annual_energy_kwh / 1000000.0, 2),
                "wind_resource_class": (
                    "Excellent" if avg_wind_speed > 7.5 else
                    "Good" if avg_wind_speed > 6.5 else
                    "Fair" if avg_wind_speed > 5.5 else
                    "Poor"
                )
            }
        
        # Financial analysis
        financial_analysis = {}
        
        # Solar financials
        if solar_analysis:
            solar_capex = capacity_mw * solar_capex_per_mw
            solar_annual_revenue = (solar_analysis['annual_energy_gwh'] * 1000) * (energy_price_per_mwh / 1000.0)
            solar_lcoe = (solar_capex * 0.08) / (solar_analysis['annual_energy_gwh'] * 1000) if solar_analysis['annual_energy_gwh'] > 0 else float('inf')
            solar_payback_years = solar_capex / solar_annual_revenue if solar_annual_revenue > 0 else float('inf')
            
            financial_analysis['solar'] = {
                "capex_usd": round(solar_capex, 2),
                "annual_revenue_usd": round(solar_annual_revenue, 2),
                "lcoe_usd_per_mwh": round(solar_lcoe, 2),
                "payback_years": round(solar_payback_years, 1),
                "npv_20yr_usd": round((solar_annual_revenue * 20) - solar_capex, 2)
            }
        
        # Wind financials
        if wind_analysis:
            wind_capex = capacity_mw * wind_capex_per_mw
            wind_annual_revenue = (wind_analysis['annual_energy_gwh'] * 1000) * (energy_price_per_mwh / 1000.0)
            wind_lcoe = (wind_capex * 0.08) / (wind_analysis['annual_energy_gwh'] * 1000) if wind_analysis['annual_energy_gwh'] > 0 else float('inf')
            wind_payback_years = wind_capex / wind_annual_revenue if wind_annual_revenue > 0 else float('inf')
            
            financial_analysis['wind'] = {
                "capex_usd": round(wind_capex, 2),
                "annual_revenue_usd": round(wind_annual_revenue, 2),
                "lcoe_usd_per_mwh": round(wind_lcoe, 2),
                "payback_years": round(wind_payback_years, 1),
                "npv_20yr_usd": round((wind_annual_revenue * 20) - wind_capex, 2)
            }
        
        # Hybrid analysis (50/50 split)
        hybrid_analysis = {}
        if solar_analysis and wind_analysis:
            hybrid_capex = (capacity_mw * 0.5 * solar_capex_per_mw) + (capacity_mw * 0.5 * wind_capex_per_mw)
            hybrid_annual_revenue = (
                (solar_analysis['annual_energy_gwh'] * 0.5 * 1000) * (energy_price_per_mwh / 1000.0) +
                (wind_analysis['annual_energy_gwh'] * 0.5 * 1000) * (energy_price_per_mwh / 1000.0)
            )
            hybrid_annual_energy = (solar_analysis['annual_energy_gwh'] * 0.5) + (wind_analysis['annual_energy_gwh'] * 0.5)
            hybrid_lcoe = (hybrid_capex * 0.08) / (hybrid_annual_energy * 1000) if hybrid_annual_energy > 0 else float('inf')
            hybrid_payback_years = hybrid_capex / hybrid_annual_revenue if hybrid_annual_revenue > 0 else float('inf')
            
            hybrid_analysis = {
                "capex_usd": round(hybrid_capex, 2),
                "annual_revenue_usd": round(hybrid_annual_revenue, 2),
                "annual_energy_gwh": round(hybrid_annual_energy, 2),
                "lcoe_usd_per_mwh": round(hybrid_lcoe, 2),
                "payback_years": round(hybrid_payback_years, 1),
                "npv_20yr_usd": round((hybrid_annual_revenue * 20) - hybrid_capex, 2)
            }
        
        # Determine recommendation
        recommendations = {
            "recommended_technology": "unknown",
            "confidence": "low",
            "reasoning": []
        }
        
        if solar_analysis and wind_analysis:
            # Compare technologies
            solar_score = 0
            wind_score = 0
            
            # Capacity factor comparison
            if solar_analysis['estimated_capacity_factor_percent'] > wind_analysis['estimated_capacity_factor_percent']:
                solar_score += 2
                recommendations['reasoning'].append("Solar has higher capacity factor")
            else:
                wind_score += 2
                recommendations['reasoning'].append("Wind has higher capacity factor")
            
            # Financial comparison
            if financial_analysis.get('solar', {}).get('lcoe_usd_per_mwh', float('inf')) < financial_analysis.get('wind', {}).get('lcoe_usd_per_mwh', float('inf')):
                solar_score += 2
                recommendations['reasoning'].append("Solar has lower LCOE")
            else:
                wind_score += 2
                recommendations['reasoning'].append("Wind has lower LCOE")
            
            # Resource quality
            if solar_analysis['solar_resource_class'] in ['Excellent', 'Good']:
                solar_score += 1
            if wind_analysis['wind_resource_class'] in ['Excellent', 'Good']:
                wind_score += 1
            
            # Payback period
            solar_payback = financial_analysis.get('solar', {}).get('payback_years', float('inf'))
            wind_payback = financial_analysis.get('wind', {}).get('payback_years', float('inf'))
            if solar_payback < wind_payback and solar_payback < 15:
                solar_score += 1
            elif wind_payback < solar_payback and wind_payback < 15:
                wind_score += 1
            
            # Hybrid consideration
            if hybrid_analysis and hybrid_analysis.get('lcoe_usd_per_mwh', float('inf')) < min(
                financial_analysis.get('solar', {}).get('lcoe_usd_per_mwh', float('inf')),
                financial_analysis.get('wind', {}).get('lcoe_usd_per_mwh', float('inf'))
            ):
                recommendations['recommended_technology'] = "hybrid"
                recommendations['confidence'] = "high" if abs(solar_score - wind_score) <= 1 else "medium"
                recommendations['reasoning'].append("Hybrid offers best financial performance")
            elif solar_score > wind_score:
                recommendations['recommended_technology'] = "solar"
                recommendations['confidence'] = "high" if solar_score >= 4 else "medium"
            else:
                recommendations['recommended_technology'] = "wind"
                recommendations['confidence'] = "high" if wind_score >= 4 else "medium"
        
        elif solar_analysis:
            recommendations['recommended_technology'] = "solar"
            recommendations['confidence'] = "medium"
            recommendations['reasoning'].append("Only solar resource data available")
        elif wind_analysis:
            recommendations['recommended_technology'] = "wind"
            recommendations['confidence'] = "medium"
            recommendations['reasoning'].append("Only wind resource data available")
        
        return {
            "site_id": site_id,
            "analysis_period_days": days,
            "data_points_analyzed": len(weather_data),
            "solar_analysis": solar_analysis,
            "wind_analysis": wind_analysis,
            "hybrid_analysis": hybrid_analysis,
            "financial_analysis": financial_analysis,
            "recommendations": recommendations,
            "assumptions": {
                "energy_price_per_mwh": energy_price_per_mwh,
                "solar_capex_per_mw": solar_capex_per_mw,
                "wind_capex_per_mw": wind_capex_per_mw,
                "solar_efficiency": 0.20,
                "solar_availability": 0.95,
                "discount_rate": 0.08
            }
        }


# WebSocket for real-time updates
@app.websocket("/api/v1/ws/forecast")
async def websocket_forecast(websocket: WebSocket):
    """WebSocket for real-time forecast updates"""
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_json()
            site_id = data.get('site_id')
            
            # Subscribe to forecast updates
            # In production, use Redis pub/sub or similar
            await websocket.send_json({
                "type": "forecast_update",
                "site_id": site_id,
                "timestamp": datetime.utcnow().isoformat()
            })
            
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")


# Alerts endpoints
@app.post("/api/v1/sites/{site_id}/alerts")
@monitor_request("create_alert")
async def create_alert(
    site_id: str,
    alert: Alert,
    current_user: dict = Depends(get_current_user)
):
    """Create alert configuration"""
    # Verify site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        # Handle severity - convert string to enum value if needed
        severity_value = alert.severity
        if isinstance(severity_value, str):
            # Map string to enum value
            severity_map = {
                'low': 'low',
                'medium': 'medium',
                'high': 'high',
                'critical': 'critical'
            }
            severity_value = severity_map.get(severity_value.lower(), 'medium')
        elif hasattr(severity_value, 'value'):
            severity_value = severity_value.value
        
        # Handle condition - ensure it's a dict
        condition_dict = alert.condition
        if hasattr(condition_dict, 'dict'):
            condition_dict = condition_dict.dict()
        elif not isinstance(condition_dict, dict):
            condition_dict = dict(condition_dict) if condition_dict else {}
        
        alert_id = await conn.fetchval(
            """
            INSERT INTO alerts (site_id, name, description, condition, severity, enabled, created_by)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
            RETURNING id
            """,
            site_id,
            alert.name,
            alert.description,
            json.dumps(condition_dict),
            severity_value,
            alert.enabled,
            current_user['id']
        )
        
        return {"id": str(alert_id), "status": "created"}


@app.get("/api/v1/sites/{site_id}/alerts")
@monitor_request("get_alerts")
async def get_alerts(
    site_id: str,
    status: str = "active",  # active, all, resolved
    current_user: dict = Depends(get_current_user)
):
    """Get alerts for a site"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Verify site access
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        if status == "active":
            # Get active alerts (with unresolved events)
            alerts = await conn.fetch(
                """
                SELECT DISTINCT
                    a.id,
                    a.site_id,
                    a.name,
                    a.description,
                    a.condition,
                    a.severity,
                    a.enabled,
                    a.last_triggered,
                    a.created_at,
                    a.created_by,
                    MAX(ae.triggered_at) as last_event_time,
                    COUNT(CASE WHEN ae.resolved_at IS NULL THEN 1 END) as active_event_count
                FROM alerts a
                LEFT JOIN alert_events ae ON a.id = ae.alert_id
                WHERE a.site_id = $1
                AND a.enabled = TRUE
                GROUP BY a.id
                HAVING COUNT(CASE WHEN ae.resolved_at IS NULL THEN 1 END) > 0
                ORDER BY a.severity DESC, last_event_time DESC
                """,
                site_id
            )
        else:
            # Get all alerts
            alerts = await conn.fetch(
                """
                SELECT * FROM alerts 
                WHERE site_id = $1 
                ORDER BY created_at DESC
                """,
                site_id
            )
        
        # Format response with relative timestamps
        result = []
        now = datetime.utcnow()
        for alert in alerts:
            alert_dict = dict(alert)
            if alert_dict.get('last_triggered'):
                delta = now - alert_dict['last_triggered']
                if delta.total_seconds() < 60:
                    alert_dict['last_triggered_relative'] = f"{int(delta.total_seconds())} seconds ago"
                elif delta.total_seconds() < 3600:
                    alert_dict['last_triggered_relative'] = f"{int(delta.total_seconds() / 60)} minutes ago"
                elif delta.total_seconds() < 86400:
                    alert_dict['last_triggered_relative'] = f"{int(delta.total_seconds() / 3600)} hours ago"
                else:
                    alert_dict['last_triggered_relative'] = f"{int(delta.total_seconds() / 86400)} days ago"
            result.append(alert_dict)
        
        return {
            "site_id": site_id,
            "alerts": result,
            "summary": {
                "total": len(result),
                "critical": len([a for a in result if a.get('severity') == 'critical']),
                "warning": len([a for a in result if a.get('severity') in ['high', 'medium']]),
                "info": len([a for a in result if a.get('severity') == 'low']),
            }
        }


@app.put("/api/v1/alerts/{alert_id}")
@monitor_request("update_alert")
async def update_alert(
    alert_id: str,
    alert_update: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update alert configuration"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Verify alert ownership through site
        alert = await conn.fetchrow(
            """
            SELECT a.*, s.tenant_id
            FROM alerts a
            INNER JOIN sites s ON a.site_id = s.id
            WHERE a.id = $1
            """,
            alert_id
        )
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        if alert['tenant_id'] != current_user['tenant_id']:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Build update query
        update_fields = []
        update_values = []
        param_index = 1
        
        if 'name' in alert_update:
            update_fields.append(f"name = ${param_index}")
            update_values.append(alert_update['name'])
            param_index += 1
        
        if 'description' in alert_update:
            update_fields.append(f"description = ${param_index}")
            update_values.append(alert_update['description'])
            param_index += 1
        
        if 'condition' in alert_update:
            update_fields.append(f"condition = ${param_index}::jsonb")
            update_values.append(json.dumps(alert_update['condition']))
            param_index += 1
        
        if 'severity' in alert_update:
            update_fields.append(f"severity = ${param_index}")
            update_values.append(alert_update['severity'])
            param_index += 1
        
        if 'enabled' in alert_update:
            update_fields.append(f"enabled = ${param_index}")
            update_values.append(alert_update['enabled'])
            param_index += 1
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        update_values.append(alert_id)
        
        query = f"""
            UPDATE alerts
            SET {', '.join(update_fields)}
            WHERE id = ${param_index}
            RETURNING *
        """
        
        updated_alert = await conn.fetchrow(query, *update_values)
        return dict(updated_alert)


@app.delete("/api/v1/alerts/{alert_id}")
@monitor_request("delete_alert")
async def delete_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete alert configuration"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Verify alert ownership
        alert = await conn.fetchrow(
            """
            SELECT a.*, s.tenant_id
            FROM alerts a
            INNER JOIN sites s ON a.site_id = s.id
            WHERE a.id = $1
            """,
            alert_id
        )
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        if alert['tenant_id'] != current_user['tenant_id']:
            raise HTTPException(status_code=403, detail="Access denied")
        
        await conn.execute("DELETE FROM alerts WHERE id = $1", alert_id)
        return {"status": "deleted", "id": alert_id}


@app.post("/api/v1/alerts/{alert_id}/acknowledge")
@monitor_request("acknowledge_alert")
async def acknowledge_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Acknowledge an alert event"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        # Verify alert ownership
        alert = await conn.fetchrow(
            """
            SELECT a.*, s.tenant_id
            FROM alerts a
            INNER JOIN sites s ON a.site_id = s.id
            WHERE a.id = $1
            """,
            alert_id
        )
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        if alert['tenant_id'] != current_user['tenant_id']:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Resolve all unresolved events for this alert
        await conn.execute(
            """
            UPDATE alert_events
            SET resolved_at = NOW()
            WHERE alert_id = $1
            AND resolved_at IS NULL
            """,
            alert_id
        )
        
        return {"status": "acknowledged", "alert_id": alert_id}


@app.get("/api/v1/alerts/events")
@monitor_request("get_alert_events")
async def get_alert_events(
    site_id: Optional[str] = None,
    alert_id: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get alert events"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    async with db_pool.acquire() as conn:
        query = """
            SELECT 
                ae.*,
                a.name as alert_name,
                a.site_id,
                s.name as site_name
            FROM alert_events ae
            INNER JOIN alerts a ON ae.alert_id = a.id
            INNER JOIN sites s ON a.site_id = s.id
            WHERE s.tenant_id = $1
        """
        params = [current_user['tenant_id']]
        param_index = 2
        
        if site_id:
            query += f" AND a.site_id = ${param_index}"
            params.append(site_id)
            param_index += 1
        
        if alert_id:
            query += f" AND ae.alert_id = ${param_index}"
            params.append(alert_id)
            param_index += 1
        
        if resolved is not None:
            if resolved:
                query += f" AND ae.resolved_at IS NOT NULL"
            else:
                query += f" AND ae.resolved_at IS NULL"
        
        query += f" ORDER BY ae.triggered_at DESC LIMIT ${param_index}"
        params.append(limit)
        
        events = await conn.fetch(query, *params)
        return [dict(event) for event in events]


@app.get("/api/v1/sites/{site_id}/forecast/export")
@monitor_request("export_forecast")
async def export_forecast(
    site_id: str,
    format: str = "csv",  # csv, json
    horizon: str = "24h",
    current_user: dict = Depends(get_current_user)
):
    """
    Export forecast data for a site
    
    Returns forecast data in CSV or JSON format
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Verify site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Get forecast
    horizon_hours = int(horizon.replace('h', '').replace('d', '')) * (24 if 'd' in horizon else 1)
    
    try:
        from services.forecasting.forecast_service import forecast_service
        
        site_dict = dict(site)
        # Parse JSONB fields
        if isinstance(site_dict.get('pv_params'), str):
            import json
            try:
                site_dict['pv_params'] = json.loads(site_dict['pv_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['pv_params'] = None
        if isinstance(site_dict.get('turbine_params'), str):
            import json
            try:
                site_dict['turbine_params'] = json.loads(site_dict['turbine_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['turbine_params'] = None
        
        # Get appropriate forecast based on site type
        site_type = site_dict.get('type', 'solar').lower()
        if site_type == 'wind':
            forecast = await forecast_service.generate_wind_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        else:
            forecast = await forecast_service.generate_solar_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        
        if format.lower() == "csv":
            # Generate CSV
            import csv
            import io
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Header
            writer.writerow(['timestamp', 'predicted_power_kw', 'p10', 'p50', 'p90'])
            
            # Data rows
            for point in forecast.get('values', []):
                writer.writerow([
                    point.get('timestamp', ''),
                    point.get('predicted_power_kw', ''),
                    point.get('p10', ''),
                    point.get('p50', ''),
                    point.get('p90', ''),
                ])
            
            csv_content = output.getvalue()
            output.close()
            
            filename = f"forecast_{site_id}_{horizon}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
            
            return Response(
                content=csv_content,
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )
        else:
            # JSON format
            filename = f"forecast_{site_id}_{horizon}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            
            return Response(
                content=json.dumps({
                    "site_id": site_id,
                    "horizon": horizon,
                    "exported_at": datetime.utcnow().isoformat(),
                    "data": forecast.get('values', [])
                }, indent=2),
                media_type="application/json",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )
    except Exception as e:
        logger.error("Error exporting forecast", exc_info=e, site_id=site_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export forecast: {str(e)}"
        )


@app.get("/api/v1/sites/{site_id}/production/export")
@monitor_request("export_production")
async def export_production(
    site_id: str,
    format: str = "csv",  # csv, json
    start: Optional[str] = None,  # ISO format date
    end: Optional[str] = None,  # ISO format date
    current_user: dict = Depends(get_current_user)
):
    """
    Export production history for a site
    
    Returns production data in CSV or JSON format
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Verify site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        # Parse date range
        if start:
            start_date = datetime.fromisoformat(start.replace('Z', '+00:00'))
        else:
            start_date = datetime.utcnow() - timedelta(days=7)
        
        if end:
            end_date = datetime.fromisoformat(end.replace('Z', '+00:00'))
        else:
            end_date = datetime.utcnow()
        
        # Get production data
        production_data = await conn.fetch(
            """
            SELECT time, power_kw, energy_kwh, availability, curtailed_kw
            FROM production_actuals
            WHERE site_id = $1
            AND time >= $2
            AND time <= $3
            ORDER BY time ASC
            """,
            site_id,
            start_date,
            end_date
        )
        
        if format.lower() == "csv":
            import csv
            import io
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Header
            writer.writerow(['timestamp', 'power_kw', 'energy_kwh', 'availability', 'curtailed_kw'])
            
            # Data rows
            for row in production_data:
                writer.writerow([
                    row['time'].isoformat() if row['time'] else '',
                    float(row['power_kw']) if row['power_kw'] else '',
                    float(row['energy_kwh']) if row['energy_kwh'] else '',
                    float(row['availability']) if row['availability'] else '',
                    float(row['curtailed_kw']) if row['curtailed_kw'] else '',
                ])
            
            csv_content = output.getvalue()
            output.close()
            
            filename = f"production_{site_id}_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.csv"
            
            return Response(
                content=csv_content,
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )
        else:
            # JSON format
            filename = f"production_{site_id}_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.json"
            
            return Response(
                content=json.dumps({
                    "site_id": site_id,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "exported_at": datetime.utcnow().isoformat(),
                    "data": [
                        {
                            "timestamp": row['time'].isoformat() if row['time'] else None,
                            "power_kw": float(row['power_kw']) if row['power_kw'] else None,
                            "energy_kwh": float(row['energy_kwh']) if row['energy_kwh'] else None,
                            "availability": float(row['availability']) if row['availability'] else None,
                            "curtailed_kw": float(row['curtailed_kw']) if row['curtailed_kw'] else None,
                        }
                        for row in production_data
                    ]
                }, indent=2),
                media_type="application/json",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )


# Forecast Accuracy Metrics Endpoints
@app.get("/api/v1/sites/{site_id}/forecast/accuracy")
@monitor_request("get_forecast_accuracy")
async def get_forecast_accuracy(
    site_id: str,
    days: int = 30,
    horizon: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get forecast accuracy metrics (MAE, RMSE, MAPE, Bias) for a site
    
    Args:
        site_id: Site ID
        days: Number of days to analyze (default: 30)
        horizon: Forecast horizon filter (e.g., "24h", "48h", "7d", "30d")
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Calculate accuracy metrics
    start_time = datetime.utcnow() - timedelta(days=days)
    
    async with db_pool.acquire() as conn:
        # Query forecast accuracy data
        query = """
            SELECT 
                target_time,
                actual_power_kw,
                predicted_power_kw,
                error_kw,
                absolute_error_kw,
                squared_error_kw,
                percentage_error
            FROM forecast_accuracy
            WHERE site_id = $1
            AND target_time >= $2
            ORDER BY target_time DESC
        """
        
        accuracy_data = await conn.fetch(query, site_id, start_time)
        
        if not accuracy_data or len(accuracy_data) == 0:
            return {
                "site_id": site_id,
                "period_days": days,
                "horizon": horizon,
                "data_points": 0,
                "mae": None,
                "rmse": None,
                "mape": None,
                "bias": None,
                "accuracy_score": None,
                "message": "No accuracy data available"
            }
        
        # Calculate metrics
        errors = [float(row['error_kw']) for row in accuracy_data if row['error_kw'] is not None]
        abs_errors = [float(row['absolute_error_kw']) for row in accuracy_data if row['absolute_error_kw'] is not None]
        sq_errors = [float(row['squared_error_kw']) for row in accuracy_data if row['squared_error_kw'] is not None]
        pct_errors = [abs(float(row['percentage_error'])) for row in accuracy_data if row['percentage_error'] is not None]
        
        # MAE (Mean Absolute Error)
        mae = sum(abs_errors) / len(abs_errors) if abs_errors else None
        
        # RMSE (Root Mean Square Error)
        rmse = (sum(sq_errors) / len(sq_errors)) ** 0.5 if sq_errors else None
        
        # MAPE (Mean Absolute Percentage Error)
        mape = sum(pct_errors) / len(pct_errors) if pct_errors else None
        
        # Bias (Mean Error - positive = over-forecast, negative = under-forecast)
        bias = sum(errors) / len(errors) if errors else None
        
        # Accuracy score (0-100, higher is better)
        # Based on MAPE: 0% MAPE = 100 score, 50% MAPE = 0 score
        accuracy_score = max(0, min(100, 100 - (mape * 2))) if mape is not None else None
        
        # Calculate accuracy by time horizon if needed
        accuracy_by_horizon = {}
        if horizon:
            # Group by forecast horizon (simplified - would need forecast_time in accuracy table)
            pass
        
        # Recent accuracy trends (last 7 days vs last 30 days)
        recent_cutoff = datetime.utcnow() - timedelta(days=7)
        recent_data = [row for row in accuracy_data if row['target_time'] >= recent_cutoff]
        
        recent_mae = None
        recent_rmse = None
        recent_mape = None
        if recent_data:
            recent_abs_errors = [float(row['absolute_error_kw']) for row in recent_data if row['absolute_error_kw'] is not None]
            recent_sq_errors = [float(row['squared_error_kw']) for row in recent_data if row['squared_error_kw'] is not None]
            recent_pct_errors = [abs(float(row['percentage_error'])) for row in recent_data if row['percentage_error'] is not None]
            
            if recent_abs_errors:
                recent_mae = sum(recent_abs_errors) / len(recent_abs_errors)
            if recent_sq_errors:
                recent_rmse = (sum(recent_sq_errors) / len(recent_sq_errors)) ** 0.5
            if recent_pct_errors:
                recent_mape = sum(recent_pct_errors) / len(recent_pct_errors)
        
        return {
            "site_id": site_id,
            "period_days": days,
            "horizon": horizon,
            "data_points": len(accuracy_data),
            "mae": round(mae, 2) if mae is not None else None,
            "rmse": round(rmse, 2) if rmse is not None else None,
            "mape": round(mape, 2) if mape is not None else None,
            "bias": round(bias, 2) if bias is not None else None,
            "accuracy_score": round(accuracy_score, 1) if accuracy_score is not None else None,
            "recent_7d": {
                "mae": round(recent_mae, 2) if recent_mae is not None else None,
                "rmse": round(recent_rmse, 2) if recent_rmse is not None else None,
                "mape": round(recent_mape, 2) if recent_mape is not None else None,
            },
            "accuracy_trend": "improving" if (recent_mape and mape and recent_mape < mape) else "degrading" if (recent_mape and mape and recent_mape > mape) else "stable"
        }


@app.get("/api/v1/sites/{site_id}/forecast/accuracy/trends")
@monitor_request("get_forecast_accuracy_trends")
async def get_forecast_accuracy_trends(
    site_id: str,
    days: int = 90,
    current_user: dict = Depends(get_current_user)
):
    """
    Get forecast accuracy trends over time (for charting)
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    start_time = datetime.utcnow() - timedelta(days=days)
    
    async with db_pool.acquire() as conn:
        # Get daily aggregated accuracy metrics
        query = """
            SELECT 
                DATE(target_time) as date,
                COUNT(*) as data_points,
                AVG(absolute_error_kw) as avg_mae,
                SQRT(AVG(squared_error_kw)) as avg_rmse,
                AVG(ABS(percentage_error)) as avg_mape,
                AVG(error_kw) as avg_bias
            FROM forecast_accuracy
            WHERE site_id = $1
            AND target_time >= $2
            GROUP BY DATE(target_time)
            ORDER BY date ASC
        """
        
        trends = await conn.fetch(query, site_id, start_time)
        
        return {
            "site_id": site_id,
            "period_days": days,
            "trends": [
                {
                    "date": row['date'].isoformat() if row['date'] else None,
                    "data_points": row['data_points'],
                    "mae": round(float(row['avg_mae']), 2) if row['avg_mae'] else None,
                    "rmse": round(float(row['avg_rmse']), 2) if row['avg_rmse'] else None,
                    "mape": round(float(row['avg_mape']), 2) if row['avg_mape'] else None,
                    "bias": round(float(row['avg_bias']), 2) if row['avg_bias'] else None,
                }
                for row in trends
            ]
        }


# Current Weather Endpoint
@app.get("/api/v1/sites/{site_id}/weather/current")
@monitor_request("get_current_weather")
async def get_current_weather(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get current weather conditions at the site location
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Get current weather from OpenWeather API
    try:
        from services.forecasting.weather.openweather import OpenWeatherClient
        
        openweather_client = OpenWeatherClient(
            cache_manager=global_cache_manager,
            db_pool=db_pool
        )
        
        weather_data = await openweather_client.get_current_weather(
            latitude=float(site['latitude']),
            longitude=float(site['longitude']),
            site_id=site_id
        )
        
        if not weather_data:
            # Return a more informative error or empty data
            logger.warning(f"OpenWeather API returned no data for site {site_id}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Weather data not available. Please check OpenWeather API configuration."
            )
        
        # Convert to our format
        main = weather_data.get('main', {})
        wind = weather_data.get('wind', {})
        clouds = weather_data.get('clouds', {})
        weather_main = weather_data.get('weather', [{}])[0] if weather_data.get('weather') else {}
        rain = weather_data.get('rain', {})
        snow = weather_data.get('snow', {})
        
        # Estimate GHI from cloud cover
        cloud_cover = clouds.get('all', 0) or 0
        hour = datetime.utcnow().hour
        daylight_factor = 1.0 if 6 <= hour <= 18 else 0.1
        estimated_ghi = max(0, 1000 * (1 - cloud_cover / 100) * daylight_factor)
        
        return {
            "site_id": site_id,
            "timestamp": datetime.utcnow().isoformat(),
            "temperature": main.get('temp'),
            "feels_like": main.get('feels_like'),
            "humidity": main.get('humidity'),
            "pressure": main.get('pressure'),
            "wind_speed": wind.get('speed'),
            "wind_direction": wind.get('deg'),
            "wind_gust": wind.get('gust'),
            "cloud_cover": cloud_cover,
            "precipitation": rain.get('1h', 0) or rain.get('3h', 0) or snow.get('1h', 0) or snow.get('3h', 0) or 0,
            "ghi_estimated": round(estimated_ghi, 2),
            "visibility": weather_data.get('visibility'),
            "weather_main": weather_main.get('main'),
            "weather_description": weather_main.get('description'),
            "weather_icon": weather_main.get('icon'),
            "uv_index": weather_data.get('uvi'),
        }
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error("Error fetching current weather", exc_info=e, site_id=site_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching weather data: {str(e)}"
        )


# Weather Forecast Overlay Endpoint
@app.get("/api/v1/sites/{site_id}/weather/forecast")
@monitor_request("get_weather_forecast")
async def get_weather_forecast(
    site_id: str,
    hours: int = 48,
    current_user: dict = Depends(get_current_user)
):
    """
    Get weather forecast aligned with power forecast timeline
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Get weather forecast from OpenWeather API
    try:
        from services.forecasting.weather.openweather import OpenWeatherClient
        
        openweather_client = OpenWeatherClient(
            cache_manager=global_cache_manager,
            db_pool=db_pool
        )
        
        forecast_data = await openweather_client.get_forecast(
            latitude=float(site['latitude']),
            longitude=float(site['longitude']),
            hours=hours,
            site_id=site_id
        )
        
        if not forecast_data:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Weather forecast not available"
            )
        
        # Convert to our format
        weather_forecast = []
        for item in forecast_data:
            main = item.get('main', {})
            wind = item.get('wind', {})
            clouds = item.get('clouds', {})
            weather_main = item.get('weather', [{}])[0] if item.get('weather') else {}
            rain = item.get('rain', {})
            snow = item.get('snow', {})
            
            # Estimate GHI
            cloud_cover = clouds.get('all', 0) or 0
            dt = datetime.fromtimestamp(item['dt'], tz=pytz.utc)
            hour = dt.hour
            daylight_factor = 1.0 if 6 <= hour <= 18 else 0.1
            estimated_ghi = max(0, 1000 * (1 - cloud_cover / 100) * daylight_factor)
            
            weather_forecast.append({
                "timestamp": dt.isoformat(),
                "temperature": main.get('temp'),
                "feels_like": main.get('feels_like'),
                "humidity": main.get('humidity'),
                "pressure": main.get('pressure'),
                "wind_speed": wind.get('speed'),
                "wind_direction": wind.get('deg'),
                "wind_gust": wind.get('gust'),
                "cloud_cover": cloud_cover,
                "precipitation": rain.get('3h', 0) or rain.get('1h', 0) or snow.get('3h', 0) or snow.get('1h', 0) or 0,
                "ghi_estimated": round(estimated_ghi, 2),
                "weather_main": weather_main.get('main'),
                "weather_description": weather_main.get('description'),
                "weather_icon": weather_main.get('icon'),
            })
        
        return {
            "site_id": site_id,
            "forecast_hours": hours,
            "data_points": len(weather_forecast),
            "forecast": weather_forecast
        }
    except Exception as e:
        logger.error("Error fetching weather forecast", exc_info=e, site_id=site_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching weather forecast"
            )


# Production Scheduling & Optimization Endpoints
@app.get("/api/v1/sites/{site_id}/forecast/scheduling")
@monitor_request("get_forecast_scheduling")
async def get_forecast_scheduling(
    site_id: str,
    horizon: str = "24h",
    current_user: dict = Depends(get_current_user)
):
    """
    Get production scheduling recommendations based on forecast
    
    Returns:
    - Optimal dispatch schedule
    - Peak production periods
    - Maintenance window suggestions
    - Revenue optimization recommendations
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Parse horizon - handle both hours (24h, 48h) and days (7d, 30d)
    horizon_hours = 24  # default
    if horizon.endswith('h'):
        horizon_hours = int(horizon.replace('h', ''))
    elif horizon.endswith('d'):
        horizon_days = int(horizon.replace('d', ''))
        horizon_hours = horizon_days * 24
    else:
        # Try to parse as integer (assume hours)
        try:
            horizon_hours = int(horizon)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid horizon format: {horizon}. Use '24h', '48h', '7d', or '30d'")
    
    # Get forecast
    try:
        from services.forecasting.forecast_service import forecast_service
        
        site_dict = dict(site)
        if isinstance(site_dict.get('pv_params'), str):
            import json
            try:
                site_dict['pv_params'] = json.loads(site_dict['pv_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['pv_params'] = None
        if isinstance(site_dict.get('turbine_params'), str):
            import json
            try:
                site_dict['turbine_params'] = json.loads(site_dict['turbine_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['turbine_params'] = None
        
        site_type = site_dict.get('type', 'solar').lower()
        if site_type == 'wind':
            forecast = await forecast_service.generate_wind_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        else:
            forecast = await forecast_service.generate_solar_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        
        # Analyze forecast for scheduling recommendations
        if not forecast or 'values' not in forecast:
            logger.warning(f"Invalid forecast data for site {site_id} in scheduling endpoint")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid forecast data returned"
            )
        
        forecast_values = forecast.get('values', [])
        if isinstance(forecast_values, list) and len(forecast_values) > 0:
            # Extract power values
            if isinstance(forecast_values[0], dict):
                powers = [float(v.get('predicted_power_kw', v.get('p50_kw', 0))) for v in forecast_values]
                timestamps = [v.get('timestamp') for v in forecast_values]
            else:
                powers = [float(v) for v in forecast_values]
                timestamps = forecast.get('timestamps', [])
        else:
            powers = []
            timestamps = []
        
        capacity_kw = float(site.get('capacity_mw', 0)) * 1000
        
        if not powers:
            return {
                "site_id": site_id,
                "horizon": horizon,
                "recommendations": [],
                "peak_periods": [],
                "maintenance_windows": [],
                "message": "Insufficient forecast data"
            }
        
        # Find peak production periods (top 20% of forecast)
        power_with_time = list(zip(powers, timestamps))
        power_with_time.sort(key=lambda x: x[0], reverse=True)
        peak_threshold = sorted(powers, reverse=True)[int(len(powers) * 0.2)] if len(powers) > 0 else 0
        peak_periods = [
            {"timestamp": ts, "power_kw": p, "capacity_factor": (p / capacity_kw * 100) if capacity_kw > 0 else 0}
            for p, ts in power_with_time if p >= peak_threshold
        ][:10]  # Top 10 peak periods
        
        # Find low production periods (bottom 20% - good for maintenance)
        low_threshold = sorted(powers)[int(len(powers) * 0.2)] if len(powers) > 0 else 0
        maintenance_windows = [
            {"timestamp": ts, "power_kw": p, "capacity_factor": (p / capacity_kw * 100) if capacity_kw > 0 else 0}
            for p, ts in power_with_time if p <= low_threshold
        ][:10]  # Top 10 maintenance windows
        
        # Calculate average production
        avg_power = sum(powers) / len(powers) if powers else 0
        
        # Generate recommendations
        recommendations = []
        
        # Peak production recommendation
        if peak_periods:
            recommendations.append({
                "type": "peak_production",
                "priority": "high",
                "title": "Peak Production Periods Identified",
                "description": f"Top {len(peak_periods)} peak production periods identified. Consider maximizing dispatch during these times.",
                "action": "Schedule maximum dispatch during peak periods",
                "impact": "High revenue potential"
            })
        
        # Maintenance recommendation
        if maintenance_windows:
            recommendations.append({
                "type": "maintenance",
                "priority": "medium",
                "title": "Optimal Maintenance Windows",
                "description": f"{len(maintenance_windows)} low-production periods identified. Ideal for scheduled maintenance.",
                "action": "Schedule maintenance during low production periods",
                "impact": "Minimal revenue loss"
            })
        
        # Variability warning
        if powers:
            power_variance = sum((p - avg_power) ** 2 for p in powers) / len(powers)
            power_std = power_variance ** 0.5
            cv = (power_std / avg_power * 100) if avg_power > 0 else 0
            
            if cv > 30:
                recommendations.append({
                    "type": "variability",
                    "priority": "medium",
                    "title": "High Forecast Variability",
                    "description": f"Forecast shows {cv:.1f}% coefficient of variation. Consider energy storage or flexible dispatch.",
                    "action": "Implement flexible dispatch strategy",
                    "impact": "Reduced revenue risk"
                })
        
        return {
            "site_id": site_id,
            "horizon": horizon,
            "capacity_kw": capacity_kw,
            "average_power_kw": round(avg_power, 2),
            "recommendations": recommendations,
            "peak_periods": peak_periods[:5],  # Top 5
            "maintenance_windows": maintenance_windows[:5],  # Top 5
            "forecast_summary": {
                "max_power_kw": round(max(powers), 2) if powers else 0,
                "min_power_kw": round(min(powers), 2) if powers else 0,
                "total_energy_kwh": round(sum(powers) * (horizon_hours / len(powers)), 2) if powers else 0,
            }
        }
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error("Error generating scheduling recommendations", exc_info=e, site_id=site_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating scheduling recommendations: {str(e)}"
        )


# Interactive Forecast Adjustments Endpoints
@app.post("/api/v1/sites/{site_id}/forecast/adjustments")
@monitor_request("save_forecast_adjustments")
async def save_forecast_adjustments(
    site_id: str,
    adjustments: dict,
    scenario_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Save manual forecast adjustments or scenario
    
    Request body:
    {
        "adjustments": [
            {"timestamp": "2024-01-01T12:00:00Z", "power_kw": 1000, "adjustment_type": "override"},
            ...
        ],
        "scenario_name": "optimistic" | "pessimistic" | "realistic" | custom,
        "notes": "Optional notes"
    }
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        
        # Store adjustments in a JSONB field (we'll use a simple approach - store in Redis or a new table)
        # For now, we'll return the adjusted forecast without persisting
        # In production, you'd want a forecast_adjustments table
        
        adjustments_list = adjustments.get('adjustments', [])
        scenario_name = adjustments.get('scenario_name', scenario_name) or 'custom'
        notes = adjustments.get('notes', '')
        
        # Validate adjustments
        for adj in adjustments_list:
            if 'timestamp' not in adj or 'power_kw' not in adj:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Each adjustment must have 'timestamp' and 'power_kw'"
                )
        
        # Store in Redis for temporary storage (or use a database table)
        cache_key = f"forecast_adjustments:{site_id}:{scenario_name}"
        adjustment_data = {
            "site_id": site_id,
            "scenario_name": scenario_name,
            "adjustments": adjustments_list,
            "notes": notes,
            "created_by": current_user['user_id'],
            "created_at": datetime.utcnow().isoformat(),
        }
        
        if redis_client:
            try:
                import json
                await redis_client.setex(cache_key, 86400, json.dumps(adjustment_data))  # 24 hours
            except Exception as e:
                logger.warning(f"Failed to cache forecast adjustments: {e}")
        
        return {
            "status": "saved",
            "site_id": site_id,
            "scenario_name": scenario_name,
            "adjustments_count": len(adjustments_list),
            "message": "Forecast adjustments saved successfully"
        }


@app.get("/api/v1/sites/{site_id}/forecast/adjustments")
@monitor_request("get_forecast_adjustments")
async def get_forecast_adjustments(
    site_id: str,
    scenario_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get saved forecast adjustments/scenarios"""
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    if not redis_client:
        return {"adjustments": [], "scenarios": []}
    
    try:
        import json
        if scenario_name:
            cache_key = f"forecast_adjustments:{site_id}:{scenario_name}"
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            return {"adjustments": [], "scenario_name": scenario_name}
        else:
            # Get all scenarios for this site
            pattern = f"forecast_adjustments:{site_id}:*"
            keys = await redis_client.keys(pattern)
            scenarios = []
            for key in keys:
                data = await redis_client.get(key)
                if data:
                    scenarios.append(json.loads(data))
            return {"scenarios": scenarios}
    except Exception as e:
        logger.warning(f"Failed to retrieve forecast adjustments: {e}")
        return {"adjustments": [], "scenarios": []}


@app.post("/api/v1/sites/{site_id}/forecast/scenarios")
@monitor_request("create_forecast_scenario")
async def create_forecast_scenario(
    site_id: str,
    scenario: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a forecast scenario (optimistic/pessimistic/realistic)
    
    Request body:
    {
        "scenario_name": "optimistic" | "pessimistic" | "realistic",
        "adjustment_percentage": 10.0,  // Percentage adjustment
        "time_range": {"start": "2024-01-01T12:00:00Z", "end": "2024-01-01T18:00:00Z"},
        "notes": "Optional notes"
    }
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    scenario_name = scenario.get('scenario_name', 'custom')
    adjustment_percentage = scenario.get('adjustment_percentage', 0.0)
    time_range = scenario.get('time_range')
    notes = scenario.get('notes', '')
    
    # Get base forecast
    horizon_hours = 24  # Default, could be parameterized
    try:
        from services.forecasting.forecast_service import forecast_service
        
        site_dict = dict(site)
        if isinstance(site_dict.get('pv_params'), str):
            import json
            try:
                site_dict['pv_params'] = json.loads(site_dict['pv_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['pv_params'] = None
        if isinstance(site_dict.get('turbine_params'), str):
            import json
            try:
                site_dict['turbine_params'] = json.loads(site_dict['turbine_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['turbine_params'] = None
        
        site_type = site_dict.get('type', 'solar').lower()
        if site_type == 'wind':
            base_forecast = await forecast_service.generate_wind_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        else:
            base_forecast = await forecast_service.generate_solar_forecast(
                site=site_dict,
                horizon_hours=horizon_hours
            )
        
        # Apply scenario adjustment
        if base_forecast and 'values' in base_forecast:
            forecast_values = base_forecast.get('values', [])
            adjusted_values = []
            
            for value in forecast_values:
                if isinstance(value, dict):
                    timestamp = value.get('timestamp')
                    power = float(value.get('predicted_power_kw', value.get('p50_kw', 0)))
                    
                    # Check if within time range
                    apply_adjustment = True
                    if time_range:
                        ts = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                        start = datetime.fromisoformat(time_range['start'].replace('Z', '+00:00'))
                        end = datetime.fromisoformat(time_range['end'].replace('Z', '+00:00'))
                        apply_adjustment = start <= ts <= end
                    
                    if apply_adjustment:
                        adjusted_power = power * (1 + adjustment_percentage / 100)
                    else:
                        adjusted_power = power
                    
                    adjusted_value = value.copy()
                    adjusted_value['predicted_power_kw'] = adjusted_power
                    adjusted_value['p50_kw'] = adjusted_power
                    adjusted_values.append(adjusted_value)
            
            scenario_forecast = base_forecast.copy()
            scenario_forecast['values'] = adjusted_values
            scenario_forecast['scenario_name'] = scenario_name
            scenario_forecast['adjustment_percentage'] = adjustment_percentage
            
            # Cache scenario
            cache_key = f"forecast_scenario:{site_id}:{scenario_name}"
            if redis_client:
                try:
                    import json
                    await redis_client.setex(cache_key, 86400, json.dumps(scenario_forecast))
                except Exception as e:
                    logger.warning(f"Failed to cache scenario: {e}")
            
            return {
                "status": "created",
                "site_id": site_id,
                "scenario_name": scenario_name,
                "forecast": scenario_forecast,
                "adjustment_percentage": adjustment_percentage
            }
        else:
            raise HTTPException(status_code=500, detail="Invalid forecast data")
    except Exception as e:
        logger.error("Error creating forecast scenario", exc_info=e, site_id=site_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating forecast scenario"
        )


# AI-Powered Insights Endpoints
@app.get("/api/v1/sites/{site_id}/forecast/insights")
@monitor_request("get_forecast_insights")
async def get_forecast_insights(
    site_id: str,
    horizon: str = "24h",
    current_user: dict = Depends(get_current_user)
):
    """
    Get AI-powered insights for forecast:
    - Anomaly detection
    - Pattern recognition
    - Recommendations
    """
    if not db_pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available"
        )
    
    # Check site access
    async with db_pool.acquire() as conn:
        site = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1 AND tenant_id = $2",
            site_id,
            current_user['tenant_id']
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
    
    # Parse horizon - handle both hours (24h, 48h) and days (7d, 30d)
    if horizon.endswith('h'):
        horizon_hours = int(horizon.replace('h', ''))
    elif horizon.endswith('d'):
        horizon_days = int(horizon.replace('d', ''))
        horizon_hours = horizon_days * 24
    else:
        # Try to parse as integer (assume hours)
        try:
            horizon_hours = int(horizon)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid horizon format: {horizon}. Use '24h', '48h', '7d', or '30d'")
    
    try:
        # Get forecast
        try:
            from services.forecasting.forecast_service import forecast_service
        except ImportError as e:
            logger.error(f"Failed to import forecast_service: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Forecast service not available"
            )
        
        site_dict = dict(site)
        if isinstance(site_dict.get('pv_params'), str):
            import json
            try:
                site_dict['pv_params'] = json.loads(site_dict['pv_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['pv_params'] = None
        if isinstance(site_dict.get('turbine_params'), str):
            import json
            try:
                site_dict['turbine_params'] = json.loads(site_dict['turbine_params'])
            except (json.JSONDecodeError, TypeError):
                site_dict['turbine_params'] = None
        
        site_type = site_dict.get('type', 'solar').lower()
        try:
            if site_type == 'wind':
                forecast = await forecast_service.generate_wind_forecast(
                    site=site_dict,
                    horizon_hours=horizon_hours
                )
            else:
                forecast = await forecast_service.generate_solar_forecast(
                    site=site_dict,
                    horizon_hours=horizon_hours
                )
        except Exception as e:
            logger.error(f"Error generating forecast: {e}", exc_info=e, site_id=site_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error generating forecast: {str(e)}"
            )
        
        if not forecast or 'values' not in forecast:
            logger.warning(f"Invalid forecast data for site {site_id}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid forecast data returned"
            )
        
        forecast_values = forecast.get('values', [])
        if isinstance(forecast_values, list) and len(forecast_values) > 0:
            if isinstance(forecast_values[0], dict):
                powers = [float(v.get('predicted_power_kw', v.get('p50_kw', 0))) for v in forecast_values]
                timestamps = [v.get('timestamp') for v in forecast_values]
            else:
                powers = [float(v) for v in forecast_values]
                timestamps = forecast.get('timestamps', [])
        else:
            powers = []
            timestamps = []
        
        capacity_kw = float(site.get('capacity_mw', 0)) * 1000
        
        insights = []
        anomalies = []
        recommendations = []
        
        if powers:
            # 1. Anomaly Detection
            # Detect sudden drops or spikes
            for i in range(1, len(powers)):
                prev_power = powers[i-1]
                curr_power = powers[i]
                change_pct = ((curr_power - prev_power) / prev_power * 100) if prev_power > 0 else 0
                
                # Flag significant changes (>30% change)
                if abs(change_pct) > 30:
                    anomalies.append({
                        "type": "sudden_change",
                        "severity": "high" if abs(change_pct) > 50 else "medium",
                        "timestamp": timestamps[i] if i < len(timestamps) else None,
                        "change_percentage": round(change_pct, 1),
                        "previous_power_kw": round(prev_power, 1),
                        "current_power_kw": round(curr_power, 1),
                        "message": f"Sudden {'increase' if change_pct > 0 else 'decrease'} of {abs(change_pct):.1f}% detected"
                    })
            
            # 2. Pattern Recognition
            # Check for unusual patterns
            avg_power = sum(powers) / len(powers)
            max_power = max(powers)
            min_power = min(powers)
            power_range = max_power - min_power
            cv = (power_range / avg_power * 100) if avg_power > 0 else 0
            
            if cv > 50:
                insights.append({
                    "type": "high_variability",
                    "severity": "medium",
                    "message": f"High forecast variability detected ({cv:.1f}% coefficient of variation)",
                    "recommendation": "Consider energy storage or flexible dispatch to manage variability"
                })
            
            # Check for low production periods
            low_production_threshold = capacity_kw * 0.2
            low_periods = [i for i, p in enumerate(powers) if p < low_production_threshold]
            if len(low_periods) > len(powers) * 0.3:  # More than 30% of forecast
                insights.append({
                    "type": "extended_low_production",
                    "severity": "medium",
                    "message": f"Extended low production period detected ({len(low_periods)}/{len(powers)} hours below 20% capacity)",
                    "recommendation": "Consider maintenance scheduling or alternative power sources"
                })
            
            # 3. Recommendations
            # Capacity utilization
            avg_capacity_factor = (avg_power / capacity_kw * 100) if capacity_kw > 0 else 0
            if avg_capacity_factor < 30:
                recommendations.append({
                    "type": "low_capacity_utilization",
                    "priority": "medium",
                    "title": "Low Capacity Utilization",
                    "message": f"Average capacity factor is {avg_capacity_factor:.1f}%. Consider site optimization or equipment review.",
                    "action": "Review site configuration and equipment performance"
                })
            
            # Peak production opportunities
            peak_threshold = capacity_kw * 0.8
            peak_periods = [i for i, p in enumerate(powers) if p > peak_threshold]
            if peak_periods:
                recommendations.append({
                    "type": "peak_production_opportunity",
                    "priority": "high",
                    "title": "Peak Production Opportunities",
                    "message": f"{len(peak_periods)} peak production periods identified. Maximize dispatch during these times.",
                    "action": "Schedule maximum dispatch during peak periods"
                })
            
            # Forecast confidence
            if forecast.get('confidenceIntervals'):
                p10 = forecast['confidenceIntervals'].get('p10', [])
                p90 = forecast['confidenceIntervals'].get('p90', [])
                if p10 and p90 and len(p10) > 0:
                    avg_confidence_range = sum([(p90[i] - p10[i]) / powers[i] * 100 for i in range(min(len(p10), len(powers))) if powers[i] > 0]) / len(p10) if p10 else 0
                    if avg_confidence_range > 40:
                        recommendations.append({
                            "type": "high_uncertainty",
                            "priority": "medium",
                            "title": "High Forecast Uncertainty",
                            "message": f"Average confidence range is {avg_confidence_range:.1f}%. Consider additional data sources or model refinement.",
                            "action": "Review forecast model inputs and consider ensemble methods"
                        })
        
        # 4. Historical Comparison Insights
        # Get recent accuracy
        async with db_pool.acquire() as conn:
            recent_accuracy = await conn.fetchrow(
                """
                SELECT 
                    AVG(absolute_error_kw) as mae,
                    AVG(ABS(percentage_error)) as mape
                FROM forecast_accuracy
                WHERE site_id = $1
                AND target_time >= NOW() - INTERVAL '7 days'
                """,
                site_id
            )
            
            if recent_accuracy and recent_accuracy['mape']:
                mape = float(recent_accuracy['mape'])
                if mape > 20:
                    recommendations.append({
                        "type": "accuracy_degradation",
                        "priority": "high",
                        "title": "Forecast Accuracy Degradation",
                        "message": f"Recent forecast accuracy has degraded (MAPE: {mape:.1f}%). Model may need retraining.",
                        "action": "Review forecast model performance and consider model update"
                    })
        
        return {
            "site_id": site_id,
            "horizon": horizon,
            "insights": insights,
            "anomalies": anomalies,
            "recommendations": recommendations,
            "summary": {
                "total_insights": len(insights),
                "total_anomalies": len(anomalies),
                "total_recommendations": len(recommendations),
                "high_priority_count": len([r for r in recommendations if r.get('priority') == 'high'])
            }
        }
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error("Error generating forecast insights", exc_info=e, site_id=site_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating forecast insights: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

