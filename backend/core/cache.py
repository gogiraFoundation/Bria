"""
Caching utilities with Redis and in-memory fallback
"""
import json
import hashlib
from typing import Optional, Any, Dict
from datetime import datetime, timedelta
import redis.asyncio as redis
from core.logging import get_logger
from core.config import get_settings

logger = get_logger('cache')
settings = get_settings()


class CacheManager:
    """Unified cache manager with Redis and in-memory fallback"""
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        self.redis_client = redis_client
        self.memory_cache: Dict[str, tuple] = {}  # key -> (value, expiry_time)
        self.max_memory_entries = 1000  # Limit in-memory cache size
    
    def _make_key(self, prefix: str, *args, **kwargs) -> str:
        """Create a cache key from prefix and arguments"""
        key_parts = [prefix] + [str(arg) for arg in args]
        if kwargs:
            sorted_kwargs = sorted(kwargs.items())
            key_parts.extend([f"{k}:{v}" for k, v in sorted_kwargs])
        key_string = ":".join(key_parts)
        # Hash if key is too long
        if len(key_string) > 200:
            key_string = f"{prefix}:{hashlib.md5(key_string.encode()).hexdigest()}"
        return key_string
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache (Redis first, then memory)"""
        # Try Redis first
        if self.redis_client:
            try:
                cached = await self.redis_client.get(key)
                if cached:
                    try:
                        return json.loads(cached)
                    except json.JSONDecodeError:
                        return cached
            except Exception as e:
                logger.warning(f"Redis get failed: {e}, falling back to memory cache")
        
        # Fallback to memory cache
        if key in self.memory_cache:
            value, expiry = self.memory_cache[key]
            if expiry > datetime.utcnow():
                return value
            else:
                del self.memory_cache[key]
        
        return None
    
    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> bool:
        """Set value in cache (Redis first, then memory)"""
        # Clean memory cache if too large
        if len(self.memory_cache) >= self.max_memory_entries:
            # Remove oldest 20% of entries
            sorted_entries = sorted(
                self.memory_cache.items(),
                key=lambda x: x[1][1]  # Sort by expiry time
            )
            to_remove = int(len(sorted_entries) * 0.2)
            for k, _ in sorted_entries[:to_remove]:
                del self.memory_cache[k]
        
        # Try Redis first
        if self.redis_client:
            try:
                if isinstance(value, (dict, list)):
                    serialized = json.dumps(value)
                else:
                    serialized = str(value)
                await self.redis_client.setex(key, ttl_seconds, serialized)
                return True
            except Exception as e:
                logger.warning(f"Redis set failed: {e}, using memory cache")
        
        # Fallback to memory cache
        expiry = datetime.utcnow() + timedelta(seconds=ttl_seconds)
        self.memory_cache[key] = (value, expiry)
        return True
    
    async def delete(self, key: str) -> None:
        """Delete key from cache"""
        if self.redis_client:
            try:
                await self.redis_client.delete(key)
            except Exception:
                pass
        
        if key in self.memory_cache:
            del self.memory_cache[key]
    
    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern"""
        count = 0
        if self.redis_client:
            try:
                keys = await self.redis_client.keys(pattern)
                if keys:
                    count = await self.redis_client.delete(*keys)
            except Exception:
                pass
        
        # Also clear from memory cache
        keys_to_delete = [k for k in self.memory_cache.keys() if pattern.replace('*', '') in k]
        for key in keys_to_delete:
            del self.memory_cache[key]
            count += 1
        
        return count


# Global cache manager instance (will be initialized in main.py)
cache_manager: Optional[CacheManager] = None

