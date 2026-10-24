#!/usr/bin/env python3
"""
Create default admin user for Bria platform
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

# Clear cached settings if imported elsewhere with a stale URL
get_settings.cache_clear()
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


DEFAULT_ADMIN_EMAIL = "admin@bria.com"
DEFAULT_ADMIN_PASSWORD = "admin123"


async def create_admin_user(reset_password: bool = False, new_password: str = DEFAULT_ADMIN_PASSWORD):
    """Create default admin user, or reset password when --reset-password is set."""
    target = database_target(settings.DATABASE_URL)
    print(f"🔗 Connecting to {target}")
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)

        # Check if admin user exists
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1",
            DEFAULT_ADMIN_EMAIL
        )

        if existing:
            if reset_password:
                await conn.execute(
                    """
                    UPDATE users
                    SET hashed_password = $1, updated_at = NOW()
                    WHERE email = $2
                    """,
                    pwd_context.hash(new_password),
                    DEFAULT_ADMIN_EMAIL,
                )
                print("✅ Admin password reset successfully!")
                print(f"\nCredentials:")
                print(f"  Email: {DEFAULT_ADMIN_EMAIL}")
                print(f"  Password: {new_password}")
                print("\n⚠️  IMPORTANT: Change the password after first login!")
            else:
                print("Admin user already exists!")
                print(f"Email: {DEFAULT_ADMIN_EMAIL}")
                print("Password: (run with --reset-password to set it to the default)")
            await conn.close()
            return

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

        # Create admin user
        await conn.fetchval(
            """
            INSERT INTO users (email, username, hashed_password, full_name, is_active, role, tenant_id)
            VALUES ($1, $2, $3, $4, TRUE, 'admin', $5)
            RETURNING id
            """,
            DEFAULT_ADMIN_EMAIL,
            "admin",
            pwd_context.hash(new_password),
            "System Administrator",
            tenant_id
        )

        print("✅ Admin user created successfully!")
        print("\nDefault credentials:")
        print(f"  Email: {DEFAULT_ADMIN_EMAIL}")
        print(f"  Password: {new_password}")
        print("\n⚠️  IMPORTANT: Change the password after first login!")

        await conn.close()
    except Exception as e:
        print(f"❌ Error creating admin user: {e}")
        print(f"\nTried: {target}")
        print("Make sure:")
        print("  1. PostgreSQL is running")
        print("  2. Database 'bria' exists")
        print("  3. DATABASE_URL in .env is correct")
        sys.exit(1)


if __name__ == "__main__":
    reset = "--reset-password" in sys.argv
    password = DEFAULT_ADMIN_PASSWORD
    for i, arg in enumerate(sys.argv):
        if arg == "--password" and i + 1 < len(sys.argv):
            password = sys.argv[i + 1]
            break
    asyncio.run(create_admin_user(reset_password=reset, new_password=password))
