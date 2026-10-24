#!/usr/bin/env python3
"""
Run database migration using asyncpg
This script can run any SQL migration file without requiring psql.

Splits on semicolons while respecting -- line comments and dollar-quoted
blocks (DO $$ ... $$), so enum bootstrap scripts apply correctly.
"""
import asyncio
import sys
import os
from pathlib import Path


def load_env_file(env_path):
    """Simple .env file parser"""
    if not env_path.exists():
        return
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ[key.strip()] = value.strip().strip('"').strip("'")


env_path = Path(__file__).parent.parent.parent / ".env"
load_env_file(env_path)

try:
    import asyncpg
except ImportError:
    print("❌ asyncpg not installed. Installing...")
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "asyncpg", "-q"])
    import asyncpg


def split_sql_statements(sql_content: str) -> list:
    """
    Split SQL into statements on ';' outside comments and dollar quotes.
    """
    statements = []
    buf: list[str] = []
    i = 0
    n = len(sql_content)
    in_line_comment = False
    in_block_comment = False
    dollar_tag = None  # e.g. '$$' or '$tag$'

    while i < n:
        ch = sql_content[i]
        nxt = sql_content[i + 1] if i + 1 < n else ""

        if in_line_comment:
            buf.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            buf.append(ch)
            if ch == "*" and nxt == "/":
                buf.append(nxt)
                i += 2
                in_block_comment = False
                continue
            i += 1
            continue

        if dollar_tag is not None:
            if sql_content.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
            buf.append(ch)
            i += 1
            continue

        # start line comment
        if ch == "-" and nxt == "-":
            in_line_comment = True
            buf.append(ch)
            buf.append(nxt)
            i += 2
            continue

        # start block comment
        if ch == "/" and nxt == "*":
            in_block_comment = True
            buf.append(ch)
            buf.append(nxt)
            i += 2
            continue

        # start dollar quote: $tag$ or $$
        if ch == "$":
            j = i + 1
            while j < n and (sql_content[j].isalnum() or sql_content[j] == "_"):
                j += 1
            if j < n and sql_content[j] == "$":
                dollar_tag = sql_content[i : j + 1]
                buf.append(dollar_tag)
                i = j + 1
                continue

        if ch == ";":
            statement = "".join(buf).strip()
            # strip pure comment-only leftovers
            if statement and not all(
                line.strip().startswith("--") or not line.strip()
                for line in statement.splitlines()
            ):
                statements.append(statement)
            buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


async def run_migration(migration_file: str):
    """Run a SQL migration file"""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("❌ DATABASE_URL not configured in environment")
        print("   Please set DATABASE_URL in your .env file or environment")
        return False

    print(f"📋 Running migration: {migration_file}")
    print(
        f"🔗 Database: {database_url.split('@')[-1] if '@' in database_url else database_url}"
    )

    backend_dir = Path(__file__).parent.parent
    migration_path = backend_dir / migration_file
    if not migration_path.exists():
        print(f"❌ Migration file not found: {migration_path}")
        return False

    with open(migration_path, "r") as f:
        sql_content = f.read()

    try:
        print("🔌 Connecting to database...")
        conn = await asyncpg.connect(database_url)

        try:
            print("⚙️  Executing migration...")
            statements = split_sql_statements(sql_content)
            failures = 0

            for i, statement in enumerate(statements, 1):
                if not statement.strip():
                    continue
                try:
                    await conn.execute(statement)
                except Exception as e:
                    error_msg = str(e).lower()
                    if (
                        "already exists" in error_msg
                        or "duplicate" in error_msg
                    ):
                        print(f"  ℹ️  Statement {i}: Already applied")
                    else:
                        print(f"  ⚠️  Statement {i} warning: {e}")
                        failures += 1

            if failures:
                print(
                    f"✅ Migration finished with {failures} statement warning(s)"
                )
            else:
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
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file>")
        print(
            "Example: python run_migration.py database/migrations/002_openweather_storage.sql"
        )
        sys.exit(1)

    migration_file = sys.argv[1]
    success = await run_migration(migration_file)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
