#!/bin/bash

# Simple database setup using current user's PostgreSQL access
# This script assumes PostgreSQL is running and accessible by the current user

echo "🔧 Setting up Bria database (simple method)..."

PG_USER=$(whoami)
DB_NAME="bria"

# Check if PostgreSQL is running
if ! pg_isready -U "$PG_USER" > /dev/null 2>&1; then
    echo "⚠️  PostgreSQL is not running. Attempting to start..."
    if command -v brew > /dev/null 2>&1; then
        brew services start postgresql@15 || brew services start postgresql
        sleep 3
    else
        echo "❌ Please start PostgreSQL manually and run this script again"
        exit 1
    fi
fi

# Create database if it doesn't exist
echo "📦 Creating database '$DB_NAME'..."
createdb -U "$PG_USER" "$DB_NAME" 2>/dev/null && echo "✅ Database created" || echo "ℹ️  Database may already exist"

# Run migrations
echo "📋 Running migrations..."
MIGRATION_FILE="$(dirname "$0")/../database/migrations/001_initial_schema.sql"

if [ -f "$MIGRATION_FILE" ]; then
    psql -U "$PG_USER" -d "$DB_NAME" -f "$MIGRATION_FILE" 2>&1 | grep -v "already exists" | grep -v "does not exist" | grep -v "^CREATE" | grep -v "^ALTER" || true
    echo "✅ Migrations completed"
else
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Create admin user
echo "👤 Creating admin user..."
python3 "$(dirname "$0")/create_admin_user.py" 2>&1 || echo "⚠️  Admin user creation failed (may already exist)"

# Test connection
echo "🧪 Testing connection..."
if psql -U "$PG_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo ""
    echo "✅ Database setup complete!"
    echo ""
    echo "📝 Update your .env file with:"
    echo "   DATABASE_URL=postgresql://$PG_USER@localhost:5432/$DB_NAME"
    echo ""
    echo "💡 Default admin credentials:"
    echo "   Email: admin@bria.com"
    echo "   Password: admin123"
else
    echo "❌ Connection test failed"
    exit 1
fi

