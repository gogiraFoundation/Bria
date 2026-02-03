#!/bin/bash

# Clean start - stops all services and starts fresh

echo "🧹 Cleaning up and starting fresh..."

# Stop all services
./stop_services.sh

# Wait a moment
sleep 2

# Verify ports are free
echo ""
echo "Checking ports..."
for port in 8000 8001 8002 3000; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  Port $port still in use, forcing cleanup..."
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    else
        echo "✅ Port $port is free"
    fi
done

sleep 2

echo ""
echo "🚀 Starting all services..."
./run_all.sh

