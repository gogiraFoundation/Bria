#!/bin/bash

# Check if database migrations have been run

echo "🔍 Checking database migrations..."

# Get database URL from .env or use defaults
if [ -f .env ]; then
    source .env
fi

DB_URL="${DATABASE_URL:-postgresql://$(whoami)@localhost:5432/bria}"

# Extract connection details
if [[ $DB_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
    PG_USER="${BASH_REMATCH[1]}"
    PG_PASS="${BASH_REMATCH[2]}"
    PG_HOST="${BASH_REMATCH[3]}"
    PG_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
elif [[ $DB_URL =~ postgresql://([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
    PG_USER="${BASH_REMATCH[1]}"
    PG_HOST="${BASH_REMATCH[2]}"
    PG_PORT="${BASH_REMATCH[3]}"
    DB_NAME="${BASH_REMATCH[4]}"
else
    echo "❌ Could not parse DATABASE_URL: $DB_URL"
    exit 1
fi

# Check if required tables exist
echo "Checking for required tables..."

REQUIRED_TABLES=("tenants" "users" "sites" "weather_stations" "weather_readings" "production_actuals" "forecasts")

MISSING_TABLES=()

for table in "${REQUIRED_TABLES[@]}"; do
    if psql "$DB_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" 2>/dev/null | grep -q "t"; then
        echo "  ✅ $table exists"
    else
        echo "  ❌ $table MISSING"
        MISSING_TABLES+=("$table")
    fi
done

if [ ${#MISSING_TABLES[@]} -eq 0 ]; then
    echo ""
    echo "✅ All required tables exist!"
else
    echo ""
    echo "❌ Missing tables: ${MISSING_TABLES[*]}"
    echo ""
    echo "📋 To run migrations:"
    echo "   cd backend"
    echo "   ./scripts/setup_database.sh"
    echo ""
    echo "   OR manually:"
    echo "   psql $DB_URL -f backend/database/migrations/001_initial_schema.sql"
    exit 1
fi

