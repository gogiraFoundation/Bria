"""
Rate limiting utilities for API calls
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional
from collections import defaultdict
import time
from core.logging import get_logger

logger = get_logger('rate-limiter')


class RateLimiter:
    """Simple in-memory rate limiter with sliding window"""
    
    def __init__(self, max_calls: int, time_window_seconds: int):
        """
        Args:
            max_calls: Maximum number of calls allowed
            time_window_seconds: Time window in seconds
        """
        self.max_calls = max_calls
        self.time_window = timedelta(seconds=time_window_seconds)
        self.calls: Dict[str, list] = defaultdict(list)
        self.lock = asyncio.Lock()
    
    async def acquire(self, key: str) -> bool:
        """
        Check if a call is allowed. Returns True if allowed, False if rate limited.
        """
        async with self.lock:
            now = datetime.utcnow()
            # Clean old entries
            cutoff = now - self.time_window
            self.calls[key] = [t for t in self.calls[key] if t > cutoff]
            
            # Check if we're at the limit
            if len(self.calls[key]) >= self.max_calls:
                logger.warning(
                    f"Rate limit exceeded for key: {key}",
                    key=key,
                    calls=len(self.calls[key]),
                    max_calls=self.max_calls
                )
                return False
            
            # Record this call
            self.calls[key].append(now)
            return True
    
    async def wait_if_needed(self, key: str) -> None:
        """Wait if rate limit is exceeded"""
        while not await self.acquire(key):
            # Calculate wait time
            if self.calls[key]:
                oldest_call = min(self.calls[key])
                wait_until = oldest_call + self.time_window
                wait_seconds = (wait_until - datetime.utcnow()).total_seconds()
                if wait_seconds > 0:
                    logger.info(f"Rate limited, waiting {wait_seconds:.1f} seconds for {key}")
                    await asyncio.sleep(min(wait_seconds, 60))  # Max 60 seconds wait
                else:
                    await asyncio.sleep(1)
            else:
                await asyncio.sleep(1)
    
    def get_remaining_calls(self, key: str) -> int:
        """Get remaining calls in current window"""
        now = datetime.utcnow()
        cutoff = now - self.time_window
        self.calls[key] = [t for t in self.calls[key] if t > cutoff]
        return max(0, self.max_calls - len(self.calls[key]))


# OpenWeather API rate limiters
# Free tier: 60 calls/minute, 1,000,000 calls/month
openweather_rate_limiter = RateLimiter(max_calls=50, time_window_seconds=60)  # Conservative: 50/min
openweather_daily_limiter = RateLimiter(max_calls=1000, time_window_seconds=86400)  # 1000/day

