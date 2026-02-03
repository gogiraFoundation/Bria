#!/bin/bash

# Run Frontend in development mode

cd "$(dirname "$0")/frontend/dashboard"

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install --legacy-peer-deps
fi

echo "🚀 Starting Frontend on http://localhost:3000"
npm start

