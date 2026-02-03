#!/usr/bin/env python3
"""
Create default admin user for Bria platform
"""
import asyncio
import asyncpg
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from core.config import get_settings
from passlib.context import CryptContext

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def create_admin_user():
    """Create default admin user"""
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)
        
        # Check if admin user exists
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1",
            "admin@bria.com"
        )
        
        if existing:
            print("Admin user already exists!")
            print("Email: admin@bria.com")
            print("Password: (use change-password endpoint to reset)")
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
        admin_id = await conn.fetchval(
            """
            INSERT INTO users (email, username, hashed_password, full_name, is_active, role, tenant_id)
            VALUES ($1, $2, $3, $4, TRUE, 'admin', $5)
            RETURNING id
            """,
            "admin@bria.com",
            "admin",
            pwd_context.hash("admin123"),
            "System Administrator",
            tenant_id
        )
        
        print("✅ Admin user created successfully!")
        print("\nDefault credentials:")
        print("  Email: admin@bria.com")
        print("  Password: admin123")
        print("\n⚠️  IMPORTANT: Change the password after first login!")
        
        await conn.close()
    except Exception as e:
        print(f"❌ Error creating admin user: {e}")
        print("\nMake sure:")
        print("  1. PostgreSQL is running")
        print("  2. Database 'bria' exists")
        print("  3. DATABASE_URL in .env is correct")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(create_admin_user())

