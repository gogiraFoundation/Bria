# Production Deployment Guide

## Security Checklist

### 1. Environment Variables
- [ ] Copy `.env.example` to `.env` and configure all required variables
- [ ] Generate a strong JWT_SECRET: `openssl rand -hex 32`
- [ ] Set `DEBUG=false` in production
- [ ] Configure proper CORS_ORIGINS (remove localhost in production)
- [ ] Use strong database passwords
- [ ] Configure Redis password if using authentication

### 2. Database Security
- [ ] Use SSL/TLS for database connections in production
- [ ] Restrict database access to application servers only
- [ ] Enable database backups
- [ ] Use connection pooling (already configured)

### 3. API Security
- [ ] Enable HTTPS/TLS for all API endpoints
- [ ] Configure rate limiting (already implemented)
- [ ] Review and restrict CORS origins
- [ ] Enable request logging and monitoring
- [ ] Set up API key rotation for external services

### 4. Application Security
- [ ] Remove or secure debug endpoints
- [ ] Enable security headers (add middleware)
- [ ] Implement request size limits
- [ ] Enable input validation (Pydantic models already in place)
- [ ] Review and test authentication flows

### 5. Infrastructure
- [ ] Use container orchestration (Docker/Kubernetes)
- [ ] Set up health checks
- [ ] Configure auto-scaling
- [ ] Enable monitoring and alerting
- [ ] Set up log aggregation
- [ ] Configure backup and disaster recovery

## Deployment Steps

### 1. Pre-deployment
```bash
# Run database migrations
python backend/scripts/run_migration.py backend/database/migrations/001_initial_schema.sql
python backend/scripts/run_migration.py backend/database/migrations/002_openweather_storage.sql

# Create admin user
python backend/scripts/create_admin_user.py
```

### 2. Build Docker Images
```bash
# Build API Gateway
cd backend/api-gateway
docker build -t bria-api-gateway:latest .

# Build Forecasting Service
cd ../services/forecasting
docker build -t bria-forecasting:latest .

# Build Frontend
cd ../../frontend/dashboard
docker build -t bria-frontend:latest .
```

### 3. Deploy with Docker Compose
```bash
docker-compose up -d
```

### 4. Verify Deployment
```bash
# Check API health
curl https://your-domain.com/api/v1/health

# Check services
docker-compose ps
```

## Monitoring

### Metrics
- Prometheus metrics available at `/metrics` endpoint
- Key metrics: request count, latency, error rates

### Logging
- Structured JSON logs (when LOG_FORMAT=json)
- Log levels: DEBUG, INFO, WARNING, ERROR

### Health Checks
- API Gateway: `/api/v1/health`
- Database connectivity checked on startup
- Redis connectivity checked on startup

## Performance Tuning

### Database
- Adjust `DB_POOL_SIZE` and `DB_MAX_OVERFLOW` based on load
- Enable connection pooling (already configured)
- Use read replicas for read-heavy workloads

### Caching
- Redis caching enabled for weather data
- Cache TTL configured per data type
- Consider CDN for static frontend assets

### API Gateway
- Rate limiting configured
- Request timeout settings
- CORS properly configured

## Backup and Recovery

### Database Backups
```bash
# PostgreSQL backup
pg_dump -h localhost -U bria_user -d bria > backup.sql

# Restore
psql -h localhost -U bria_user -d bria < backup.sql
```

### Application State
- Database contains all critical state
- Redis cache can be rebuilt
- Frontend is stateless

## Troubleshooting

### Common Issues
1. **Database connection failures**: Check DATABASE_URL and network connectivity
2. **Redis connection failures**: Service degrades gracefully, check REDIS_URL
3. **OpenWeather API limits**: Monitor API usage, upgrade plan if needed
4. **High memory usage**: Adjust connection pool sizes, enable caching

### Logs
```bash
# View API Gateway logs
docker-compose logs -f api-gateway

# View all services
docker-compose logs -f
```

## Security Updates

- Regularly update dependencies: `pip install --upgrade -r requirements.txt`
- Monitor security advisories for Python packages
- Keep Docker images updated
- Review and update API keys periodically

