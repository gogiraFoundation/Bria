"""
Database connection utilities
"""
import asyncpg
from typing import Optional
try:
    from core.config import get_settings
    from core.logging import get_logger
except ImportError:
    from backend.core.config import get_settings
    from backend.core.logging import get_logger

logger = get_logger('database')
settings = get_settings()

# Global connection pool
db_pool: Optional[asyncpg.Pool] = None


async def get_db_pool() -> asyncpg.Pool:
    """Get or create database connection pool"""
    global db_pool
    
    if db_pool is None:
        db_pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
        logger.info("Database connection pool created")
    
    return db_pool


async def close_db_pool():
    """Close database connection pool"""
    global db_pool
    
    if db_pool:
        await db_pool.close()
        db_pool = None
        logger.info("Database connection pool closed")

