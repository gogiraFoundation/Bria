# Bria - Renewable Energy Forecasting Platform

Enterprise-grade renewable energy forecasting platform combining meteorological data, physical modeling, and machine learning to predict solar and wind generation with high accuracy.

## Documentation

- **[Production Deployment](./docs/PRODUCTION.md)** - Complete production deployment guide
- **[Security Policy](./docs/SECURITY.md)** - Security best practices and reporting
- **[Contributing](./docs/CONTRIBUTING.md)** - How to contribute to the project
- **[Changelog](./docs/CHANGELOG.md)** - Version history and changes

## Architecture

Bria is built as a microservices-based platform with the following core components:

- **Data Ingestion Layer**: MQTT, HTTP REST, WebSocket, and Modbus TCP support
- **Processing Engine**: Real-time data validation, cleaning, and quality scoring
- **Forecasting Services**: Solar and wind forecasting with ensemble models
- **API Gateway**: RESTful API, GraphQL, and WebSocket support
- **Frontend Dashboard**: React/TypeScript with real-time charts
- **Monitoring**: Prometheus metrics and Grafana dashboards

## Quick Start

### Prerequisites

- **Option 1: Docker** - Docker and Docker Compose (recommended for full stack)
- **Option 2: Virtual Environment** - Python 3.11+, Node.js 18+, PostgreSQL, Redis

### Option 1: Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Bria
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start all services**
   ```bash
   docker compose up -d
   ```

4. **Run database migrations**
   ```bash
   docker compose exec postgres psql -U bria_admin -d bria -f /docker-entrypoint-initdb.d/001_initial_schema.sql
   ```

5. **Access the services**
   - API Gateway: http://localhost:8000
   - API Documentation: http://localhost:8000/api/docs
   - Frontend Dashboard: http://localhost:3000
   - Grafana: http://localhost:3001 (admin/admin)
   - Prometheus: http://localhost:9090

### Option 2: Virtual Environment Setup

1. **Run setup script**
   ```bash
   ./setup_venv.sh
   ```

2. **Install PostgreSQL and Redis** (or use Docker for just these)
   ```bash
   # macOS with Homebrew
   brew install postgresql@15 redis
   brew services start postgresql@15
   brew services start redis
   ```

3. **Initialize database**
   ```bash
   psql -U bria_admin -d bria < backend/database/migrations/001_initial_schema.sql
   ```

4. **Run services**
   ```bash
   # Run all services (opens separate terminals on macOS)
   ./run_all.sh
   
   # Or run individually:
   ./run_api_gateway.sh
   ./run_ingestion.sh
   ./run_forecasting.sh
   ./run_frontend.sh
   ```

5. **Access the services**
   - API Gateway: http://localhost:8000
   - Frontend Dashboard: http://localhost:3000

**See [VENV_SETUP.md](VENV_SETUP.md) for detailed virtual environment setup instructions.**

## Project Structure

```
bria-platform/
├── backend/
│   ├── core/                  # Shared libraries and utilities
│   ├── services/              # Microservices
│   │   ├── ingestion/         # Data ingestion service
│   │   └── forecasting/       # Forecasting service
│   ├── api-gateway/           # Main API entry point
│   └── database/              # Database migrations
├── frontend/
│   └── dashboard/             # React admin dashboard
├── monitoring/                # Prometheus and Grafana configs
├── helm-charts/               # Kubernetes deployment
├── terraform/                 # Infrastructure as Code
└── docker-compose.yml         # Local development environment
```

## Development

### Backend Development

```bash
cd backend/api-gateway
poetry install
poetry run uvicorn main:app --reload
```

### Frontend Development

```bash
cd frontend/dashboard
npm install
npm start
```

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend/dashboard
npm test
```

## API Documentation

Once the API Gateway is running, visit:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- GraphQL Playground: http://localhost:8000/graphql

## Deployment

### Kubernetes Deployment

```bash
cd helm-charts/bria
helm install bria . -f values.yaml
```

### Terraform Deployment

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

## Security

- All API endpoints require authentication via JWT tokens
- Role-based access control (RBAC) is enforced
- All communications use TLS encryption
- Secrets are managed via environment variables or secret management systems

## Monitoring

- **Metrics**: Prometheus at http://localhost:9090
- **Dashboards**: Grafana at http://localhost:3001
- **Logs**: Structured JSON logging to stdout

## License

See LICENSE file for details.

## Support

For issues and questions, please open an issue on the repository.
