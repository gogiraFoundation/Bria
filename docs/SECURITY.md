# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Security Features

### Authentication & Authorization
- JWT-based authentication with configurable expiration
- Password hashing using bcrypt
- Role-based access control (RBAC)
- Multi-tenant isolation

### Data Protection
- Parameterized SQL queries (SQL injection protection)
- Input validation using Pydantic models
- CORS configuration
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)

### API Security
- Rate limiting on endpoints
- Request size limits
- HTTPS/TLS recommended for production
- API key management for external services

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** create a public GitHub issue
2. Email security concerns to: security@bria-platform.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue.

## Security Best Practices

### For Developers
- Never commit secrets or API keys
- Use environment variables for sensitive configuration
- Keep dependencies updated
- Review code changes for security implications
- Use parameterized queries (already implemented)

### For Administrators
- Use strong passwords for all services
- Enable HTTPS/TLS in production
- Regularly update dependencies
- Monitor logs for suspicious activity
- Restrict database and Redis access
- Use firewall rules to limit access

### Configuration
- Set `DEBUG=false` in production
- Generate strong JWT_SECRET: `openssl rand -hex 32`
- Configure proper CORS_ORIGINS (remove localhost)
- Use SSL/TLS for database connections
- Enable Redis authentication if exposed

## Known Security Considerations

1. **Local Storage**: Frontend uses localStorage for JWT tokens. Consider httpOnly cookies for enhanced security.
2. **CORS**: Currently allows all methods. Consider restricting to specific methods in production.
3. **Rate Limiting**: Implemented but may need tuning based on usage patterns.
4. **Logging**: Ensure sensitive data is not logged in production.

## Security Updates

Security updates will be released as needed. Subscribe to repository notifications to be alerted of security patches.

