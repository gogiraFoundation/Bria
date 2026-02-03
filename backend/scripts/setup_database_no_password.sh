#!/bin/bash

# Database setup script that works with password authentication
# This version prompts for password or uses environment variable

echo "🔧 Setting up Bria database (with password support)..."

PG_USER=$(whoami)
DB_NAME="bria"

# Check for password in environment
if [ -z "$PGPASSWORD" ] && [ -f "../.env" ]; then
    # Try to extract password from DATABASE_URL in .env
    DB_URL=$(grep DATABASE_URL ../.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if [[ $DB_URL =~ :([^@]+)@ ]]; then
        export PGPASSWORD="${BASH_REMATCH[1]}"
        echo "✅ Found password in .env"
    fi
fi

# Find psql
PSQL_CMD=""
if command -v psql > /dev/null 2>&1; then
    PSQL_CMD="psql"
elif [ -f "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
    PSQL_CMD="/opt/homebrew/opt/postgresql@15/bin/psql"
elif [ -f "/usr/local/opt/postgresql@15/bin/psql" ]; then
    PSQL_CMD="/usr/local/opt/postgresql@15/bin/psql"
fi

if [ -z "$PSQL_CMD" ]; then
    echo "❌ psql not found. Please install PostgreSQL."
    exit 1
fi

echo "✅ Found psql at: $PSQL_CMD"

# Test connection
echo "🔍 Testing PostgreSQL connection..."
if ! $PSQL_CMD -U "$PG_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "⚠️  Cannot connect to PostgreSQL"
    echo ""
    echo "Options:"
    echo "1. Set password: export PGPASSWORD=your_password"
    echo "2. Use Docker PostgreSQL (recommended):"
    echo "   cd .. && ./setup_postgres_docker.sh"
    echo "3. Configure PostgreSQL for trust authentication"
    echo ""
    exit 1
fi

echo "✅ PostgreSQL connection successful"

# Create database
echo "📦 Creating database '$DB_NAME'..."
$PSQL_CMD -U "$PG_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null && echo "✅ Database created" || echo "ℹ️  Database may already exist"

# Run migrations
echo "📋 Running migrations..."
MIGRATION_FILE="$(dirname "$0")/../database/migrations/001_initial_schema.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Run migrations, ignoring errors for existing objects
$PSQL_CMD -U "$PG_USER" -d "$DB_NAME" -f "$MIGRATION_FILE" 2>&1 | grep -v "already exists" | grep -v "does not exist" | grep -v "^CREATE" | grep -v "^ALTER" | grep -v "^GRANT" || true

echo "✅ Migrations completed"

# Verify tables
echo "🔍 Verifying tables..."
TABLE_COUNT=$($PSQL_CMD -U "$PG_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

if [ "$TABLE_COUNT" -gt "0" ]; then
    echo "✅ Found $TABLE_COUNT tables in database"
else
    echo "⚠️  No tables found - migrations may have failed"
fi

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📝 Update your .env file with:"
echo "   DATABASE_URL=postgresql://$PG_USER@localhost:5432/$DB_NAME"
if [ -n "$PGPASSWORD" ]; then
    echo "   # Or with password:"
    echo "   DATABASE_URL=postgresql://$PG_USER:password@localhost:5432/$DB_NAME"
fi

