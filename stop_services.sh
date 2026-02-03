#!/bin/bash

# Stop all Bria services

echo "🛑 Stopping all Bria services..."

# Find and kill uvicorn processes
pkill -f "uvicorn.*main:app" && echo "✅ Stopped API services"

# Find and kill Python services
pkill -f "python.*main.py" && echo "✅ Stopped Python services"

# Find and kill frontend
pkill -f "node.*start" && echo "✅ Stopped Frontend"

# Kill processes on specific ports
lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "✅ Freed port 8000"
lsof -ti:8001 | xargs kill -9 2>/dev/null && echo "✅ Freed port 8001"
lsof -ti:8002 | xargs kill -9 2>/dev/null && echo "✅ Freed port 8002"
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "✅ Freed port 3000"

echo ""
echo "✅ All services stopped"

