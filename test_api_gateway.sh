#!/bin/bash

# Test API Gateway startup

cd "$(dirname "$0")/backend"

if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found"
    exit 1
fi

source venv/bin/activate
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Load environment variables
if [ -f "../.env" ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

echo "Testing imports..."
cd api-gateway

# Test imports
python -c "
import sys
from pathlib import Path
backend_dir = Path('.').parent.parent
sys.path.insert(0, str(backend_dir))
try:
    from core.config import get_settings
    from core.logging import get_logger
    print('✅ Core imports OK')
except Exception as e:
    print(f'❌ Core import error: {e}')
    sys.exit(1)

try:
    import main
    print('✅ Main module imports OK')
except Exception as e:
    print(f'❌ Main import error: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All imports successful!"
    echo "You can now run: ./run_api_gateway.sh"
else
    echo ""
    echo "❌ Import errors found. Please fix them first."
fi

