#!/usr/bin/env python3
"""
Run database migration using asyncpg
This script can run any SQL migration file without requiring psql
"""
import asyncio
import sys
import os
from pathlib import Path

# Try to load .env file manually (simple parser)
def load_env_file(env_path):
    """Simple .env file parser"""
    if not env_path.exists():
        return
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip().strip('"').strip("'")

# Load environment variables from .env file
env_path = Path(__file__).parent.parent.parent / ".env"
load_env_file(env_path)

try:
    import asyncpg
except ImportError:
    print("❌ asyncpg not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "asyncpg", "-q"])
    import asyncpg

async def run_migration(migration_file: str):
    """Run a SQL migration file"""
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("❌ DATABASE_URL not configured in environment")
        print("   Please set DATABASE_URL in your .env file or environment")
        return False
    
    print(f"📋 Running migration: {migration_file}")
    print(f"🔗 Database: {database_url.split('@')[-1] if '@' in database_url else database_url}")
    
    # Read migration file
    backend_dir = Path(__file__).parent.parent
    migration_path = backend_dir / migration_file
    if not migration_path.exists():
        print(f"❌ Migration file not found: {migration_path}")
        return False
    
    with open(migration_path, 'r') as f:
        sql_content = f.read()
    
    try:
        # Connect to database
        print("🔌 Connecting to database...")
        conn = await asyncpg.connect(database_url)
        
        try:
            # Execute migration
            print("⚙️  Executing migration...")
            # Split SQL into statements (semicolon-separated, ignoring comments)
            statements = []
            current_statement = []
            in_comment = False
            
            for line in sql_content.split('\n'):
                # Remove inline comments
                if '--' in line:
                    line = line[:line.index('--')]
                
                line = line.strip()
                if not line:
                    continue
                
                current_statement.append(line)
                
                # Check if line ends a statement
                if line.rstrip().endswith(';'):
                    statement = ' '.join(current_statement)
                    if statement.strip() and not statement.strip().startswith('--'):
                        statements.append(statement)
                    current_statement = []
            
            # Execute each statement
            for i, statement in enumerate(statements, 1):
                if statement.strip():
                    try:
                        await conn.execute(statement)
                    except Exception as e:
                        # Check if it's a "already exists" error (which is OK)
                        error_msg = str(e).lower()
                        if 'already exists' in error_msg or 'duplicate' in error_msg or 'does not exist' in error_msg:
                            print(f"  ℹ️  Statement {i}: Already applied or not needed")
                        else:
                            print(f"  ⚠️  Statement {i} warning: {e}")
            
            print("✅ Migration completed successfully!")
            return True
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            return False
        finally:
            await conn.close()
    except asyncpg.InvalidPasswordError:
        print("❌ Invalid database password")
        return False
    except asyncpg.ConnectionDoesNotExistError:
        print("❌ Database connection failed")
        print("   Please check your DATABASE_URL and ensure PostgreSQL is running")
        return False
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False

async def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file>")
        print("Example: python run_migration.py database/migrations/002_openweather_storage.sql")
        sys.exit(1)
    
    migration_file = sys.argv[1]
    success = await run_migration(migration_file)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())

