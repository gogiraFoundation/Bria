#!/bin/bash

# Run all services in separate terminal windows/tabs

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting all Bria services..."
echo ""
echo "This will open multiple terminal windows/tabs for each service."
echo "Press Ctrl+C to stop all services."
echo ""

# Function to open new terminal window and run command (macOS)
open_terminal() {
    osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR' && $1\""
}

# Check if we're on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 Detected macOS - opening new terminal windows..."
    
    open_terminal "./run_api_gateway.sh"
    sleep 2
    
    open_terminal "./run_ingestion.sh"
    sleep 2
    
    open_terminal "./run_forecasting.sh"
    sleep 2
    
    open_terminal "./run_frontend.sh"
    
    echo ""
    echo "✅ All services started in separate terminal windows"
    echo ""
    echo "Services:"
    echo "  - API Gateway: http://localhost:8000"
    echo "  - Ingestion: http://localhost:8001"
    echo "  - Forecasting: http://localhost:8002"
    echo "  - Frontend: http://localhost:3000"
else
    echo "⚠️  This script is optimized for macOS."
    echo "Please run each service manually in separate terminals:"
    echo "  Terminal 1: ./run_api_gateway.sh"
    echo "  Terminal 2: ./run_ingestion.sh"
    echo "  Terminal 3: ./run_forecasting.sh"
    echo "  Terminal 4: ./run_frontend.sh"
fi

