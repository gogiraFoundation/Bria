#!/bin/bash

# Run Forecasting Service in virtual environment

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

echo "🚀 Starting Forecasting Service on http://localhost:8002"
cd services/forecasting
python main.py

