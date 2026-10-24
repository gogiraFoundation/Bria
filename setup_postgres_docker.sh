#!/bin/bash

# Quick PostgreSQL setup using Docker (TimescaleDB + PostGIS)
# Stops any previous bria-postgres before choosing the host port so a re-run
# does not treat our own container as a conflict and fall back to 5433.

set -euo pipefail

echo "🐳 Setting up PostgreSQL with Docker..."

# Check if Docker is available
if ! command -v docker > /dev/null 2>&1; then
    echo "❌ Docker is not installed."
    echo ""
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    echo ""
    echo "OR use the manual PostgreSQL setup in SETUP_DATABASE_NOW.md"
    exit 1
fi

# Remove previous Bria Postgres container before probing ports
docker stop bria-postgres 2>/dev/null || true
docker rm bria-postgres 2>/dev/null || true

# Prefer 5432; stop Homebrew Postgres if it holds the port
PORT_TO_USE=5432
if lsof -i :5432 > /dev/null 2>&1; then
    echo "⚠️  Port 5432 is already in use (likely by local PostgreSQL)"
    echo "🛑 Stopping local PostgreSQL service..."
    brew services stop postgresql@15 2>/dev/null || brew services stop postgresql 2>/dev/null || true
    sleep 2

    if lsof -i :5432 > /dev/null 2>&1; then
        echo "⚠️  Port 5432 still in use, using port 5433 instead"
        PORT_TO_USE=5433
    else
        echo "✅ Port 5432 is now free"
    fi
fi

IMAGE="timescale/timescaledb-ha:pg15"

# Start PostgreSQL container (HA image includes TimescaleDB and PostGIS binaries)
echo "📦 Starting PostgreSQL container on port $PORT_TO_USE ($IMAGE)..."
docker run -d \
  --name bria-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=bria \
  -e POSTGRES_USER=postgres \
  -p "$PORT_TO_USE:5432" \
  "$IMAGE"

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

READY=0
for i in {1..60}; do
    if docker exec bria-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        READY=1
        break
    fi
    echo "   Waiting... ($i/60)"
    sleep 1
done

if [ "$READY" -ne 1 ]; then
    echo "❌ PostgreSQL did not become ready in time"
    docker logs bria-postgres 2>&1 | tail -40
    exit 1
fi

# Run migrations; fail the script if any SQL statement errors
echo "📋 Running database migrations..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATION="$SCRIPT_DIR/backend/database/migrations/001_initial_schema.sql"

if [ ! -f "$MIGRATION" ]; then
    echo "❌ Migration file not found: $MIGRATION"
    exit 1
fi

if ! docker exec -i bria-postgres psql -v ON_ERROR_STOP=1 -U postgres -d bria < "$MIGRATION"; then
    echo "❌ Migrations failed. Fix the SQL errors above and re-run this script."
    exit 1
fi
echo "✅ Migrations completed"

# Update .env file
cd "$SCRIPT_DIR"
DB_URL="postgresql://postgres:postgres@localhost:$PORT_TO_USE/bria"
if [ -f .env ]; then
    if grep -q "^DATABASE_URL=" .env; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
        else
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
        fi
        echo "✅ Updated DATABASE_URL in .env to port $PORT_TO_USE"
    else
        echo "" >> .env
        echo "DATABASE_URL=$DB_URL" >> .env
        echo "✅ Added DATABASE_URL to .env (port $PORT_TO_USE)"
    fi
else
    echo "⚠️  .env file not found. Please add:"
    echo "   DATABASE_URL=$DB_URL"
fi

echo ""
echo "✅ PostgreSQL setup complete!"
echo ""
echo "📝 Database connection:"
echo "   Host: localhost"
echo "   Port: $PORT_TO_USE"
echo "   Database: bria"
echo "   User: postgres"
echo "   Password: postgres"
echo ""
echo "👤 Next step: Create admin user"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   unset DATABASE_URL"
echo "   python3 scripts/create_admin_user.py"
echo ""
echo "💡 To stop PostgreSQL: docker stop bria-postgres"
echo "💡 To start again: docker start bria-postgres"
