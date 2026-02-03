#!/bin/bash

# Quick PostgreSQL setup using Docker
# This is the easiest way to get PostgreSQL running

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

# Check if port 5432 or 5433 is in use
PORT_TO_USE=5432
if lsof -i :5432 > /dev/null 2>&1; then
    echo "⚠️  Port 5432 is already in use (likely by local PostgreSQL)"
    echo "🛑 Stopping local PostgreSQL service..."
    brew services stop postgresql@15 2>/dev/null || brew services stop postgresql 2>/dev/null || true
    sleep 2
    
    # Check again
    if lsof -i :5432 > /dev/null 2>&1; then
        echo "⚠️  Port 5432 still in use, using port 5433 instead"
        PORT_TO_USE=5433
    else
        echo "✅ Port 5432 is now free"
    fi
fi

# Stop and remove existing container if it exists
docker stop bria-postgres 2>/dev/null || true
docker rm bria-postgres 2>/dev/null || true

# Start PostgreSQL container
echo "📦 Starting PostgreSQL container on port $PORT_TO_USE..."
docker run -d \
  --name bria-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=bria \
  -e POSTGRES_USER=postgres \
  -p $PORT_TO_USE:5432 \
  postgres:15

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Wait for PostgreSQL to be ready
for i in {1..30}; do
    if docker exec bria-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    echo "   Waiting... ($i/30)"
    sleep 1
done

# Run migrations
echo "📋 Running database migrations..."
cd backend
docker exec -i bria-postgres psql -U postgres -d bria < database/migrations/001_initial_schema.sql

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed"
else
    echo "⚠️  Some migrations may have failed (tables might already exist)"
fi

# Update .env file
cd ..
if [ -f .env ]; then
    # Check if DATABASE_URL already exists
    if grep -q "^DATABASE_URL=" .env; then
        # Update existing DATABASE_URL
        DB_URL="postgresql://postgres:postgres@localhost:$PORT_TO_USE/bria"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
        else
            # Linux
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
        fi
        echo "✅ Updated DATABASE_URL in .env to port $PORT_TO_USE"
    else
        # Add DATABASE_URL
        echo "" >> .env
        echo "DATABASE_URL=postgresql://postgres:postgres@localhost:$PORT_TO_USE/bria" >> .env
        echo "✅ Added DATABASE_URL to .env (port $PORT_TO_USE)"
    fi
else
    echo "⚠️  .env file not found. Please add:"
    echo "   DATABASE_URL=postgresql://postgres:postgres@localhost:$PORT_TO_USE/bria"
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
echo "   python3 scripts/create_admin_user.py"
echo ""
echo "💡 To stop PostgreSQL: docker stop bria-postgres"
echo "💡 To start again: docker start bria-postgres"

