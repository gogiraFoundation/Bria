#!/bin/bash

# Simple script to start the Bria app

echo "🚀 Starting Bria Platform..."
echo ""

# Check PostgreSQL
if brew services list | grep -q "postgresql@15.*started"; then
    echo "✅ PostgreSQL is running"
else
    echo "⚠️  Starting PostgreSQL..."
    brew services start postgresql@15
    sleep 3
fi

# Check Redis
if brew services list | grep -q "redis.*started"; then
    echo "✅ Redis is running"
else
    echo "⚠️  Starting Redis..."
    brew services start redis
    sleep 2
fi

# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js is installed ($(node --version))"
else
    echo "❌ Node.js not found. Please install: brew install node"
    exit 1
fi

echo ""
echo "📦 Starting all services..."
echo ""

# Start all services
./run_all.sh

echo ""
echo "⏳ Waiting for services to start..."
sleep 5

echo ""
echo "🔍 Checking service status..."
./check_services.sh

echo ""
echo "✅ Done! Services should be starting in separate terminal windows."
echo ""
echo "Access points:"
echo "  - API Gateway: http://localhost:8000"
echo "  - API Docs: http://localhost:8000/api/docs"
echo "  - Frontend: http://localhost:3000"

