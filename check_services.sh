#!/bin/bash

# Check if Bria services are running

echo "🔍 Checking Bria services status..."
echo ""

# Check API Gateway
if curl -s http://localhost:8000/api/v1/health > /dev/null 2>&1; then
    echo "✅ API Gateway (port 8000) - RUNNING"
else
    echo "❌ API Gateway (port 8000) - NOT RUNNING"
fi

# Check Ingestion Service
if curl -s http://localhost:8001/health > /dev/null 2>&1; then
    echo "✅ Ingestion Service (port 8001) - RUNNING"
else
    echo "❌ Ingestion Service (port 8001) - NOT RUNNING"
fi

# Check Forecasting Service
if curl -s http://localhost:8002/health > /dev/null 2>&1; then
    echo "✅ Forecasting Service (port 8002) - RUNNING"
else
    echo "❌ Forecasting Service (port 8002) - NOT RUNNING"
fi

# Check Frontend
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend (port 3000) - RUNNING"
else
    echo "❌ Frontend (port 3000) - NOT RUNNING"
fi

echo ""
echo "Process check:"
ps aux | grep -E "(uvicorn|python.*main|node.*start)" | grep -v grep | awk '{print $2, $11, $12, $13, $14}' | head -10

