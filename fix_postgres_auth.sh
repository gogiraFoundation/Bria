#!/bin/bash

# Fix PostgreSQL authentication to allow local connections without password
# This is safe for local development only

echo "🔧 Configuring PostgreSQL for local development..."

# Find pg_hba.conf
PG_HBA_CONF=""
if [ -f "/opt/homebrew/var/postgresql@15/pg_hba.conf" ]; then
    PG_HBA_CONF="/opt/homebrew/var/postgresql@15/pg_hba.conf"
elif [ -f "/opt/homebrew/var/postgresql/pg_hba.conf" ]; then
    PG_HBA_CONF="/opt/homebrew/var/postgresql/pg_hba.conf"
elif [ -f "/usr/local/var/postgresql@15/pg_hba.conf" ]; then
    PG_HBA_CONF="/usr/local/var/postgresql@15/pg_hba.conf"
else
    echo "❌ Could not find pg_hba.conf"
    echo ""
    echo "Please find it manually:"
    echo "  find /opt/homebrew/var -name pg_hba.conf"
    echo "  find /usr/local/var -name pg_hba.conf"
    exit 1
fi

echo "✅ Found config: $PG_HBA_CONF"

# Backup the original
cp "$PG_HBA_CONF" "${PG_HBA_CONF}.backup"
echo "✅ Created backup: ${PG_HBA_CONF}.backup"

# Check if already configured
if grep -q "^local.*trust" "$PG_HBA_CONF" && grep -q "^host.*127.0.0.1.*trust" "$PG_HBA_CONF"; then
    echo "ℹ️  PostgreSQL is already configured for local trust authentication"
else
    echo "📝 Updating pg_hba.conf..."
    
    # Create a new config with trust for local connections
    cat > "$PG_HBA_CONF" << 'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# "local" is for Unix domain socket connections only
local   all             all                                     trust
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
# IPv6 local connections:
host    all             all             ::1/128                 trust
# Allow replication connections from localhost, by a user with the
# replication privilege.
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
EOF
    
    echo "✅ Updated pg_hba.conf"
fi

# Reload PostgreSQL configuration
echo "🔄 Reloading PostgreSQL configuration..."
if command -v brew > /dev/null 2>&1; then
    brew services restart postgresql@15 2>/dev/null || brew services restart postgresql 2>/dev/null
    sleep 3
else
    echo "⚠️  Please restart PostgreSQL manually:"
    echo "   brew services restart postgresql@15"
fi

# Test connection
echo "🧪 Testing connection..."
sleep 2
if /opt/homebrew/opt/postgresql@15/bin/psql -U $(whoami) -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Connection successful!"
    echo ""
    echo "📝 You can now connect without a password:"
    echo "   /opt/homebrew/opt/postgresql@15/bin/psql -U $(whoami) -d postgres"
    echo ""
    echo "⚠️  WARNING: This configuration allows local connections without passwords."
    echo "   This is safe for local development but NOT for production!"
else
    echo "⚠️  Connection test failed. PostgreSQL may need more time to restart."
    echo "   Try again in a few seconds."
fi

