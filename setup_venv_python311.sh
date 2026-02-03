#!/bin/bash

# Bria Platform Virtual Environment Setup Script (Python 3.11)

set -e

echo "🚀 Setting up Bria Platform with Python 3.11 Virtual Environment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Python 3.11 is available
if ! command -v python3.11 &> /dev/null; then
    echo -e "${YELLOW}⚠️  Python 3.11 not found. Installing via Homebrew...${NC}"
    if command -v brew &> /dev/null; then
        brew install python@3.11
    else
        echo "❌ Homebrew not found. Please install Python 3.11 manually:"
        echo "   https://www.python.org/downloads/"
        exit 1
    fi
fi

# Use Python 3.11
PYTHON_CMD=python3.11

echo -e "${BLUE}Using $($PYTHON_CMD --version)${NC}"

# Create main virtual environment for backend
echo -e "${BLUE}Creating backend virtual environment...${NC}"
cd backend

# Remove existing venv if it exists
if [ -d "venv" ]; then
    echo -e "${YELLOW}Removing existing virtual environment...${NC}"
    rm -rf venv
fi

$PYTHON_CMD -m venv venv
source venv/bin/activate

# Upgrade pip
echo -e "${BLUE}Upgrading pip...${NC}"
pip install --upgrade pip setuptools wheel

# Install backend dependencies
echo -e "${BLUE}Installing backend dependencies...${NC}"
pip install -r api-gateway/requirements.txt
pip install -r services/ingestion/requirements.txt
pip install -r services/forecasting/requirements.txt

# Install backend as package (for imports) - skip if pyproject.toml has issues
echo -e "${BLUE}Setting up backend package...${NC}"
# Note: pip install -e . is optional and may fail if pyproject.toml is incomplete
# The imports will work with PYTHONPATH set in run scripts

deactivate
cd ..

# Create frontend virtual environment (for Python tools if needed)
echo -e "${BLUE}Setting up frontend...${NC}"
cd frontend/dashboard

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/${NC}"
else
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    npm install
fi

cd ../..

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${BLUE}Creating .env file...${NC}"
    cat > .env << EOF
# Database Configuration
DB_PASSWORD=bria_secure_password_change_in_production
DATABASE_URL=postgresql://bria_admin:bria_secure_password_change_in_production@localhost:5432/bria

# Redis Configuration
REDIS_PASSWORD=bria_redis_password_change_in_production
REDIS_URL=redis://:bria_redis_password_change_in_production@localhost:6379/0

# JWT Configuration
JWT_SECRET=bria_jwt_secret_key_change_in_production_min_32_chars
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# MQTT Configuration
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883

# MLflow Configuration
MLFLOW_TRACKING_URI=http://localhost:5000

# Grafana Configuration
GRAFANA_PASSWORD=admin

# Logging
LOG_LEVEL=INFO

# API Configuration
API_VERSION=v1
API_PREFIX=/api
EOF
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Install PostgreSQL and Redis (or use Docker for just these services)"
echo "2. Run database migrations"
echo "3. Activate virtual environment: cd backend && source venv/bin/activate"
echo "4. Start services using the run scripts"

