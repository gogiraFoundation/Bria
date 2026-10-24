#!/usr/bin/env python3
"""
Check if admin user exists and verify credentials
"""
import asyncio
import asyncpg
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))


def load_repo_env() -> None:
    """Load repo .env into os.environ so it wins over a stale shell DATABASE_URL."""
    env_path = backend_dir.parent / ".env"
    if not env_path.exists():
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ[key] = value


def database_target(database_url: str) -> str:
    """Host:port/db without credentials, for safe logging."""
    parsed = urlparse(database_url)
    host = parsed.hostname or "unknown"
    port = parsed.port or 5432
    db = (parsed.path or "/").lstrip("/") or "unknown"
    return f"{host}:{port}/{db}"


load_repo_env()

from core.config import get_settings
from passlib.context import CryptContext

get_settings.cache_clear()
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def check_admin_user():
    """Check admin user status"""
    target = database_target(settings.DATABASE_URL)
    print(f"🔗 Connecting to {target}")
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)

        # Check if admin user exists
        admin = await conn.fetchrow(
            "SELECT id, email, username, is_active, role FROM users WHERE email = $1",
            "admin@bria.com"
        )

        if not admin:
            print("❌ Admin user does NOT exist!")
            print("\nTo create it, run:")
            print("  python scripts/create_admin_user.py")
            await conn.close()
            return False

        print("✅ Admin user exists!")
        print(f"  Email: {admin['email']}")
        print(f"  Username: {admin['username']}")
        print(f"  Role: {admin['role']}")
        print(f"  Active: {admin['is_active']}")

        # Test password
        user_with_password = await conn.fetchrow(
            "SELECT hashed_password FROM users WHERE email = $1",
            "admin@bria.com"
        )

        if user_with_password and pwd_context.verify("admin123", user_with_password['hashed_password']):
            print("\n✅ Password 'admin123' is correct!")
        else:
            print("\n⚠️  Password 'admin123' does NOT match!")
            print("   The password may have been changed.")

        await conn.close()
        return True
    except Exception as e:
        print(f"❌ Error checking admin user: {e}")
        print(f"\nTried: {target}")
        print("Make sure:")
        print("  1. PostgreSQL is running")
        print("  2. Database 'bria' exists")
        print("  3. DATABASE_URL in .env is correct")
        return False


if __name__ == "__main__":
    asyncio.run(check_admin_user())
