#!/bin/bash

# Quick fix for database connection issues

echo "🔧 Fixing Bria database connection..."

PG_USER=$(whoami)
DB_NAME="bria"
DB_USER="bria_admin"
DB_PASSWORD="bria_secure_password_change_in_production"

# Check if PostgreSQL is running
if ! pg_isready -U "$PG_USER" > /dev/null 2>&1; then
    echo "⚠️  PostgreSQL is not running. Starting it..."
    brew services start postgresql@15
    sleep 3
fi

# Create database if it doesn't exist
echo "📦 Creating database..."
createdb -U "$PG_USER" "$DB_NAME" 2>/dev/null || echo "Database may already exist"

# Create or update user
echo "👤 Creating/updating user..."
psql -U "$PG_USER" -d postgres <<EOF 2>/dev/null
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    ELSE
        ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

# Grant schema permissions
echo "🔐 Granting permissions..."
psql -U "$PG_USER" -d "$DB_NAME" <<EOF 2>/dev/null
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
EOF

# Run migrations if tables don't exist
echo "📋 Checking migrations..."
TABLE_COUNT=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

if [ "$TABLE_COUNT" = "0" ] || [ -z "$TABLE_COUNT" ]; then
    echo "📝 Running migrations..."
    psql -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/../database/migrations/001_initial_schema.sql" 2>&1 | grep -v "already exists" | grep -v "does not exist" || true
fi

# Test connection
echo "🧪 Testing connection..."
if psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Database connection successful!"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Create admin user: python scripts/create_admin_user.py"
    echo "  2. Restart API Gateway"
else
    echo "❌ Connection test failed"
    echo ""
    echo "💡 Alternative: Use your own PostgreSQL user"
    echo "   Update .env: DATABASE_URL=postgresql://$PG_USER@localhost:5432/$DB_NAME"
    exit 1
fi


