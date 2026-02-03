#!/usr/bin/env python3
"""
Check if admin user exists and verify credentials
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


async def check_admin_user():
    """Check admin user status"""
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
        print("\nMake sure:")
        print("  1. PostgreSQL is running")
        print("  2. Database 'bria' exists")
        print("  3. DATABASE_URL in .env is correct")
        return False


if __name__ == "__main__":
    asyncio.run(check_admin_user())

