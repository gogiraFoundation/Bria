#!/bin/bash

# Database setup script for Bria
# This script handles PostgreSQL setup even if psql is not in PATH

echo "🔧 Setting up Bria database..."

PG_USER=$(whoami)
DB_NAME="bria"

# Find psql
PSQL_CMD=""
if command -v psql > /dev/null 2>&1; then
    PSQL_CMD="psql"
elif [ -f "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
    PSQL_CMD="/opt/homebrew/opt/postgresql@15/bin/psql"
elif [ -f "/usr/local/opt/postgresql@15/bin/psql" ]; then
    PSQL_CMD="/usr/local/opt/postgresql@15/bin/psql"
elif [ -f "/opt/homebrew/opt/postgresql/bin/psql" ]; then
    PSQL_CMD="/opt/homebrew/opt/postgresql/bin/psql"
else
    echo "❌ psql not found. Please install PostgreSQL or add it to PATH."
    exit 1
fi

echo "✅ Found psql at: $PSQL_CMD"

# Find createdb
CREATEDB_CMD=""
if command -v createdb > /dev/null 2>&1; then
    CREATEDB_CMD="createdb"
elif [ -f "/opt/homebrew/opt/postgresql@15/bin/createdb" ]; then
    CREATEDB_CMD="/opt/homebrew/opt/postgresql@15/bin/createdb"
elif [ -f "/usr/local/opt/postgresql@15/bin/createdb" ]; then
    CREATEDB_CMD="/usr/local/opt/postgresql@15/bin/createdb"
elif [ -f "/opt/homebrew/opt/postgresql/bin/createdb" ]; then
    CREATEDB_CMD="/opt/homebrew/opt/postgresql/bin/createdb"
fi

# Check if PostgreSQL is running
echo "🔍 Checking PostgreSQL status..."
if ! $PSQL_CMD -U "$PG_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "⚠️  PostgreSQL is not running or not accessible."
    echo ""
    echo "Attempting to start PostgreSQL..."
    
    # Try to start via brew services
    if command -v brew > /dev/null 2>&1; then
        # Stop any existing service first
        brew services stop postgresql@15 2>/dev/null || true
        brew services stop postgresql 2>/dev/null || true
        
        # Start PostgreSQL
        if brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null; then
            echo "⏳ Waiting for PostgreSQL to start..."
            sleep 5
        else
            echo "❌ Failed to start PostgreSQL via brew services"
            echo ""
            echo "Please start PostgreSQL manually:"
            echo "  brew services start postgresql@15"
            echo "  # OR"
            echo "  /opt/homebrew/opt/postgresql@15/bin/postgres -D /opt/homebrew/var/postgresql@15"
            exit 1
        fi
    else
        echo "❌ Please start PostgreSQL manually"
        exit 1
    fi
fi

# Test connection
if ! $PSQL_CMD -U "$PG_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ Cannot connect to PostgreSQL"
    echo ""
    echo "Try connecting manually:"
    echo "  $PSQL_CMD -U $PG_USER -d postgres"
    exit 1
fi

echo "✅ PostgreSQL is running"

# Create database if it doesn't exist
echo "📦 Creating database '$DB_NAME'..."
if [ -n "$CREATEDB_CMD" ]; then
    $CREATEDB_CMD -U "$PG_USER" "$DB_NAME" 2>/dev/null && echo "✅ Database created" || echo "ℹ️  Database may already exist"
else
    $PSQL_CMD -U "$PG_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null && echo "✅ Database created" || echo "ℹ️  Database may already exist"
fi

# Run migrations
echo "📋 Running migrations..."
MIGRATION_FILE="$(dirname "$0")/../database/migrations/001_initial_schema.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

$PSQL_CMD -U "$PG_USER" -d "$DB_NAME" -f "$MIGRATION_FILE" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Migrations completed"
else
    echo "⚠️  Some migrations may have failed (tables might already exist)"
fi

# Get database URL for .env
DB_URL="postgresql://$PG_USER@localhost:5432/$DB_NAME"

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📝 Add or update this in your .env file:"
echo "   DATABASE_URL=$DB_URL"
echo ""
echo "👤 Next step: Create admin user"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   python3 scripts/create_admin_user.py"
echo ""
