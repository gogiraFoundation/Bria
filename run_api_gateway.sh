#!/bin/bash

# Run API Gateway in virtual environment

cd "$(dirname "$0")/backend"

if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Please run setup_venv.sh first."
    exit 1
fi

source venv/bin/activate

# Set PYTHONPATH to include backend directory
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Load environment variables
if [ -f "../.env" ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

echo "🚀 Starting API Gateway on http://localhost:8000"

# Check if port is already in use
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 8000 is already in use. Freeing it..."
    # Kill all processes using port 8000
    PIDS=$(lsof -ti:8000)
    if [ ! -z "$PIDS" ]; then
        echo "   Killing processes: $PIDS"
        echo $PIDS | xargs kill -9 2>/dev/null || true
        sleep 3
    fi
    # Double check
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "❌ Failed to free port 8000. Please run: ./stop_services.sh"
        exit 1
    fi
    echo "✅ Port 8000 is now free"
fi

cd api-gateway
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

