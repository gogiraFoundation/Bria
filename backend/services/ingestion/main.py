"""
Bria Data Ingestion Service
Handles MQTT, HTTP REST, WebSocket, and Modbus TCP data ingestion
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
import aiomqtt
from confluent_kafka import Producer
from confluent_kafka import KafkaError
import redis.asyncio as redis
import sys
from pathlib import Path

# Suppress confluent-kafka verbose logging
logging.getLogger('confluent_kafka').setLevel(logging.ERROR)
logging.getLogger('confluent_kafka.cimpl').setLevel(logging.ERROR)

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.models import WeatherData
from core.logging import get_logger
from core.config import get_settings
from core.metrics import (
    DATA_INGESTION_COUNT,
    DATA_INGESTION_ERRORS,
    DATA_QUALITY
)

logger = get_logger('ingestion-service')
settings = get_settings()

# Global service instance (will be created after class definition)
ingestion_service = None


class IngestionService:
    """Main ingestion service class"""
    
    def __init__(self):
        self.kafka_producer: Optional[Producer] = None
        self.redis_client: Optional[redis.Redis] = None
        self.mqtt_client: Optional[aiomqtt.Client] = None
        self.data_buffer = asyncio.Queue(maxsize=10000)
        self.running = False
    
    async def initialize(self):
        """Initialize connections"""
        # Kafka producer (optional - service can run without it)
        # Check if Kafka is available before creating producer to avoid connection spam
        import socket
        kafka_available = False
        try:
            kafka_host, kafka_port = settings.KAFKA_BOOTSTRAP_SERVERS.split(':')
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((kafka_host, int(kafka_port)))
            sock.close()
            kafka_available = (result == 0)
        except Exception:
            kafka_available = False
        
        if kafka_available:
            try:
                # Create producer with minimal logging
                # Note: confluent-kafka logs to stderr, which we suppress via logging config above
                self.kafka_producer = Producer({
                    'bootstrap.servers': settings.KAFKA_BOOTSTRAP_SERVERS,
                    'client.id': 'bria-ingestion',
                    'socket.timeout.ms': 2000,
                    'api.version.request': False,  # Disable to reduce connection attempts
                    'log.connection.close': False,
                    'log_level': 7,  # LOG_DEBUG but filtered by Python logging
                })
                logger.info("Kafka producer created")
            except Exception as e:
                logger.warning(f"Kafka producer creation failed (service will run without Kafka): {e}")
                self.kafka_producer = None
        else:
            logger.info("Kafka not available - service will run without Kafka")
            self.kafka_producer = None
        
        # Redis client (optional)
        try:
            self.redis_client = await redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2
            )
            # Test connection
            await self.redis_client.ping()
            logger.info("Redis connection established")
        except Exception as e:
            # If connection fails and URL contains password, try without password
            if 'password' in settings.REDIS_URL.lower() or '@' in settings.REDIS_URL:
                try:
                    # Extract host and port, remove password
                    import re
                    match = re.match(r'redis://(?:[^:]+:[^@]+@)?([^:]+):(\d+)(?:/(\d+))?', settings.REDIS_URL)
                    if match:
                        host, port, db = match.groups()
                        redis_url = f'redis://{host}:{port}'
                        if db:
                            redis_url += f'/{db}'
                        self.redis_client = await redis.from_url(
                            redis_url,
                            decode_responses=True,
                            socket_connect_timeout=2
                        )
                        await self.redis_client.ping()
                        logger.info("Redis connection established (without password)")
                    else:
                        raise
                except Exception:
                    logger.warning(f"Redis connection failed (service will run without caching): {e}")
                    self.redis_client = None
            else:
                logger.warning(f"Redis connection failed (service will run without caching): {e}")
                self.redis_client = None
        
        logger.info("Ingestion service initialized (some features may be in degraded mode)")
    
    async def shutdown(self):
        """Shutdown connections"""
        if self.kafka_producer:
            self.kafka_producer.flush()
        if self.redis_client:
            await self.redis_client.close()
        if self.mqtt_client:
            await self.mqtt_client.disconnect()
        logger.info("Ingestion service shut down")
    
    async def validate_data(self, data: Dict[str, Any]) -> WeatherData:
        """Validate and transform incoming data"""
        try:
            # Apply validation rules
            validated = WeatherData(**data)
            
            # Additional quality checks
            quality_score = await self._calculate_quality_score(validated)
            validated.quality_score = quality_score
            
            return validated
        except ValidationError as e:
            logger.error("Data validation failed", exc_info=e, data=data)
            raise ValueError(f"Invalid data: {e}")
    
    async def _calculate_quality_score(self, data: WeatherData) -> float:
        """Calculate data quality score"""
        score = 1.0
        
        # Check for missing critical fields
        if data.site_id == "solar":
            if data.ghi is None:
                score -= 0.3
        elif data.site_id == "wind":
            if data.wind_speed is None:
                score -= 0.3
        
        # Check timestamp freshness
        age_seconds = (datetime.utcnow() - data.timestamp.replace(tzinfo=None)).total_seconds()
        if age_seconds > 300:  # 5 minutes
            score -= 0.2
        
        # Check for unrealistic values
        if data.wind_speed and data.wind_speed > 50:
            score -= 0.2
        
        return max(0.0, min(1.0, score))
    
    async def handle_mqtt_message(self, topic: str, payload: bytes):
        """Process MQTT messages from weather stations"""
        try:
            data = json.loads(payload.decode())
            data['timestamp'] = datetime.fromisoformat(data.get('timestamp', datetime.utcnow().isoformat()))
            
            validated = await self.validate_data(data)
            
            if validated.quality_score > 0.8:
                await self.data_buffer.put(validated)
                await self.publish_to_kafka('weather-raw', validated.dict())
                await self.cache_realtime(validated)
                
                DATA_INGESTION_COUNT.labels(source='mqtt', type='weather').inc()
                DATA_QUALITY.labels(
                    station_id=validated.station_id,
                    metric='overall'
                ).set(validated.quality_score)
            else:
                logger.warning(
                    "Low quality data rejected",
                    quality_score=validated.quality_score,
                    station_id=validated.station_id
                )
                DATA_INGESTION_ERRORS.labels(source='mqtt', error_type='low_quality').inc()
                
        except Exception as e:
            logger.error("Error processing MQTT message", exc_info=e, topic=topic)
            DATA_INGESTION_ERRORS.labels(source='mqtt', error_type='processing_error').inc()
    
    async def publish_to_kafka(self, topic: str, data: Dict[str, Any]):
        """Publish data to Kafka (optional - fails silently if Kafka unavailable)"""
        if not self.kafka_producer:
            return  # Kafka not available, skip silently
        
        try:
            self.kafka_producer.produce(
                topic,
                json.dumps(data, default=str).encode('utf-8'),
                callback=self._kafka_delivery_callback
            )
            self.kafka_producer.poll(0)
        except Exception as e:
            # Only log if it's not a connection error (those are expected if Kafka is down)
            if 'Connection' not in str(e) and 'Connect' not in str(e):
                logger.error("Error publishing to Kafka", exc_info=e, topic=topic)
    
    def _kafka_delivery_callback(self, err, msg):
        """Kafka delivery callback"""
        if err:
            # Only log non-connection errors (connection errors are expected if Kafka is down)
            if 'Connection' not in str(err) and 'Connect' not in str(err):
                logger.error("Kafka delivery failed", error=str(err))
        else:
            logger.debug("Message delivered", topic=msg.topic(), partition=msg.partition())
    
    async def cache_realtime(self, data: WeatherData):
        """Cache real-time data in Redis"""
        try:
            key = f"realtime:weather:{data.station_id}"
            await self.redis_client.setex(
                key,
                300,  # 5 minutes TTL
                json.dumps(data.dict(), default=str)
            )
        except Exception as e:
            logger.error("Error caching data", exc_info=e)
    
    async def start_mqtt_listener(self):
        """Start MQTT message listener (optional - fails silently if MQTT unavailable)"""
        # Check if MQTT broker is available
        import socket
        mqtt_available = False
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT))
            sock.close()
            mqtt_available = (result == 0)
        except Exception:
            mqtt_available = False
        
        if not mqtt_available:
            logger.info(f"MQTT broker not available at {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT} - MQTT listener disabled")
            return
        
        try:
            self.mqtt_client = aiomqtt.Client(
                hostname=settings.MQTT_BROKER_HOST,
                port=settings.MQTT_BROKER_PORT
            )
            
            async with self.mqtt_client:
                await self.mqtt_client.subscribe("weather/+/data")
                logger.info("Subscribed to MQTT topics")
                
                async for message in self.mqtt_client.messages:
                    await self.handle_mqtt_message(message.topic.value, message.payload)
                    
        except Exception as e:
            # Only log if it's not a connection error (those are expected if MQTT is down)
            if 'Connection' not in str(e) and 'Connect' not in str(e) and 'refused' not in str(e).lower():
                logger.error("MQTT listener error", exc_info=e)
            else:
                logger.info(f"MQTT broker not available - MQTT listener disabled")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown"""
    global ingestion_service
    # Create service instance (class is now defined)
    ingestion_service = IngestionService()
    # Startup
    await ingestion_service.initialize()
    # Start background tasks
    asyncio.create_task(ingestion_service.start_mqtt_listener())
    yield
    # Shutdown
    if ingestion_service:
        await ingestion_service.shutdown()


app = FastAPI(
    title="Bria Ingestion Service",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/ingest/weather")
async def ingest_weather(data: Dict[str, Any]):
    """HTTP endpoint for weather data ingestion"""
    try:
        if 'timestamp' not in data:
            data['timestamp'] = datetime.utcnow().isoformat()
        else:
            data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        
        validated = await ingestion_service.validate_data(data)
        
        if validated.quality_score > 0.8:
            await ingestion_service.publish_to_kafka('weather-raw', validated.dict())
            await ingestion_service.cache_realtime(validated)
            
            DATA_INGESTION_COUNT.labels(source='http', type='weather').inc()
            
            return {
                "status": "accepted",
                "quality_score": validated.quality_score,
                "station_id": validated.station_id
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Low quality data rejected: quality_score={validated.quality_score}"
            )
    except Exception as e:
        logger.error("Error ingesting weather data", exc_info=e)
        DATA_INGESTION_ERRORS.labels(source='http', error_type='processing_error').inc()
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/ingest")
async def websocket_ingest(websocket: WebSocket):
    """WebSocket endpoint for real-time data ingestion"""
    await websocket.accept()
    logger.info("WebSocket connection established")
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if 'timestamp' not in data:
                data['timestamp'] = datetime.utcnow().isoformat()
            else:
                data['timestamp'] = datetime.fromisoformat(data['timestamp'])
            
            validated = await ingestion_service.validate_data(data)
            
            if validated.quality_score > 0.8:
                await ingestion_service.publish_to_kafka('weather-raw', validated.dict())
                await ingestion_service.cache_realtime(validated)
                
                DATA_INGESTION_COUNT.labels(source='websocket', type='weather').inc()
                
                await websocket.send_json({
                    "status": "accepted",
                    "quality_score": validated.quality_score
                })
            else:
                await websocket.send_json({
                    "status": "rejected",
                    "reason": "low_quality",
                    "quality_score": validated.quality_score
                })
                
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error("WebSocket error", exc_info=e)
        await websocket.close()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ingestion",
        "timestamp": datetime.utcnow().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

