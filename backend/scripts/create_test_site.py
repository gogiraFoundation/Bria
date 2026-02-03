#!/usr/bin/env python3
"""
Create a test site for Bria platform
"""
import asyncio
import asyncpg
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from core.config import get_settings

settings = get_settings()


async def create_test_site():
    """Create a test solar site"""
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)
        
        # Get default tenant
        tenant = await conn.fetchrow(
            "SELECT id FROM tenants WHERE name = 'default' LIMIT 1"
        )
        if not tenant:
            print("❌ Default tenant not found. Please create a user first.")
            await conn.close()
            return
        
        tenant_id = tenant['id']
        
        # Check if test site already exists
        existing = await conn.fetchrow(
            "SELECT id FROM sites WHERE name = 'Test Solar Farm' AND tenant_id = $1",
            tenant_id
        )
        
        if existing:
            print("✅ Test site already exists!")
            print(f"   Site ID: {existing['id']}")
            await conn.close()
            return
        
        # Create test solar site
        import json
        pv_params = json.dumps({
            "module_type": "mono-Si",
            "tilt": 30,
            "azimuth": 180,
            "system_loss": 0.14
        })
        
        site_id = await conn.fetchval(
            """
            INSERT INTO sites (
                name, type, latitude, longitude, capacity_mw, timezone, tenant_id, pv_params
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            RETURNING id
            """,
            "Test Solar Farm",
            "solar",
            37.7749,  # San Francisco
            -122.4194,
            10.0,  # 10 MW
            "America/Los_Angeles",
            tenant_id,
            pv_params
        )
        
        print("✅ Test site created successfully!")
        print(f"\nSite Details:")
        print(f"   ID: {site_id}")
        print(f"   Name: Test Solar Farm")
        print(f"   Type: Solar")
        print(f"   Capacity: 10 MW")
        print(f"   Location: San Francisco, CA")
        
        await conn.close()
    except Exception as e:
        print(f"❌ Error creating test site: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(create_test_site())

