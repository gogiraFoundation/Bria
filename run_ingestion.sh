#!/bin/bash

# Run Ingestion Service in virtual environment

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Find and activate virtual environment
if [ -d "backend/venv" ]; then
    VENV_PATH="backend/venv"
elif [ -d "venv" ]; then
    VENV_PATH="venv"
else
    echo "❌ Virtual environment not found. Please run setup_venv.sh first."
    exit 1
fi

source "$VENV_PATH/bin/activate"

# Set PYTHONPATH to include backend directory
export PYTHONPATH="${PYTHONPATH}:$SCRIPT_DIR/backend"

# Load environment variables
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

# Kill any process using port 8001
if lsof -ti :8001 > /dev/null 2>&1; then
    echo "🛑 Freeing port 8001..."
    kill -9 $(lsof -ti :8001) 2>/dev/null || true
    sleep 1
fi

echo "🚀 Starting Ingestion Service on http://localhost:8001"
cd backend/services/ingestion
python main.py

